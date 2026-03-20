from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from core.log_slot_utils import get_interval_for_equipment, get_slot_range, compute_slot_status
from .models import ChillerLog, ChillerEquipmentStatusAudit, ChillerEquipmentLimit, ChillerDashboardConfig
from .serializers import ChillerLogSerializer, ChillerEquipmentLimitSerializer
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrManager
from reports.utils import log_limit_change, log_audit_event
from django.db.models import Sum
from django.db.models.functions import TruncDate
from datetime import datetime, date, timedelta
from collections import defaultdict
import calendar

# For dashboard_series actual = manual + log (same as Consumption module)
try:
    from reports.models import ManualChillerConsumption
except ImportError:
    ManualChillerConsumption = None


def _get_limit_for_date(equipment_id: str, for_date):
    """
    Return the ChillerEquipmentLimit in effect for the given equipment on for_date.
    Uses effective_from: limit applies when effective_from is null or effective_from <= for_date.
    """
    qs = ChillerEquipmentLimit.objects.filter(equipment_id=equipment_id)
    # Prefer row with effective_from <= for_date, latest effective_from first; then row with null effective_from
    limit = qs.filter(effective_from__isnull=False, effective_from__lte=for_date).order_by('-effective_from').first()
    if limit is not None:
        return limit
    return qs.filter(effective_from__isnull=True).first()


def _get_limit_for_display(equipment_id: str, for_date):
    """
    Return the ChillerEquipmentLimit that is actually in effect on for_date.

    Unlike the previous implementation, this helper no longer falls back to the
    "latest configured" limit when there is no row effective on the requested
    date. This ensures dashboard cards and charts show 0 limits until a fresh
    daily limit is configured for the selected period.
    """
    limit = _get_limit_for_date(equipment_id, for_date)
    return limit


def _get_chiller_dashboard_config():
    """
    Return the same ChillerDashboardConfig row used for dashboard summary and series.
    Prefer a row with projected_power_kwh_month set, then most recently updated.
    """
    return (
        ChillerDashboardConfig.objects.filter(projected_power_kwh_month__isnull=False)
        .order_by('-updated_at')
        .first()
        or ChillerDashboardConfig.objects.order_by('-updated_at').first()
    )


def _get_chiller_dashboard_rate(for_date, equipment_id=None):
    """
    Return electricity rate (Rs/kWh) for cost calculation. Used by both dashboard_summary
    and dashboard_series so cards and charts show the same cost values.
    Order: config, then equipment_id's limit (if provided), then first limit by equipment_id order.
    """
    config = _get_chiller_dashboard_config()
    if config and config.electricity_rate_rs_per_kwh is not None:
        return float(config.electricity_rate_rs_per_kwh)
    if equipment_id:
        limit_row = _get_limit_for_display(equipment_id, for_date)
        if limit_row and limit_row.electricity_rate_rs_per_kwh is not None:
            return float(limit_row.electricity_rate_rs_per_kwh)
    for eid in ChillerEquipmentLimit.objects.order_by('equipment_id').values_list('equipment_id', flat=True).distinct():
        limit_row = _get_limit_for_display(eid, for_date)
        if limit_row and limit_row.electricity_rate_rs_per_kwh is not None:
            return float(limit_row.electricity_rate_rs_per_kwh)
    return None


def _actual_power_for_date(d, eid_filter=None):
    """
    Actual power (kWh) for one day: ManualChillerConsumption if present, else sum of approved ChillerLog.
    Same source as Consumption module and dashboard_series.
    """
    if eid_filter:
        if ManualChillerConsumption is not None:
            m = ManualChillerConsumption.objects.filter(equipment_id=eid_filter, date=d).first()
            if m is not None:
                return round(float(m.power_kwh or 0), 2)
        agg = ChillerLog.objects.filter(
            status='approved', timestamp__date=d, equipment_id=eid_filter
        ).aggregate(s=Sum('starter_energy_kwh'))
        return round(float(agg['s'] or 0), 2)
    total = 0.0
    log_rows = list(
        ChillerLog.objects.filter(status='approved', timestamp__date=d)
        .values('equipment_id')
        .annotate(power_kwh=Sum('starter_energy_kwh'))
    )
    by_equipment = {(r['equipment_id']): float(r['power_kwh'] or 0) for r in log_rows}
    if ManualChillerConsumption is not None:
        for m in ManualChillerConsumption.objects.filter(date=d):
            by_equipment[m.equipment_id] = float(m.power_kwh or 0)
    for v in by_equipment.values():
        total += v
    return round(total, 2)


def _actual_power_for_date_range(start_d, end_d, eid_filter=None):
    """
    Actual power (kWh) for a date range: per (date, equipment) use ManualChillerConsumption
    if present else ChillerLog sum. Returns (total_kwh, by_equipment_dict) in 2–3 queries
    instead of O(days) queries. Use for month/year dashboard to avoid slow day-by-day loops.
    """
    log_qs = ChillerLog.objects.filter(
        status='approved',
        timestamp__date__gte=start_d,
        timestamp__date__lte=end_d,
    )
    if eid_filter:
        log_qs = log_qs.filter(equipment_id=eid_filter)
    log_rows = list(
        log_qs.annotate(d=TruncDate('timestamp'))
        .values('d', 'equipment_id')
        .annotate(power_kwh=Sum('starter_energy_kwh'))
    )
    by_day_equipment = {}
    for r in log_rows:
        d = r['d'] if isinstance(r['d'], date) else r['d'].date() if hasattr(r['d'], 'date') else r['d']
        by_day_equipment[(d, r['equipment_id'])] = float(r['power_kwh'] or 0)
    if ManualChillerConsumption is not None:
        manual_qs = ManualChillerConsumption.objects.filter(
            date__gte=start_d,
            date__lte=end_d,
        )
        if eid_filter:
            manual_qs = manual_qs.filter(equipment_id=eid_filter)
        for r in manual_qs.values('date', 'equipment_id', 'power_kwh'):
            by_day_equipment[(r['date'], r['equipment_id'])] = float(r['power_kwh'] or 0)
    by_equipment = defaultdict(float)
    for (_d, eid), kwh in by_day_equipment.items():
        by_equipment[eid] += kwh
    total = sum(by_equipment.values())
    return round(total, 2), {eid: round(v, 2) for eid, v in by_equipment.items()}


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
    limit = _get_limit_for_date(equipment_id, log_date)
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
    )
    total_power = (agg['power'] or 0) + (power_kwh or 0)
    total_w1 = (agg['w1'] or 0) + (water_ct1 or 0)
    total_w2 = (agg['w2'] or 0) + (water_ct2 or 0)
    total_w3 = (agg['w3'] or 0) + (water_ct3 or 0)
    total_c1 = chemical_ct1_kg or 0
    total_c2 = chemical_ct2_kg or 0
    total_c3 = chemical_ct3_kg or 0

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
        activity_type = validated.get('activity_type') or 'operation'
        timestamp = validated.get('timestamp') or timezone.now()
        base_qs = ChillerLog.objects.filter(equipment_id=equipment_id)
        last_log = base_qs.order_by('-timestamp').first()
        last_time = last_log.timestamp if last_log is not None else None

        slot_info = compute_slot_status(equipment_id or '', 'chiller', timestamp, last_time=last_time)
        slot_start = slot_info["slot_start"]
        slot_end = slot_info["slot_end"]
        tolerance_end = slot_info["tolerance_end"]
        status = slot_info["status"]

        if status == "interval":
            if base_qs.filter(timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
                raise ValidationError(
                    {'detail': ['An entry for this equipment already exists for this time slot.']}
                )
        elif status == "tolerance" and tolerance_end is not None:
            if base_qs.filter(timestamp__gte=slot_end, timestamp__lte=tolerance_end).exists():
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
            'cooling_tower_pump_status': 'Cooling Tower-1',
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

        # Validate daily limits (power, water CT-1/2/3, chemical CT-1/2/3) only for operation entries
        if activity_type == 'operation':
            log_date = (timestamp or timezone.now()).date()
            ok, limit_errors = _validate_chiller_daily_limits(
                equipment_id=equipment_id,
                log_date=log_date,
                power_kwh=validated.get('starter_energy_kwh') or 0,
                water_ct1=validated.get('daily_water_consumption_ct1_liters') or 0,
                water_ct2=validated.get('daily_water_consumption_ct2_liters') or 0,
                water_ct3=validated.get('daily_water_consumption_ct3_liters') or 0,
                chemical_ct1_kg=0,
                chemical_ct2_kg=0,
                chemical_ct3_kg=0,
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

        # Create audit trail entries for each changed field (chiller-specific + central)
        if changes:
            for change in changes:
                ChillerEquipmentStatusAudit.objects.create(
                    chiller_log=log,
                    field_name=change['field'],
                    old_value=change['old'],
                    new_value=change['new'],
                    changed_by=self.request.user,
                )
                log_audit_event(
                    user=self.request.user,
                    event_type="log_update",
                    object_type="chiller_log",
                    object_id=str(log.id),
                    field_name=change['field'],
                    old_value=str(change['old']) if change['old'] is not None else None,
                    new_value=str(change['new']) if change['new'] is not None else None,
                )

        # Central audit trail: log created
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="chiller_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
        )

    def perform_update(self, serializer):
        """Validate daily limits before saving update."""
        instance = serializer.instance
        validated = serializer.validated_data
        activity_type = validated.get('activity_type') if 'activity_type' in validated else getattr(instance, 'activity_type', 'operation')
        log_date = (instance.timestamp or timezone.now()).date()
        def _get(field, default=None):
            return validated.get(field) if field in validated else getattr(instance, field, default)
        if (activity_type or 'operation') == 'operation':
            ok, limit_errors = _validate_chiller_daily_limits(
                equipment_id=instance.equipment_id,
                log_date=log_date,
                power_kwh=_get('starter_energy_kwh') or 0,
                water_ct1=_get('daily_water_consumption_ct1_liters') or 0,
                water_ct2=_get('daily_water_consumption_ct2_liters') or 0,
                water_ct3=_get('daily_water_consumption_ct3_liters') or 0,
                chemical_ct1_kg=0,
                chemical_ct2_kg=0,
                chemical_ct3_kg=0,
                exclude_log_id=instance.id,
            )
            if not ok:
                raise ValidationError({'detail': limit_errors})
        serializer.save()

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="chiller_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
        )
        super().perform_destroy(instance)

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

        # Actual power: same source as dashboard_series (ManualChillerConsumption + approved ChillerLog)
        period_start_d = period_start.date() if hasattr(period_start, 'date') else period_start
        period_end_d = period_end.date() if hasattr(period_end, 'date') else period_end
        if period_type == 'day':
            actual_power_kwh = _actual_power_for_date(ref_date, equipment_id)
            actual_by_equipment = None  # not used for day
        else:
            actual_power_kwh, actual_by_equipment = _actual_power_for_date_range(
                period_start_d, period_end_d, equipment_id
            )

        # Equipment in scope: from ChillerLog or ManualChillerConsumption in period
        log_equipment = set(
            ChillerLog.objects.filter(
                timestamp__gte=period_start,
                timestamp__lte=period_end,
            )
            .values_list('equipment_id', flat=True)
            .distinct()
        )
        if equipment_id:
            log_equipment = {e for e in log_equipment if e == equipment_id}
        manual_equipment = set()
        if ManualChillerConsumption is not None:
            manual_equipment = set(
                ManualChillerConsumption.objects.filter(
                    date__gte=period_start_d,
                    date__lte=period_end_d,
                ).values_list('equipment_id', flat=True).distinct()
            )
            if equipment_id:
                manual_equipment = {e for e in manual_equipment if e == equipment_id}
        equipment_ids_in_period = log_equipment | manual_equipment

        if equipment_id:
            limit_equipment_ids = [equipment_id] if equipment_ids_in_period or equipment_id else []
        else:
            limit_equipment_ids = list(ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())
            if equipment_ids_in_period:
                limit_equipment_ids = list(set(limit_equipment_ids) | equipment_ids_in_period)

        # For day view, only consider limits that are explicitly effective on ref_date.
        # If there is no ChillerEquipmentLimit row with effective_from == ref_date (or null),
        # treat limits as 0 so projected values stay hidden until fresh daily limits are set.
        if period_type == 'day' and limit_equipment_ids:
            limit_equipment_ids = [
                eid
                for eid in limit_equipment_ids
                if ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid,
                    effective_from=ref_date,
                ).exists()
                or ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid,
                    effective_from__isnull=True,
                ).exists()
            ]

        limit_power_kwh = 0.0
        by_equipment = []
        # Use end-of-period for limit lookup so limits with effective_from mid-period apply (matches series; fixes month/year cards)
        if period_type == 'day':
            limit_lookup_date = ref_date
        elif period_type == 'month':
            _, last_day_m = calendar.monthrange(ref_date.year, ref_date.month)
            limit_lookup_date = date(ref_date.year, ref_date.month, last_day_m)
        else:
            limit_lookup_date = date(ref_date.year, 12, 31)
        for eid in limit_equipment_ids:
            limit_row = _get_limit_for_display(eid, limit_lookup_date)
            daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
            limit_for_period = daily_kw * days_in_period
            limit_power_kwh += limit_for_period
            if actual_by_equipment is not None:
                actual_e = actual_by_equipment.get(eid, 0.0)
            else:
                actual_e = _actual_power_for_date(period_start_d, eid)
            by_equipment.append({
                'equipment_id': eid,
                'actual_power_kwh': round(actual_e, 2),
                'limit_power_kwh': round(limit_for_period, 2),
            })
        limit_power_kwh = round(limit_power_kwh, 2)

        utilization_pct = (actual_power_kwh / limit_power_kwh * 100) if limit_power_kwh > 0 else None
        kWh_per_day = round(actual_power_kwh / days_in_period, 2) if days_in_period else 0

        config = _get_chiller_dashboard_config()
        projected_power_kwh = None
        actual_cost_rs = None
        projected_cost_rs = None
        rate = _get_chiller_dashboard_rate(limit_lookup_date, equipment_id=equipment_id)
        if config and config.projected_power_kwh_month is not None and limit_power_kwh > 0:
            if period_type == 'month':
                projected_power_kwh = config.projected_power_kwh_month
            elif period_type == 'day':
                _, month_days = calendar.monthrange(ref_date.year, ref_date.month)
                projected_power_kwh = config.projected_power_kwh_month / month_days
            else:
                projected_power_kwh = config.projected_power_kwh_month * 12
            projected_power_kwh = round(projected_power_kwh, 2)
        # Only fall back to limits when there is a non‑zero limit configured.
        if projected_power_kwh is None and limit_power_kwh > 0:
            projected_power_kwh = limit_power_kwh
        if rate is not None and limit_power_kwh > 0:
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

    @action(detail=False, methods=['get'], url_path='dashboard_series')
    def dashboard_series(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_id=...&days=7
        Returns time-series for bar chart: list of { date, label, limit_power_kwh, actual_power_kwh }.
        Actual uses same source as Consumption module (ManualChillerConsumption over ChillerLog).
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
        days_param = request.query_params.get('days')
        series_days = int(days_param) if days_param and str(days_param).isdigit() else 7
        series_days = max(1, min(31, series_days))

        config = _get_chiller_dashboard_config()
        rate_rs = _get_chiller_dashboard_rate(ref_date, equipment_id=equipment_id)
        projected_kwh_month = float(config.projected_power_kwh_month) if config and config.projected_power_kwh_month is not None else None

        # When config has no projected, use same fallback as summary: limit for ref_date's month (using ref_date for lookup)
        if projected_kwh_month is None and period_type == 'month':
            _, last_day_ref = calendar.monthrange(ref_date.year, ref_date.month)
            start_d_ref = date(ref_date.year, ref_date.month, 1)
            end_d_ref = date(ref_date.year, ref_date.month, last_day_ref)
            period_start_ref = timezone.make_aware(datetime.combine(start_d_ref, datetime.min.time()))
            period_end_ref = timezone.make_aware(
                datetime.combine(end_d_ref, datetime.max.time().replace(microsecond=999999))
            )
            log_equipment_ref = set(
                ChillerLog.objects.filter(
                    timestamp__gte=period_start_ref,
                    timestamp__lte=period_end_ref,
                )
                .values_list('equipment_id', flat=True)
                .distinct()
            )
            if equipment_id:
                log_equipment_ref = {e for e in log_equipment_ref if e == equipment_id}
            manual_equipment_ref = set()
            if ManualChillerConsumption is not None:
                manual_equipment_ref = set(
                    ManualChillerConsumption.objects.filter(
                        date__gte=start_d_ref,
                        date__lte=end_d_ref,
                    ).values_list('equipment_id', flat=True).distinct()
                )
                if equipment_id:
                    manual_equipment_ref = {e for e in manual_equipment_ref if e == equipment_id}
            equipment_ids_ref = log_equipment_ref | manual_equipment_ref
            limit_equipment_ids_ref = list(
                ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct()
            )
            if equipment_ids_ref:
                limit_equipment_ids_ref = list(set(limit_equipment_ids_ref) | equipment_ids_ref)
            if equipment_id:
                limit_equipment_ids_ref = [equipment_id] if (equipment_ids_ref or equipment_id) else []
            limit_for_ref_month = 0.0
            limit_lookup_ref = end_d_ref  # end of month so limits with mid-month effective_from apply
            for eid in limit_equipment_ids_ref:
                limit_row = _get_limit_for_display(eid, limit_lookup_ref)
                daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                limit_for_ref_month += daily_kw * last_day_ref
            projected_kwh_month = round(limit_for_ref_month, 2) if limit_for_ref_month else None

        def limit_power_for_date(d, eid_filter=None):
            """Limit for one day: sum of daily_power_limit_kw (in kWh for 1 day) for equipments in scope (date-wise)."""
            if eid_filter:
                # Only use limits that are explicitly effective on this date (or have no effective_from).
                limit_row = ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid_filter,
                    effective_from=d,
                ).order_by('-effective_from').first() or ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid_filter,
                    effective_from__isnull=True,
                ).order_by('-effective_from').first()
                daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                return round(daily_kw * 1, 2)
            limit_ids = list(ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())
            total = 0.0
            for eid in limit_ids:
                limit_row = ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid,
                    effective_from=d,
                ).order_by('-effective_from').first() or ChillerEquipmentLimit.objects.filter(
                    equipment_id=eid,
                    effective_from__isnull=True,
                ).order_by('-effective_from').first()
                daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                total += daily_kw * 1
            return round(total, 2)

        series = []
        try:
            if period_type == 'day':
                for i in range(series_days - 1, -1, -1):
                    d = ref_date - timedelta(days=i)
                    label = d.strftime('%d %b')
                    actual = _actual_power_for_date(d, equipment_id)
                    limit = limit_power_for_date(d, equipment_id)
                    _, month_days = calendar.monthrange(d.year, d.month)
                    # When no non‑zero limit exists for this day, keep projected values at 0.
                    if limit == 0:
                        proj_kwh = 0.0
                        actual_cost = 0.0 if rate_rs is not None else None
                        proj_cost = 0.0 if rate_rs is not None else None
                    else:
                        proj_kwh = round(projected_kwh_month / month_days, 2) if projected_kwh_month is not None else limit
                        actual_cost = round(actual * rate_rs, 2) if rate_rs is not None else None
                        proj_cost = round(proj_kwh * rate_rs, 2) if (rate_rs is not None and proj_kwh is not None) else None
                    point = {
                        'date': d.isoformat(),
                        'label': label,
                        'limit_power_kwh': limit,
                        'actual_power_kwh': actual,
                        'projected_power_kwh': proj_kwh,
                        'actual_cost_rs': actual_cost,
                        'projected_cost_rs': proj_cost,
                    }
                    series.append(point)
            elif period_type == 'month':
                # Month view: single point for selected month only (like Day and Year), so chart matches cards
                _, last_day_m = calendar.monthrange(ref_date.year, ref_date.month)
                start_d_m = date(ref_date.year, ref_date.month, 1)
                end_d_m = date(ref_date.year, ref_date.month, last_day_m)
                actual_m, _ = _actual_power_for_date_range(start_d_m, end_d_m, equipment_id)
                limit_lookup_d_m = end_d_m
                limit_m = 0.0
                if equipment_id:
                    limit_row = _get_limit_for_display(equipment_id, limit_lookup_d_m)
                    daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                    limit_m = round(daily_kw * last_day_m, 2)
                else:
                    for eid in list(ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct()):
                        limit_row = _get_limit_for_display(eid, limit_lookup_d_m)
                        daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                        limit_m += daily_kw * last_day_m
                    limit_m = round(limit_m, 2)
                if limit_m == 0:
                    proj_kwh_m = 0.0
                    actual_cost_m = 0.0 if rate_rs is not None else None
                    proj_cost_m = 0.0 if rate_rs is not None else None
                else:
                    proj_kwh_m = round(projected_kwh_month, 2) if projected_kwh_month is not None else limit_m
                    actual_cost_m = round(actual_m * rate_rs, 2) if rate_rs is not None else None
                    proj_cost_m = round(proj_kwh_m * rate_rs, 2) if (rate_rs is not None and proj_kwh_m is not None) else None
                series.append({
                    'date': start_d_m.isoformat(),
                    'label': start_d_m.strftime('%b %Y'),
                    'limit_power_kwh': limit_m,
                    'actual_power_kwh': actual_m,
                    'projected_power_kwh': proj_kwh_m,
                    'actual_cost_rs': actual_cost_m,
                    'projected_cost_rs': proj_cost_m,
                })
            else:
                # Year view: single point with year totals so chart matches cards
                period_start_d = date(ref_date.year, 1, 1)
                period_end_d = date(ref_date.year, 12, 31)
                days_in_period = (period_end_d - period_start_d).days + 1
                actual_power_kwh, _ = _actual_power_for_date_range(
                    period_start_d, period_end_d, equipment_id
                )
                period_start = timezone.make_aware(datetime.combine(period_start_d, datetime.min.time()))
                period_end = timezone.make_aware(
                    datetime.combine(period_end_d, datetime.max.time().replace(microsecond=999999))
                )
                log_equipment_y = set(
                    ChillerLog.objects.filter(
                        timestamp__gte=period_start,
                        timestamp__lte=period_end,
                    ).values_list('equipment_id', flat=True).distinct()
                )
                if equipment_id:
                    log_equipment_y = {e for e in log_equipment_y if e == equipment_id}
                manual_equipment_y = set()
                if ManualChillerConsumption is not None:
                    manual_equipment_y = set(
                        ManualChillerConsumption.objects.filter(
                            date__gte=period_start_d,
                            date__lte=period_end_d,
                        ).values_list('equipment_id', flat=True).distinct()
                    )
                    if equipment_id:
                        manual_equipment_y = {e for e in manual_equipment_y if e == equipment_id}
                equipment_ids_y = log_equipment_y | manual_equipment_y
                limit_equipment_ids_y = list(
                    ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct()
                )
                if equipment_ids_y:
                    limit_equipment_ids_y = list(set(limit_equipment_ids_y) | equipment_ids_y)
                if equipment_id:
                    limit_equipment_ids_y = [equipment_id] if (equipment_ids_y or equipment_id) else []
                limit_power_kwh_y = 0.0
                limit_lookup_y = date(ref_date.year, 12, 31)
                for eid in limit_equipment_ids_y:
                    limit_row = _get_limit_for_display(eid, limit_lookup_y)
                    daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                    limit_power_kwh_y += daily_kw * days_in_period
                limit_power_kwh_y = round(limit_power_kwh_y, 2)
                if limit_power_kwh_y == 0:
                    projected_power_kwh_y = 0.0
                    actual_cost_y = 0.0 if rate_rs is not None else None
                    projected_cost_y = 0.0 if rate_rs is not None else None
                else:
                    projected_power_kwh_y = (
                        round(projected_kwh_month * 12, 2) if projected_kwh_month is not None else limit_power_kwh_y
                    )
                    actual_cost_y = round(actual_power_kwh * rate_rs, 2) if rate_rs is not None else None
                    projected_cost_y = (
                        round(projected_power_kwh_y * rate_rs, 2)
                        if (rate_rs is not None and projected_power_kwh_y is not None)
                        else None
                    )
                series.append({
                    'date': period_start_d.isoformat(),
                    'label': str(ref_date.year),
                    'limit_power_kwh': limit_power_kwh_y,
                    'actual_power_kwh': actual_power_kwh,
                    'projected_power_kwh': projected_power_kwh_y,
                    'actual_cost_rs': actual_cost_y,
                    'projected_cost_rs': projected_cost_y,
                })
        except Exception:
            series = []
        return Response({'series': series})

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
            # Rejector must be different from the operator (Log Book Done By)
            if log.operator_id and log.operator_id == request.user.id:
                return Response(
                    {'error': 'The log book entry must be rejected by a different user than the operator (Log Book Done By).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
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
