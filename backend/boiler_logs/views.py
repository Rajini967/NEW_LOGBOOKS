from django.utils import timezone
from django.db.models import Sum, Avg
from datetime import datetime
import calendar
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from core.log_slot_utils import get_interval_for_equipment, get_slot_range
from .models import BoilerLog, BoilerEquipmentLimit, BoilerDashboardConfig
from .serializers import BoilerLogSerializer, BoilerEquipmentLimitSerializer
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrManager
from reports.utils import log_limit_change


def _validate_boiler_daily_limits(
    equipment_id: str,
    log_date,
    *,
    power_kwh: float = 0,
    water_liters: float = 0,
    chemical_kg: float = 0,
    diesel_liters: float = 0,
    furnace_oil_liters: float = 0,
    brigade_kg: float = 0,
    steam_kg_hr: float = 0,
    exclude_log_id=None,
) -> tuple[bool, list]:
    """
    Check that adding this entry would not exceed daily limits for the equipment.
    Returns (True, []) if ok, (False, [error_messages]) if any limit exceeded.
    """
    limit = BoilerEquipmentLimit.objects.filter(equipment_id=equipment_id).first()
    if not limit:
        return True, []

    base_qs = BoilerLog.objects.filter(equipment_id=equipment_id, timestamp__date=log_date)
    if exclude_log_id is not None:
        base_qs = base_qs.exclude(pk=exclude_log_id)

    agg = base_qs.aggregate(
        power=Sum('daily_power_consumption_kwh'),
        water=Sum('daily_water_consumption_liters'),
        chemical=Sum('daily_chemical_consumption_kg'),
        diesel=Sum('daily_diesel_consumption_liters'),
        furnace_oil=Sum('daily_furnace_oil_consumption_liters'),
        brigade=Sum('daily_brigade_consumption_kg'),
        steam=Sum('steam_consumption_kg_hr'),
    )
    total_power = (agg['power'] or 0) + (power_kwh or 0)
    total_water = (agg['water'] or 0) + (water_liters or 0)
    total_chemical = (agg['chemical'] or 0) + (chemical_kg or 0)
    total_diesel = (agg['diesel'] or 0) + (diesel_liters or 0)
    total_furnace_oil = (agg['furnace_oil'] or 0) + (furnace_oil_liters or 0)
    total_brigade = (agg['brigade'] or 0) + (brigade_kg or 0)
    total_steam = (agg['steam'] or 0) + (steam_kg_hr or 0)

    errors = []
    if limit.daily_power_limit_kw is not None and total_power > limit.daily_power_limit_kw:
        errors.append(f"Daily power limit ({limit.daily_power_limit_kw} kWh) exceeded for this boiler.")
    if limit.daily_water_limit_liters is not None and total_water > limit.daily_water_limit_liters:
        errors.append("Daily water consumption limit exceeded for this boiler.")
    if limit.daily_chemical_limit_kg is not None and total_chemical > limit.daily_chemical_limit_kg:
        errors.append("Daily chemical consumption limit exceeded for this boiler.")
    if getattr(limit, 'daily_diesel_limit_liters', None) is not None and total_diesel > limit.daily_diesel_limit_liters:
        errors.append("Daily diesel consumption limit exceeded for this boiler.")
    if getattr(limit, 'daily_furnace_oil_limit_liters', None) is not None and total_furnace_oil > limit.daily_furnace_oil_limit_liters:
        errors.append("Daily furnace oil consumption limit exceeded for this boiler.")
    if getattr(limit, 'daily_brigade_limit_kg', None) is not None and total_brigade > limit.daily_brigade_limit_kg:
        errors.append("Daily brigade consumption limit exceeded for this boiler.")
    if getattr(limit, 'daily_steam_limit_kg_hr', None) is not None and total_steam > limit.daily_steam_limit_kg_hr:
        errors.append("Steam consumption limit exceeded for this boiler.")
    if errors:
        return False, errors
    return True, []


class BoilerLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing boiler logs."""
    permission_classes = [IsAuthenticated]
    serializer_class = BoilerLogSerializer
    queryset = BoilerLog.objects.all()
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action != 'list':
            return qs
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        equipment_id = self.request.query_params.get('equipment_id')
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        if date_from:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(timestamp__gte=dt)
            except (ValueError, TypeError):
                pass
        if date_to:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(timestamp__lte=dt)
            except (ValueError, TypeError):
                pass
        return qs.order_by('timestamp')

    def perform_create(self, serializer):
        """Set operator when creating a log."""
        validated = serializer.validated_data
        equipment_id = validated.get('equipment_id')
        timestamp = validated.get('timestamp') or timezone.now()
        interval, shift_hours = get_interval_for_equipment(equipment_id or '', 'boiler')
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if BoilerLog.objects.filter(
            equipment_id=equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        log_date = (timestamp or timezone.now()).date()
        ok, limit_errors = _validate_boiler_daily_limits(
            equipment_id=equipment_id,
            log_date=log_date,
            power_kwh=validated.get('daily_power_consumption_kwh') or 0,
            water_liters=validated.get('daily_water_consumption_liters') or 0,
            chemical_kg=validated.get('daily_chemical_consumption_kg') or 0,
            diesel_liters=validated.get('daily_diesel_consumption_liters') or 0,
            furnace_oil_liters=validated.get('daily_furnace_oil_consumption_liters') or 0,
            brigade_kg=validated.get('daily_brigade_consumption_kg') or 0,
            steam_kg_hr=validated.get('steam_consumption_kg_hr') or 0,
        )
        if not ok:
            raise ValidationError({'detail': limit_errors})
        serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )

    def perform_update(self, serializer):
        """Validate daily limits before saving update."""
        instance = serializer.instance
        validated = serializer.validated_data
        log_date = (instance.timestamp or timezone.now()).date()

        def _get(field, default=None):
            return validated.get(field) if field in validated else getattr(instance, field, default)

        ok, limit_errors = _validate_boiler_daily_limits(
            equipment_id=instance.equipment_id,
            log_date=log_date,
            power_kwh=_get('daily_power_consumption_kwh') or 0,
            water_liters=_get('daily_water_consumption_liters') or 0,
            chemical_kg=_get('daily_chemical_consumption_kg') or 0,
            diesel_liters=_get('daily_diesel_consumption_liters') or 0,
            furnace_oil_liters=_get('daily_furnace_oil_consumption_liters') or 0,
            brigade_kg=_get('daily_brigade_consumption_kg') or 0,
            steam_kg_hr=_get('steam_consumption_kg_hr') or 0,
            exclude_log_id=instance.id,
        )
        if not ok:
            raise ValidationError({'detail': limit_errors})
        serializer.save()

    def update(self, request, *args, **kwargs):
        """
        Record boiler reading changes in the audit trail on update.
        """
        instance = self.get_object()
        tracked_fields = [
            'feed_water_temp',
            'oil_temp',
            'steam_temp',
            'steam_pressure',
            'steam_flow_lph',
            'fo_hsd_ng_day_tank_level',
            'feed_water_tank_level',
            'fo_pre_heater_temp',
            'burner_oil_pressure',
            'burner_heater_temp',
            'boiler_steam_pressure',
            'stack_temperature',
            'steam_pressure_after_prv',
            'feed_water_hardness_ppm',
            'feed_water_tds_ppm',
            'fo_hsd_ng_consumption',
            'mobrey_functioning',
            'manual_blowdown_time',
            'diesel_stock_liters', 'diesel_cost_rupees',
            'furnace_oil_stock_liters', 'furnace_oil_cost_rupees',
            'brigade_stock_kg', 'brigade_cost_rupees',
            'daily_power_consumption_kwh', 'daily_water_consumption_liters', 'daily_chemical_consumption_kg',
            'daily_diesel_consumption_liters', 'daily_furnace_oil_consumption_liters', 'daily_brigade_consumption_kg',
            'steam_consumption_kg_hr',
            'timestamp',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        updated = self.get_object()
        user = request.user
        from django.utils import timezone

        extra_base = {
            "equipment_id": updated.equipment_id,
            "site_id": updated.site_id,
            "timestamp": timezone.localtime(updated.timestamp).isoformat() if updated.timestamp else None,
        }

        for field in tracked_fields:
            before = old_values.get(field)
            after = getattr(updated, field)
            if before == after:
                continue
            extra = dict(extra_base)
            extra["field_label"] = field
            log_limit_change(
                user=user,
                object_type="boiler_log",
                key=str(updated.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_update",
            )

        # When a rejected log is corrected (updated), move to pending secondary approval
        if instance.status == 'rejected':
            updated.status = 'pending_secondary_approval'
            updated.save(update_fields=['status'])

        return response

    def partial_update(self, request, *args, **kwargs):
        """
        Record boiler reading changes in the audit trail on partial update.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='dashboard_summary')
    def dashboard_summary(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_id=...
        Returns actual/limit power, oil, steam, efficiency, optional projected and cost.
        """
        period_type = (request.query_params.get('period_type') or 'day').lower()
        if period_type not in ('day', 'month', 'year'):
            return Response({'error': 'period_type must be day, month, or year'}, status=status.HTTP_400_BAD_REQUEST)
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ref_date = datetime.strptime(date_str.strip()[:10], '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'date must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        equipment_id = request.query_params.get('equipment_id', '').strip() or None

        if period_type == 'day':
            period_start = timezone.make_aware(datetime.combine(ref_date, datetime.min.time()))
            period_end = timezone.make_aware(datetime.combine(ref_date, datetime.max.time().replace(microsecond=999999)))
            days_in_period = 1
        elif period_type == 'month':
            _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
            period_start = timezone.make_aware(datetime(ref_date.year, ref_date.month, 1))
            period_end = timezone.make_aware(datetime(ref_date.year, ref_date.month, last_day, 23, 59, 59, 999999))
            days_in_period = last_day
        else:
            period_start = timezone.make_aware(datetime(ref_date.year, 1, 1))
            period_end = timezone.make_aware(datetime(ref_date.year, 12, 31, 23, 59, 59, 999999))
            days_in_period = 366 if calendar.isleap(ref_date.year) else 365

        qs = BoilerLog.objects.filter(timestamp__gte=period_start, timestamp__lte=period_end)
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)

        agg = qs.aggregate(
            power=Sum('daily_power_consumption_kwh'),
            diesel=Sum('daily_diesel_consumption_liters'),
            furnace_oil=Sum('daily_furnace_oil_consumption_liters'),
            brigade=Sum('daily_brigade_consumption_kg'),
            steam_hr=Sum('steam_consumption_kg_hr'),
            steam_lph=Sum('steam_flow_lph'),
        )
        actual_power_kwh = float(agg['power'] or 0)
        actual_diesel = float(agg['diesel'] or 0)
        actual_furnace_oil = float(agg['furnace_oil'] or 0)
        actual_brigade = float(agg['brigade'] or 0)
        actual_oil_liters = actual_diesel + actual_furnace_oil
        actual_steam_kg_hr = float(agg['steam_hr'] or 0)
        if actual_steam_kg_hr == 0 and (agg['steam_lph'] or 0) != 0:
            actual_steam_kg_hr = float(agg['steam_lph'] or 0)

        equipment_ids_in_logs = list(qs.values_list('equipment_id', flat=True).distinct())
        if equipment_id:
            limit_equipment_ids = [equipment_id] if (equipment_ids_in_logs or equipment_id) else []
        else:
            limit_equipment_ids = list(BoilerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())
            if equipment_ids_in_logs:
                limit_equipment_ids = list(set(limit_equipment_ids) | set(equipment_ids_in_logs))

        limit_power_kwh = 0.0
        limit_diesel = 0.0
        limit_furnace_oil = 0.0
        limit_brigade = 0.0
        limit_steam_kg_hr = 0.0
        by_equipment = []
        for eid in limit_equipment_ids:
            limit_row = BoilerEquipmentLimit.objects.filter(equipment_id=eid).first()
            daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
            limit_power_kwh += daily_kw * days_in_period
            limit_diesel += (getattr(limit_row, 'daily_diesel_limit_liters', None) or 0) * days_in_period if limit_row else 0
            limit_furnace_oil += (getattr(limit_row, 'daily_furnace_oil_limit_liters', None) or 0) * days_in_period if limit_row else 0
            limit_brigade += (getattr(limit_row, 'daily_brigade_limit_kg', None) or 0) * days_in_period if limit_row else 0
            limit_steam_kg_hr += (getattr(limit_row, 'daily_steam_limit_kg_hr', None) or 0) * days_in_period * 24 if limit_row else 0
            eq_agg = BoilerLog.objects.filter(equipment_id=eid, timestamp__gte=period_start, timestamp__lte=period_end).aggregate(
                p=Sum('daily_power_consumption_kwh'),
            )
            by_equipment.append({
                'equipment_id': eid,
                'actual_power_kwh': round(float(eq_agg['p'] or 0), 2),
                'limit_power_kwh': round(daily_kw * days_in_period, 2),
            })
        limit_power_kwh = round(limit_power_kwh, 2)
        limit_oil_liters = round(limit_diesel + limit_furnace_oil, 2)

        total_oil_liters = actual_diesel + actual_furnace_oil
        efficiency_ratio = (actual_steam_kg_hr / total_oil_liters) if total_oil_liters and total_oil_liters > 0 else None

        config = BoilerDashboardConfig.objects.first()
        projected_power_kwh = None
        actual_cost_rs = None
        projected_cost_rs = None
        if config and config.projected_power_kwh_month is not None:
            if period_type == 'month':
                projected_power_kwh = config.projected_power_kwh_month
            elif period_type == 'day':
                _, month_days = calendar.monthrange(ref_date.year, ref_date.month)
                projected_power_kwh = config.projected_power_kwh_month / month_days
            else:
                projected_power_kwh = config.projected_power_kwh_month * 12
            projected_power_kwh = round(projected_power_kwh, 2)

        rate_limit = BoilerEquipmentLimit.objects.filter(equipment_id=equipment_ids_in_logs[0] if equipment_ids_in_logs else None).first() or BoilerEquipmentLimit.objects.first()
        if rate_limit:
            power_rate = getattr(rate_limit, 'electricity_rate_rs_per_kwh', None) or 0
            diesel_rate = getattr(rate_limit, 'diesel_rate_rs_per_liter', None) or 0
            fo_rate = getattr(rate_limit, 'furnace_oil_rate_rs_per_liter', None) or 0
            brigade_rate = getattr(rate_limit, 'brigade_rate_rs_per_kg', None) or 0
            actual_cost_rs = round(
                actual_power_kwh * power_rate
                + actual_diesel * diesel_rate
                + actual_furnace_oil * fo_rate
                + actual_brigade * brigade_rate,
                2,
            )
        if config and config.projected_oil_cost_rs_month is not None and projected_power_kwh is not None and rate_limit:
            power_rate = getattr(rate_limit, 'electricity_rate_rs_per_kwh', None) or 0
            proj_power_cost = projected_power_kwh * power_rate
            if period_type == 'month':
                proj_oil = config.projected_oil_cost_rs_month
            elif period_type == 'day':
                _, month_days = calendar.monthrange(ref_date.year, ref_date.month)
                proj_oil = config.projected_oil_cost_rs_month / month_days
            else:
                proj_oil = config.projected_oil_cost_rs_month * 12
            projected_cost_rs = round(proj_power_cost + proj_oil, 2)

        payload = {
            'period_type': period_type,
            'period_start': period_start.date().isoformat(),
            'period_end': period_end.date().isoformat(),
            'days_in_period': days_in_period,
            'actual_power_kwh': round(actual_power_kwh, 2),
            'limit_power_kwh': limit_power_kwh,
            'actual_oil_liters': round(actual_oil_liters, 2),
            'limit_oil_liters': limit_oil_liters,
            'actual_steam_kg_hr': round(actual_steam_kg_hr, 2),
            'limit_steam_kg_hr': round(limit_steam_kg_hr, 2),
            'efficiency_ratio': round(efficiency_ratio, 4) if efficiency_ratio is not None else None,
            'by_equipment': by_equipment,
        }
        if projected_power_kwh is not None:
            payload['projected_power_kwh'] = projected_power_kwh
        if actual_cost_rs is not None:
            payload['actual_cost_rs'] = actual_cost_rs
        if projected_cost_rs is not None:
            payload['projected_cost_rs'] = projected_cost_rs
        utilization_pct = (actual_power_kwh / limit_power_kwh * 100) if limit_power_kwh > 0 else None
        payload['utilization_pct'] = round(utilization_pct, 2) if utilization_pct is not None else None
        payload['kwh_per_day'] = round(actual_power_kwh / days_in_period, 2) if days_in_period else 0
        return Response(payload)

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """
        Create a new boiler log entry as a correction of a rejected or pending-secondary-approval log.
        """
        original = self.get_object()
        if original.status not in ('rejected', 'pending_secondary_approval'):
            return Response(
                {'error': 'Only rejected or pending secondary approval entries can be corrected as new entries.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        timestamp = validated.pop('timestamp', None)

        payload = {
            **validated,
            'corrects': original,
            'operator': request.user,
            'operator_name': request.user.name or request.user.email,
            'equipment_id': original.equipment_id,
            'site_id': original.site_id,
            'status': 'pending_secondary_approval',
        }
        if timestamp is not None:
            payload['timestamp'] = timestamp

        # Duplicate check: allow only if the only entry in this slot is the one being corrected
        check_ts = payload.get('timestamp') or timezone.now()
        interval, shift_hours = get_interval_for_equipment(original.equipment_id or '', 'boiler')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        if BoilerLog.objects.filter(
            equipment_id=original.equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exclude(pk=original.pk).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        log_date = (payload.get('timestamp') or timezone.now()).date()
        ok, limit_errors = _validate_boiler_daily_limits(
            equipment_id=original.equipment_id,
            log_date=log_date,
            power_kwh=payload.get('daily_power_consumption_kwh') or 0,
            water_liters=payload.get('daily_water_consumption_liters') or 0,
            chemical_kg=payload.get('daily_chemical_consumption_kg') or 0,
            diesel_liters=payload.get('daily_diesel_consumption_liters') or 0,
            furnace_oil_liters=payload.get('daily_furnace_oil_consumption_liters') or 0,
            brigade_kg=payload.get('daily_brigade_consumption_kg') or 0,
            steam_kg_hr=payload.get('steam_consumption_kg_hr') or 0,
            exclude_log_id=original.id,
        )
        if not ok:
            raise ValidationError({'detail': limit_errors})

        new_log = BoilerLog.objects.create(**payload)

        tracked_fields = [
            'feed_water_temp',
            'oil_temp',
            'steam_temp',
            'steam_pressure',
            'steam_flow_lph',
            'fo_hsd_ng_day_tank_level',
            'feed_water_tank_level',
            'fo_pre_heater_temp',
            'burner_oil_pressure',
            'burner_heater_temp',
            'boiler_steam_pressure',
            'stack_temperature',
            'steam_pressure_after_prv',
            'feed_water_hardness_ppm',
            'feed_water_tds_ppm',
            'fo_hsd_ng_consumption',
            'mobrey_functioning',
            'manual_blowdown_time',
            'diesel_stock_liters', 'diesel_cost_rupees',
            'furnace_oil_stock_liters', 'furnace_oil_cost_rupees',
            'brigade_stock_kg', 'brigade_cost_rupees',
            'daily_power_consumption_kwh', 'daily_water_consumption_liters', 'daily_chemical_consumption_kg',
            'daily_diesel_consumption_liters', 'daily_furnace_oil_consumption_liters', 'daily_brigade_consumption_kg',
            'steam_consumption_kg_hr',
            'remarks',
            'comment',
            'status',
            'timestamp',
        ]
        extra_base = {
            "equipment_id": original.equipment_id,
            "site_id": original.site_id,
            "original_id": str(original.id),
            "correction_id": str(new_log.id),
        }
        for field in tracked_fields:
            before = getattr(original, field)
            after = getattr(new_log, field)
            if before == after:
                continue
            extra = dict(extra_base)
            extra["field_label"] = field
            log_limit_change(
                user=request.user,
                object_type="boiler_log",
                key=str(new_log.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_correction",
            )

        serializer = self.get_serializer(new_log)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a boiler log. Handles primary approval, secondary approval (after correction), and reject."""
        log = self.get_object()
        action_type = request.data.get('action', 'approve')
        remarks = (request.data.get('remarks') or '').strip()
        
        if action_type == 'reject' and not remarks:
            raise ValidationError({'remarks': ['Comment is required when rejecting.']})
        
        if action_type == 'approve':
            # Primary/secondary approver must be different from the operator (Log Book Done By)
            if log.operator_id and log.operator_id == request.user.id:
                return Response(
                    {'error': 'The log book entry must be approved by a different user than the operator (Log Book Done By).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if log.status == 'pending_secondary_approval':
                # Secondary approval must be done by a different person than who rejected
                if log.approved_by_id and log.approved_by_id == request.user.id:
                    return Response(
                        {'error': 'A different person must perform secondary approval. The person who rejected cannot approve the corrected entry.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                log.status = 'approved'
                log.secondary_approved_by = request.user
                log.secondary_approved_at = timezone.now()
            elif log.status in ('pending', 'draft'):
                log.status = 'approved'
            else:
                return Response(
                    {'error': 'Only pending, draft, or pending secondary approval entries can be approved.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif action_type == 'reject':
            if log.status not in ('pending', 'draft', 'pending_secondary_approval'):
                return Response(
                    {'error': 'Only pending, draft, or pending secondary approval entries can be rejected.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            log.status = 'rejected'
            log.secondary_approved_by = None
            log.secondary_approved_at = None
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if action_type == 'reject' or (action_type == 'approve' and log.status == 'approved'):
            log.approved_by = request.user
            log.approved_at = timezone.now()
        if remarks:
            log.comment = remarks
        log.save()
        
        if action_type == 'approve' and log.status == 'approved':
            from reports.utils import create_report_entry
            title = f"Boiler Monitoring - {log.equipment_id or 'N/A'}"
            create_report_entry(
                report_type='utility',
                source_id=str(log.id),
                source_table='boiler_logs',
                title=title,
                site=log.equipment_id or 'N/A',
                created_by=log.operator_name or 'Unknown',
                created_at=log.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(log)
        return Response(serializer.data)


class BoilerEquipmentLimitViewSet(viewsets.ModelViewSet):
    """ViewSet for boiler equipment daily limits (power, water, chemical). Write: Manager/Super Admin."""
    permission_classes = [IsAuthenticated]
    serializer_class = BoilerEquipmentLimitSerializer
    queryset = BoilerEquipmentLimit.objects.all()
    lookup_field = 'equipment_id'
    lookup_value_regex = '[^/]+'

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsSuperAdminOrManager()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get('equipment_id')
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs
