from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from core.log_slot_utils import get_interval_for_equipment, get_slot_range
from .models import ChillerLog, ChillerEquipmentStatusAudit, ChillerEquipmentLimit, ChillerDashboardConfig
from .serializers import ChillerLogSerializer, ChillerEquipmentLimitSerializer
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrManager
from reports.utils import log_limit_change
from django.db.models import Sum
from datetime import datetime, date
import calendar


def _validate_chiller_daily_limits(
    equipment_id: str,
    log_date,
    *,
    power_kwh: float,
    water_ct1: float,
    water_ct2: float,
    water_ct3: float,
    chemical_ct1_kg: float,
    chemical_ct2_kg: float,
    chemical_ct3_kg: float,
    exclude_log_id=None,
) -> tuple[bool, list[str]]:
    """
    Check that adding this entry would not exceed daily limits for the equipment.
    Returns (True, []) if ok, (False, [error_messages]) if any limit exceeded.
    """
    limit = ChillerEquipmentLimit.objects.filter(equipment_id=equipment_id).first()
    if not limit:
        return True, []

    base_qs = ChillerLog.objects.filter(equipment_id=equipment_id, timestamp__date=log_date)
    if exclude_log_id is not None:
        base_qs = base_qs.exclude(pk=exclude_log_id)

    agg = base_qs.aggregate(
        power=Sum('starter_energy_kwh'),
        w1=Sum('daily_water_consumption_ct1_liters'),
        w2=Sum('daily_water_consumption_ct2_liters'),
        w3=Sum('daily_water_consumption_ct3_liters'),
        c1=Sum('cooling_tower_chemical_qty_per_day'),
        c2=Sum('chilled_water_pump_chemical_qty_kg'),
        c3=Sum('cooling_tower_fan_chemical_qty_kg'),
    )
    total_power = (agg['power'] or 0) + (power_kwh or 0)
    total_w1 = (agg['w1'] or 0) + (water_ct1 or 0)
    total_w2 = (agg['w2'] or 0) + (water_ct2 or 0)
    total_w3 = (agg['w3'] or 0) + (water_ct3 or 0)
    total_c1 = (agg['c1'] or 0) + (chemical_ct1_kg or 0)
    total_c2 = (agg['c2'] or 0) + (chemical_ct2_kg or 0)
    total_c3 = (agg['c3'] or 0) + (chemical_ct3_kg or 0)

    errors = []
    if limit.daily_power_limit_kw is not None and total_power > limit.daily_power_limit_kw:
        errors.append(f"Daily power limit ({limit.daily_power_limit_kw} kWh) exceeded for this chiller.")
    if limit.daily_water_ct1_liters is not None and total_w1 > limit.daily_water_ct1_liters:
        errors.append("Cooling tower 1 daily water consumption limit exceeded.")
    if limit.daily_water_ct2_liters is not None and total_w2 > limit.daily_water_ct2_liters:
        errors.append("Cooling tower 2 daily water consumption limit exceeded.")
    if limit.daily_water_ct3_liters is not None and total_w3 > limit.daily_water_ct3_liters:
        errors.append("Cooling tower 3 daily water consumption limit exceeded.")
    if limit.daily_chemical_ct1_kg is not None and total_c1 > limit.daily_chemical_ct1_kg:
        errors.append("Cooling tower 1 daily chemical consumption limit exceeded.")
    if limit.daily_chemical_ct2_kg is not None and total_c2 > limit.daily_chemical_ct2_kg:
        errors.append("Cooling tower 2 daily chemical consumption limit exceeded.")
    if limit.daily_chemical_ct3_kg is not None and total_c3 > limit.daily_chemical_ct3_kg:
        errors.append("Cooling tower 3 daily chemical consumption limit exceeded.")
    if errors:
        return False, errors
    return True, []


class ChillerLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing chiller logs."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChillerLogSerializer
    queryset = ChillerLog.objects.all()
    
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
        """Set operator and apply daily pump/fan status logic with audit trail."""
        validated = serializer.validated_data
        equipment_id = validated.get('equipment_id')
        timestamp = validated.get('timestamp') or timezone.now()
        interval, shift_hours = get_interval_for_equipment(equipment_id or '', 'chiller')
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if ChillerLog.objects.filter(
            equipment_id=equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        remarks = (validated.get('remarks') or '').strip()

        pump_fields = [
            'cooling_tower_pump_status',
            'chilled_water_pump_status',
            'cooling_tower_fan_status',
        ]

        pump_field_labels = {
            'cooling_tower_pump_status': 'Cooling Tower Pump',
            'chilled_water_pump_status': 'Chilled Water Pump',
            'cooling_tower_fan_status': 'Cooling Tower Fan',
        }

        overrides = {}
        changes = []

        # Baseline pump/fan status is based on the operator's first reading of the day
        # (not per equipment). Subsequent entries by the same operator inherit these values
        # when omitted and require remarks if changed.
        today = timezone.localdate()
        first_log = (
            ChillerLog.objects.filter(
                operator=self.request.user,
                timestamp__date=today,
            )
            .order_by('timestamp')
            .first()
        )

        # If a first log exists for the day, treat its pump/fan status
        # as the initial_equipment_status and compare against it.
        if first_log:
            for field in pump_fields:
                requested_value = validated.get(field, None)
                initial_value = getattr(first_log, field)

                # If nothing was sent for this field, reuse initial value
                if requested_value in [None, '']:
                    overrides[field] = initial_value
                    continue

                overrides[field] = requested_value

                # Track changes relative to first reading
                if requested_value != initial_value:
                    changes.append(
                        {
                            'field': field,
                            'label': pump_field_labels.get(field, field),
                            'old': initial_value,
                            'new': requested_value,
                        }
                    )

        # Enforce remarks when pump/fan status is changed relative to first reading
        if changes and not remarks:
            raise ValidationError(
                {'remarks': ['Remarks are required when changing pump/fan status.']}
            )

        # Validate daily limits (power, water CT-1/2/3, chemical CT-1/2/3)
        log_date = (timestamp or timezone.now()).date()
        ok, limit_errors = _validate_chiller_daily_limits(
            equipment_id=equipment_id,
            log_date=log_date,
            power_kwh=validated.get('starter_energy_kwh') or 0,
            water_ct1=validated.get('daily_water_consumption_ct1_liters') or 0,
            water_ct2=validated.get('daily_water_consumption_ct2_liters') or 0,
            water_ct3=validated.get('daily_water_consumption_ct3_liters') or 0,
            chemical_ct1_kg=validated.get('cooling_tower_chemical_qty_per_day') or 0,
            chemical_ct2_kg=validated.get('chilled_water_pump_chemical_qty_kg') or 0,
            chemical_ct3_kg=validated.get('cooling_tower_fan_chemical_qty_kg') or 0,
        )
        if not ok:
            raise ValidationError({'detail': limit_errors})

        # Auto-append change notes into remarks for compliance
        combined_remarks = remarks
        if changes:
            now = timezone.localtime()
            time_str = now.strftime('%H:%M')
            notes = []
            for change in changes:
                old_val = change['old'] if change['old'] not in [None, ''] else 'BLANK'
                new_val = change['new'] if change['new'] not in [None, ''] else 'BLANK'
                notes.append(
                    f"{change['label']} changed from {old_val} to {new_val} at {time_str}"
                )
            notes_text = '\n'.join(notes)
            combined_remarks = f"{remarks}\n{notes_text}".strip() if remarks else notes_text

        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
            remarks=combined_remarks,
            **overrides,
        )

        # Create audit trail entries for each changed field
        if changes:
            for change in changes:
                ChillerEquipmentStatusAudit.objects.create(
                    chiller_log=log,
                    field_name=change['field'],
                    old_value=change['old'],
                    new_value=change['new'],
                    changed_by=self.request.user,
                )

    def perform_update(self, serializer):
        """Validate daily limits before saving update."""
        instance = serializer.instance
        validated = serializer.validated_data
        log_date = (instance.timestamp or timezone.now()).date()
        def _get(field, default=None):
            return validated.get(field) if field in validated else getattr(instance, field, default)
        ok, limit_errors = _validate_chiller_daily_limits(
            equipment_id=instance.equipment_id,
            log_date=log_date,
            power_kwh=_get('starter_energy_kwh') or 0,
            water_ct1=_get('daily_water_consumption_ct1_liters') or 0,
            water_ct2=_get('daily_water_consumption_ct2_liters') or 0,
            water_ct3=_get('daily_water_consumption_ct3_liters') or 0,
            chemical_ct1_kg=_get('cooling_tower_chemical_qty_per_day') or 0,
            chemical_ct2_kg=_get('chilled_water_pump_chemical_qty_kg') or 0,
            chemical_ct3_kg=_get('cooling_tower_fan_chemical_qty_kg') or 0,
            exclude_log_id=instance.id,
        )
        if not ok:
            raise ValidationError({'detail': limit_errors})
        serializer.save()

    def _is_first_log_of_day(self, log: ChillerLog) -> bool:
        """Return True if the given log is the first entry of the day for its equipment."""
        if not log.equipment_id or not log.timestamp:
            return False
        first_log = (
            ChillerLog.objects.filter(
                equipment_id=log.equipment_id,
                timestamp__date=log.timestamp.date(),
            )
            .order_by('timestamp')
            .first()
        )
        return bool(first_log and first_log.id == log.id)

    def update(self, request, *args, **kwargs):
        """
        Prevent editing the first verified reading of the day and
        record reading changes in the audit trail.
        """
        instance = self.get_object()
        if instance.status == 'approved' and self._is_first_log_of_day(instance):
            raise ValidationError(
                {
                    'detail': [
                        'First reading of the day cannot be edited after verification.'
                    ]
                }
            )
        # Capture old readings before update
        tracked_fields = [
            'chiller_supply_temp',
            'chiller_return_temp',
            'cooling_tower_supply_temp',
            'cooling_tower_return_temp',
            'ct_differential_temp',
            'chiller_water_inlet_pressure',
            'chiller_makeup_water_flow',
            'evap_water_inlet_pressure',
            'evap_water_outlet_pressure',
            'evap_entering_water_temp',
            'evap_leaving_water_temp',
            'evap_approach_temp',
            'cond_water_inlet_pressure',
            'cond_water_outlet_pressure',
            'cond_entering_water_temp',
            'cond_leaving_water_temp',
            'cond_approach_temp',
            'chiller_control_signal',
            'avg_motor_current',
            'compressor_running_time_min',
            'starter_energy_kwh',
            'cooling_tower_pump_status',
            'chilled_water_pump_status',
            'cooling_tower_fan_status',
            'cooling_tower_blowoff_valve_status',
            'cooling_tower_blowdown_time_min',
            'daily_water_consumption_ct1_liters',
            'daily_water_consumption_ct2_liters',
            'daily_water_consumption_ct3_liters',
            'cooling_tower_chemical_name',
            'cooling_tower_chemical_qty_per_day',
            'chilled_water_pump_chemical_name',
            'chilled_water_pump_chemical_qty_kg',
            'cooling_tower_fan_chemical_name',
            'cooling_tower_fan_chemical_qty_kg',
            'recording_frequency',
            'operator_sign',
            'verified_by',
            'remarks',
            'comment',
            'status',
            'timestamp',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        # Reload instance to get updated values
        updated = self.get_object()
        user = request.user
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
                object_type="chiller_log",
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
        Prevent editing the first verified reading of the day and
        record reading changes in the audit trail (partial updates).
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='dashboard_summary')
    def dashboard_summary(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_id=...
        Returns actual power (kWh), limit power (kWh), optional projected and cost, efficiency.
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
            last_day = 366 if calendar.isleap(ref_date.year) else 365
            period_end = timezone.make_aware(datetime(ref_date.year, 12, 31, 23, 59, 59, 999999))
            days_in_period = last_day

        qs = ChillerLog.objects.filter(
            timestamp__gte=period_start,
            timestamp__lte=period_end,
        )
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)

        agg = qs.aggregate(total=Sum('starter_energy_kwh'))
        actual_power_kwh = float(agg['total'] or 0)

        equipment_ids_in_logs = list(qs.values_list('equipment_id', flat=True).distinct())
        if equipment_id:
            limit_equipment_ids = [equipment_id] if equipment_ids_in_logs or equipment_id else []
        else:
            limit_equipment_ids = list(ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())
            if equipment_ids_in_logs:
                limit_equipment_ids = list(set(limit_equipment_ids) | set(equipment_ids_in_logs))

        limit_power_kwh = 0.0
        by_equipment = []
        for eid in limit_equipment_ids:
            limit_row = ChillerEquipmentLimit.objects.filter(equipment_id=eid).first()
            daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
            limit_for_period = daily_kw * days_in_period
            limit_power_kwh += limit_for_period
            log_agg = ChillerLog.objects.filter(
                equipment_id=eid,
                timestamp__gte=period_start,
                timestamp__lte=period_end,
            ).aggregate(s=Sum('starter_energy_kwh'))
            actual_e = float(log_agg['s'] or 0)
            by_equipment.append({
                'equipment_id': eid,
                'actual_power_kwh': round(actual_e, 2),
                'limit_power_kwh': round(limit_for_period, 2),
            })
        limit_power_kwh = round(limit_power_kwh, 2)

        utilization_pct = (actual_power_kwh / limit_power_kwh * 100) if limit_power_kwh > 0 else None
        kWh_per_day = round(actual_power_kwh / days_in_period, 2) if days_in_period else 0

        config = ChillerDashboardConfig.objects.first()
        projected_power_kwh = None
        actual_cost_rs = None
        projected_cost_rs = None
        if config:
            if config.projected_power_kwh_month is not None:
                if period_type == 'month':
                    projected_power_kwh = config.projected_power_kwh_month
                elif period_type == 'day':
                    _, month_days = calendar.monthrange(ref_date.year, ref_date.month)
                    projected_power_kwh = config.projected_power_kwh_month / month_days
                else:
                    projected_power_kwh = config.projected_power_kwh_month * 12
                projected_power_kwh = round(projected_power_kwh, 2)
            if config.electricity_rate_rs_per_kwh is not None:
                rate = config.electricity_rate_rs_per_kwh
                actual_cost_rs = round(actual_power_kwh * rate, 2)
                if projected_power_kwh is not None:
                    projected_cost_rs = round(projected_power_kwh * rate, 2)

        payload = {
            'period_type': period_type,
            'period_start': period_start.date().isoformat(),
            'period_end': period_end.date().isoformat(),
            'days_in_period': days_in_period,
            'actual_power_kwh': round(actual_power_kwh, 2),
            'limit_power_kwh': limit_power_kwh,
            'utilization_pct': round(utilization_pct, 2) if utilization_pct is not None else None,
            'kwh_per_day': kWh_per_day,
            'by_equipment': by_equipment,
        }
        if projected_power_kwh is not None:
            payload['projected_power_kwh'] = projected_power_kwh
        if actual_cost_rs is not None:
            payload['actual_cost_rs'] = actual_cost_rs
        if projected_cost_rs is not None:
            payload['projected_cost_rs'] = projected_cost_rs
        return Response(payload)

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """
        Create a new chiller log entry as a correction of a rejected or pending-secondary-approval log.
        The original entry remains unchanged; old/new values are recorded in the audit trail.
        """
        original = self.get_object()
        if original.status not in ('rejected', 'pending_secondary_approval'):
            return Response(
                {'error': 'Only rejected or pending secondary approval entries can be corrected as new entries.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()
        # Let the serializer handle timestamp parsing; we'll pull it from validated_data
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        timestamp = validated.pop('timestamp', None)

        # Base payload for the new correction entry
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
        interval, shift_hours = get_interval_for_equipment(original.equipment_id or '', 'chiller')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        if ChillerLog.objects.filter(
            equipment_id=original.equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exclude(pk=original.pk).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )

        new_log = ChillerLog.objects.create(**payload)

        # Record field-by-field diffs in audit trail
        tracked_fields = [
            'chiller_supply_temp',
            'chiller_return_temp',
            'cooling_tower_supply_temp',
            'cooling_tower_return_temp',
            'ct_differential_temp',
            'chiller_water_inlet_pressure',
            'chiller_makeup_water_flow',
            'evap_water_inlet_pressure',
            'evap_water_outlet_pressure',
            'evap_entering_water_temp',
            'evap_leaving_water_temp',
            'evap_approach_temp',
            'cond_water_inlet_pressure',
            'cond_water_outlet_pressure',
            'cond_entering_water_temp',
            'cond_leaving_water_temp',
            'cond_approach_temp',
            'chiller_control_signal',
            'avg_motor_current',
            'compressor_running_time_min',
            'starter_energy_kwh',
            'cooling_tower_pump_status',
            'chilled_water_pump_status',
            'cooling_tower_fan_status',
            'cooling_tower_blowoff_valve_status',
            'cooling_tower_blowdown_time_min',
            'daily_water_consumption_ct1_liters',
            'daily_water_consumption_ct2_liters',
            'daily_water_consumption_ct3_liters',
            'cooling_tower_chemical_name',
            'cooling_tower_chemical_qty_per_day',
            'chilled_water_pump_chemical_name',
            'chilled_water_pump_chemical_qty_kg',
            'cooling_tower_fan_chemical_name',
            'cooling_tower_fan_chemical_qty_kg',
            'recording_frequency',
            'operator_sign',
            'verified_by',
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
                object_type="chiller_log",
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
        """Approve or reject a chiller log. Handles primary approval, secondary approval (after correction), and reject."""
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
                # Secondary approval (after correction)
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
        
        # Create report entry when approved (primary or secondary)
        if action_type == 'approve' and log.status == 'approved':
            from reports.utils import create_report_entry
            title = f"Chiller Monitoring - {log.equipment_id or 'N/A'}"
            create_report_entry(
                report_type='utility',
                source_id=str(log.id),
                source_table='chiller_logs',
                title=title,
                site=log.equipment_id or 'N/A',
                created_by=log.operator_name or 'Unknown',
                created_at=log.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(log)
        return Response(serializer.data)


class ChillerEquipmentLimitViewSet(viewsets.ModelViewSet):
    """ViewSet for chiller equipment daily limits (power, water, chemical). Write: Manager/Super Admin."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChillerEquipmentLimitSerializer
    queryset = ChillerEquipmentLimit.objects.all()
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
