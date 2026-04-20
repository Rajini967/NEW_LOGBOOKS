from django.utils import timezone
from django.db.models import Sum, Avg
from django.db.models.functions import TruncDate
from datetime import datetime, date, timedelta
from collections import defaultdict
import calendar
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from core.log_slot_utils import (
    get_interval_for_equipment,
    get_slot_range,
    compute_missing_slots_for_day,
    get_slot_day_bounds,
    get_slot_timezone,
    format_missing_slots_equipment_label,
    filter_missing_slots_before_earliest_downtime,
)
from equipment.models import Equipment
from django.http import Http404
from uuid import UUID
from core.equipment_scope import filter_queryset_by_equipment_scope, assert_user_can_access_equipment
from .models import BoilerLog, BoilerEquipmentLimit, BoilerDashboardConfig
from .serializers import BoilerLogSerializer, BoilerEquipmentLimitSerializer
from accounts.permissions import (
    CanLogEntries,
    CanApproveReports,
    IsSuperAdmin,
    IsSuperAdminOrAdmin,
    forbid_manager_rejecting_reading,
)
from reports.utils import (
    log_limit_change,
    log_audit_event,
    save_missing_slots_snapshot,
    is_redundant_correction_status_audit,
)
from reports.services import create_utility_report_for_log
from reports.approval_workflow import (
    ensure_not_operator,
    ensure_secondary_approver_diff,
    ensure_status_allowed,
    normalize_approval_action,
    require_rejection_comment,
)

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."

try:
    from reports.models import ManualBoilerConsumption
except ImportError:
    ManualBoilerConsumption = None


def _get_boiler_limit_for_date(equipment_id: str, for_date):
    """
    Return the BoilerEquipmentLimit in effect for the given equipment on for_date.
    Uses effective_from: limit applies when effective_from is null or effective_from <= for_date.
    """
    qs = BoilerEquipmentLimit.objects.filter(equipment_id=equipment_id)
    limit = qs.filter(effective_from__isnull=False, effective_from__lte=for_date).order_by('-effective_from').first()
    if limit is not None:
        return limit
    return qs.filter(effective_from__isnull=True).first()


def _get_boiler_limit_for_display(equipment_id: str, for_date):
    """
    Return the BoilerEquipmentLimit in effect for dashboard display.
    Uses latest effective_from <= for_date, with null effective_from as fallback.
    """
    qs = BoilerEquipmentLimit.objects.filter(equipment_id=equipment_id)
    limit = qs.filter(effective_from__isnull=False, effective_from__lte=for_date).order_by("-effective_from").first()
    if limit is not None:
        return limit
    return qs.filter(effective_from__isnull=True).first()


def _projected_boiler_exact_dates(start_d, end_d, equipment_id=None):
    """
    Projected boiler metrics using only exact configured dates (no carry-forward).
    Returns (power_kwh, diesel_liters, furnace_oil_liters, brigade_kg, steam_kg_hr_scaled).
    """
    qs = BoilerEquipmentLimit.objects.filter(
        effective_from__isnull=False,
        effective_from__gte=start_d,
        effective_from__lte=end_d,
    )
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    p = d = fo = br = st = 0.0
    seen = set()
    for row in qs.order_by("equipment_id", "effective_from", "-id"):
        key = (row.equipment_id, row.effective_from)
        if key in seen:
            continue
        seen.add(key)
        p += float(row.daily_power_limit_kw or 0)
        d += float(getattr(row, "daily_diesel_limit_liters", None) or 0)
        fo += float(getattr(row, "daily_furnace_oil_limit_liters", None) or 0)
        br += float(getattr(row, "daily_brigade_limit_kg", None) or 0)
        st += float(getattr(row, "daily_steam_limit_kg_hr", None) or 0) * 24
    return round(p, 2), round(d, 2), round(fo, 2), round(br, 2), round(st, 2)


def _projected_boiler_cost_exact_dates(start_d, end_d, equipment_id=None):
    """
    Projected boiler cost (Rs) from exact configured date rows in range.
    """
    qs = BoilerEquipmentLimit.objects.filter(
        effective_from__isnull=False,
        effective_from__gte=start_d,
        effective_from__lte=end_d,
    )
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    total = 0.0
    seen = set()
    for row in qs.order_by("equipment_id", "effective_from", "-id"):
        key = (row.equipment_id, row.effective_from)
        if key in seen:
            continue
        seen.add(key)
        total += (
            float(row.daily_power_limit_kw or 0) * float(row.electricity_rate_rs_per_kwh or 0)
            + float(getattr(row, "daily_diesel_limit_liters", None) or 0) * float(getattr(row, "diesel_rate_rs_per_liter", None) or 0)
            + float(getattr(row, "daily_furnace_oil_limit_liters", None) or 0) * float(getattr(row, "furnace_oil_rate_rs_per_liter", None) or 0)
            + float(getattr(row, "daily_brigade_limit_kg", None) or 0) * float(getattr(row, "brigade_rate_rs_per_kg", None) or 0)
        )
    return round(total, 2)


def _get_boiler_rate_row_for_scope(equipment_id, equipment_ids, lookup_date):
    """
    Resolve one rate row for dashboard cost calculations.
    Prefer selected equipment row; otherwise first configured equipment row available for lookup_date.
    """
    if equipment_id:
        return _get_boiler_limit_for_display(equipment_id, lookup_date)
    for eid in equipment_ids or []:
        row = _get_boiler_limit_for_display(eid, lookup_date)
        if row is not None:
            return row
    return BoilerEquipmentLimit.objects.order_by("-effective_from", "-id").first()


def _actual_boiler_for_date(d, equipment_id=None):
    """
    Actual boiler consumption for one day from Consumption module (ManualBoilerConsumption)
    if present, else BoilerLog (approved). Returns (power_kwh, diesel_l, furnace_oil_l, brigade_kg, steam_kg_hr).
    """
    if ManualBoilerConsumption is not None:
        if equipment_id:
            m = ManualBoilerConsumption.objects.filter(equipment_id=equipment_id, date=d).first()
            if m is not None:
                return (
                    float(m.power_kwh or 0),
                    float(m.diesel_l or 0),
                    float(m.furnace_oil_l or 0),
                    float(m.brigade_kg or 0),
                    float(m.steam_kg_hr or 0),
                )
        else:
            manual_agg = ManualBoilerConsumption.objects.filter(date=d).aggregate(
                power=Sum('power_kwh'),
                diesel=Sum('diesel_l'),
                furnace_oil=Sum('furnace_oil_l'),
                brigade=Sum('brigade_kg'),
                steam=Sum('steam_kg_hr'),
            )
            if (manual_agg.get('power') or 0) != 0 or (manual_agg.get('diesel') or 0) != 0 or (
                manual_agg.get('furnace_oil') or 0
            ) != 0 or (manual_agg.get('brigade') or 0) != 0 or (manual_agg.get('steam') or 0) != 0:
                return (
                    float(manual_agg.get('power') or 0),
                    float(manual_agg.get('diesel') or 0),
                    float(manual_agg.get('furnace_oil') or 0),
                    float(manual_agg.get('brigade') or 0),
                    float(manual_agg.get('steam') or 0),
                )
    qs = BoilerLog.objects.filter(status='approved', timestamp__date=d)
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    agg = qs.aggregate(
        power=Sum('daily_power_consumption_kwh'),
        diesel=Sum('daily_diesel_consumption_liters'),
        furnace_oil=Sum('daily_furnace_oil_consumption_liters'),
        brigade=Sum('daily_brigade_consumption_kg'),
        steam_hr=Avg('steam_consumption_kg_hr'),
    )
    power = float(agg.get('power') or 0)
    diesel = float(agg.get('diesel') or 0)
    furnace_oil = float(agg.get('furnace_oil') or 0)
    brigade = float(agg.get('brigade') or 0)
    steam = float(agg.get('steam_hr') or 0)
    return (power, diesel, furnace_oil, brigade, steam)


def _actual_boiler_for_date_range(start_d, end_d, equipment_id=None):
    """
    Aggregate actual boiler consumption for a date range in 2–3 bulk queries instead of
    O(days) queries. Per (date, equipment) use ManualBoilerConsumption if present else
    BoilerLog. Returns (total power, total diesel, total furnace_oil, total brigade,
    total steam, by_equipment_power dict).
    """
    by_day_equipment = {}
    log_qs = BoilerLog.objects.filter(
        status='approved',
        timestamp__date__gte=start_d,
        timestamp__date__lte=end_d,
    )
    if equipment_id:
        log_qs = log_qs.filter(equipment_id=equipment_id)
    log_rows = list(
        log_qs.annotate(d=TruncDate('timestamp'))
        .values('d', 'equipment_id')
        .annotate(
            power=Sum('daily_power_consumption_kwh'),
            diesel=Sum('daily_diesel_consumption_liters'),
            furnace_oil=Sum('daily_furnace_oil_consumption_liters'),
            brigade=Sum('daily_brigade_consumption_kg'),
            steam_hr=Avg('steam_consumption_kg_hr'),
        )
    )
    for r in log_rows:
        d = r['d'] if isinstance(r['d'], date) else r['d'].date() if hasattr(r['d'], 'date') else r['d']
        steam = float(r.get('steam_hr') or 0)
        by_day_equipment[(d, r['equipment_id'])] = (
            float(r.get('power') or 0),
            float(r.get('diesel') or 0),
            float(r.get('furnace_oil') or 0),
            float(r.get('brigade') or 0),
            steam,
        )
    if ManualBoilerConsumption is not None:
        manual_qs = ManualBoilerConsumption.objects.filter(
            date__gte=start_d,
            date__lte=end_d,
        )
        if equipment_id:
            manual_qs = manual_qs.filter(equipment_id=equipment_id)
        for r in manual_qs.values('date', 'equipment_id', 'power_kwh', 'diesel_l', 'furnace_oil_l', 'brigade_kg', 'steam_kg_hr'):
            by_day_equipment[(r['date'], r['equipment_id'])] = (
                float(r.get('power_kwh') or 0),
                float(r.get('diesel_l') or 0),
                float(r.get('furnace_oil_l') or 0),
                float(r.get('brigade_kg') or 0),
                float(r.get('steam_kg_hr') or 0),
            )
    total_power = 0.0
    total_diesel = 0.0
    total_furnace_oil = 0.0
    total_brigade = 0.0
    total_steam = 0.0
    by_equipment_power = defaultdict(float)
    for (_d, eid), (p, di, fo, br, st) in by_day_equipment.items():
        total_power += p
        total_diesel += di
        total_furnace_oil += fo
        total_brigade += br
        total_steam += st
        by_equipment_power[eid] += p
    num_days = max(1, (end_d - start_d).days + 1)
    avg_steam = total_steam / num_days if num_days else 0.0
    return (
        round(total_power, 2),
        round(total_diesel, 2),
        round(total_furnace_oil, 2),
        round(total_brigade, 2),
        avg_steam,
        dict(by_equipment_power),
    )


def _validate_boiler_daily_limits(
    equipment_id: str,
    log_date,
    *,
    power_kwh: float = 0,
    water_liters: float = 0,
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
    limit = _get_boiler_limit_for_date(equipment_id, log_date)
    if not limit:
        return True, []

    base_qs = BoilerLog.objects.filter(equipment_id=equipment_id, timestamp__date=log_date)
    if exclude_log_id is not None:
        base_qs = base_qs.exclude(pk=exclude_log_id)

    agg = base_qs.aggregate(
        power=Sum('daily_power_consumption_kwh'),
        water=Sum('daily_water_consumption_liters'),
        diesel=Sum('daily_diesel_consumption_liters'),
        furnace_oil=Sum('daily_furnace_oil_consumption_liters'),
        brigade=Sum('daily_brigade_consumption_kg'),
        steam=Sum('steam_consumption_kg_hr'),
    )
    total_power = (agg['power'] or 0) + (power_kwh or 0)
    total_water = (agg['water'] or 0) + (water_liters or 0)
    total_diesel = (agg['diesel'] or 0) + (diesel_liters or 0)
    total_furnace_oil = (agg['furnace_oil'] or 0) + (furnace_oil_liters or 0)
    total_brigade = (agg['brigade'] or 0) + (brigade_kg or 0)
    total_steam = (agg['steam'] or 0) + (steam_kg_hr or 0)

    errors = []
    if limit.daily_power_limit_kw is not None and total_power > limit.daily_power_limit_kw:
        errors.append(f"Daily power limit ({limit.daily_power_limit_kw} kWh) exceeded for this boiler.")
    if limit.daily_water_limit_liters is not None and total_water > limit.daily_water_limit_liters:
        errors.append("Daily water consumption limit exceeded for this boiler.")
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
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = filter_queryset_by_equipment_scope(qs, self.request.user)
        if self.action != 'list':
            return qs
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        equipment_id = self.request.query_params.get('equipment_id')
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        if date_from:
            try:
                dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(timestamp__gte=dt)
            except (ValueError, TypeError):
                pass
        if date_to:
            try:
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
        assert_user_can_access_equipment(self.request.user, validated.get("equipment_id"))
        equipment_id = validated.get('equipment_id')
        activity_type = validated.get('activity_type') or 'operation'
        timestamp = validated.get('timestamp') or timezone.now()
        base_qs = BoilerLog.objects.filter(equipment_id=equipment_id)
        interval, shift_hours = get_interval_for_equipment(equipment_id or "", "boiler")
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if base_qs.filter(timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        if activity_type == 'operation':
            log_date = (timestamp or timezone.now()).date()
            ok, limit_errors = _validate_boiler_daily_limits(
                equipment_id=equipment_id,
                log_date=log_date,
                power_kwh=validated.get('daily_power_consumption_kwh') or 0,
                water_liters=validated.get('daily_water_consumption_liters') or 0,
                diesel_liters=validated.get('daily_diesel_consumption_liters') or 0,
                furnace_oil_liters=validated.get('daily_furnace_oil_consumption_liters') or 0,
                brigade_kg=validated.get('daily_brigade_consumption_kg') or 0,
                steam_kg_hr=validated.get('steam_consumption_kg_hr') or 0,
            )
            if not ok:
                raise ValidationError({'detail': limit_errors})
        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="boiler_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
            extra={
                "equipment_id": str(log.equipment_id or ""),
                "log_timestamp": timezone.localtime(log.timestamp).isoformat() if log.timestamp else "",
                "log_date": str(log.timestamp.date()) if log.timestamp else "",
            },
        )

    def perform_update(self, serializer):
        """Validate daily limits before saving update."""
        instance = serializer.instance
        if (
            instance.status in ("rejected", "pending_secondary_approval")
            and instance.operator_id
            and instance.operator_id != self.request.user.id
        ):
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        validated = serializer.validated_data
        next_timestamp = validated.get("timestamp", instance.timestamp)
        next_equipment_id = validated.get("equipment_id", instance.equipment_id)
        assert_user_can_access_equipment(self.request.user, next_equipment_id)
        interval, shift_hours = get_interval_for_equipment(next_equipment_id or "", "boiler")
        slot_start, slot_end = get_slot_range(next_timestamp, interval, shift_hours)
        duplicate_exists = (
            BoilerLog.objects.filter(
                equipment_id=next_equipment_id,
                timestamp__gte=slot_start,
                timestamp__lt=slot_end,
            )
            .exclude(pk=instance.pk)
            .exists()
        )
        if duplicate_exists:
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        activity_type = validated.get('activity_type') if 'activity_type' in validated else getattr(instance, 'activity_type', 'operation')
        log_date = (instance.timestamp or timezone.now()).date()

        def _get(field, default=None):
            return validated.get(field) if field in validated else getattr(instance, field, default)

        if (activity_type or 'operation') == 'operation':
            ok, limit_errors = _validate_boiler_daily_limits(
                equipment_id=instance.equipment_id,
                log_date=log_date,
                power_kwh=_get('daily_power_consumption_kwh') or 0,
                water_liters=_get('daily_water_consumption_liters') or 0,
                diesel_liters=_get('daily_diesel_consumption_liters') or 0,
                furnace_oil_liters=_get('daily_furnace_oil_consumption_liters') or 0,
                brigade_kg=_get('daily_brigade_consumption_kg') or 0,
                steam_kg_hr=_get('steam_consumption_kg_hr') or 0,
                exclude_log_id=instance.id,
            )
            if not ok:
                raise ValidationError({'detail': limit_errors})
        serializer.save()

    @action(detail=False, methods=['get'], url_path='missing-slots')
    def missing_slots(self, request):
        date_str = (request.query_params.get("date") or "").strip()
        date_from_str = (request.query_params.get("date_from") or "").strip()
        date_to_str = (request.query_params.get("date_to") or "").strip()
        equipment_id_filter = (request.query_params.get("equipment_id") or "").strip()

        range_mode = bool(date_from_str or date_to_str)
        if range_mode and (not date_from_str or not date_to_str):
            return Response(
                {"error": "date_from and date_to are both required for range mode (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if range_mode:
            try:
                day_from = datetime.strptime(date_from_str[:10], "%Y-%m-%d").date()
                day_to = datetime.strptime(date_to_str[:10], "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": "date_from/date_to must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
            if day_to < day_from:
                return Response({"error": "date_to must be on or after date_from."}, status=status.HTTP_400_BAD_REQUEST)
            day_count = (day_to - day_from).days + 1
            if day_count > 366:
                return Response({"error": "Date range cannot exceed 366 days."}, status=status.HTTP_400_BAD_REQUEST)
            days = [day_from + timedelta(days=idx) for idx in range(day_count)]
        else:
            if date_str:
                try:
                    day = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
                except ValueError:
                    return Response({"error": "date must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
            else:
                day = timezone.localdate()
            days = [day]

        slot_tz = get_slot_timezone()
        first_day_start, _ = get_slot_day_bounds(days[0])
        _, last_day_end = get_slot_day_bounds(days[-1])

        range_qs = BoilerLog.objects.filter(timestamp__gte=first_day_start, timestamp__lt=last_day_end)
        if equipment_id_filter:
            range_qs = range_qs.filter(equipment_id=equipment_id_filter)

        timestamps_by_day_equipment = defaultdict(lambda: defaultdict(list))
        daily_last_reading = {}

        active_qs = range_qs.exclude(activity_type__in=["maintenance", "shutdown"])
        for row in active_qs.values("equipment_id", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            local_ts = timezone.localtime(ts, slot_tz)
            day_key = local_ts.date().isoformat()
            timestamps_by_day_equipment[day_key][equipment_id].append(ts)
            prev = daily_last_reading.get((day_key, equipment_id))
            if prev is None or ts > prev:
                daily_last_reading[(day_key, equipment_id)] = ts

        downtime_timestamps_by_day = defaultdict(lambda: defaultdict(list))
        downtime_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
        ).exclude(status="rejected")
        for row in downtime_qs.values("equipment_id", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            local_ts = timezone.localtime(ts, slot_tz)
            day_key = local_ts.date().isoformat()
            downtime_timestamps_by_day[day_key][equipment_id].append(ts)

        open_downtime_timestamps_by_day = defaultdict(lambda: defaultdict(list))
        open_dt_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        for row in open_dt_qs.values("equipment_id", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            local_ts = timezone.localtime(ts, slot_tz)
            day_key = local_ts.date().isoformat()
            open_downtime_timestamps_by_day[day_key][equipment_id].append(ts)

        open_maintenance_suppress_from = {}
        open_ms_qs = BoilerLog.objects.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        if equipment_id_filter:
            open_ms_qs = open_ms_qs.filter(equipment_id=equipment_id_filter)
        for row in open_ms_qs.values("equipment_id", "timestamp"):
            eid = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if not eid or ts is None:
                continue
            start_d = timezone.localtime(ts, slot_tz).date()
            prev = open_maintenance_suppress_from.get(eid)
            if prev is None or start_d < prev:
                open_maintenance_suppress_from[eid] = start_d

        equipment_name_map = {}
        boiler_equipment_rows = Equipment.objects.filter(
            is_active=True,
            category__name__icontains="boiler",
        ).values("equipment_number", "name", "site_id")
        for row in boiler_equipment_rows:
            eq_number = (row.get("equipment_number") or "").strip()
            if eq_number:
                equipment_name_map[eq_number] = format_missing_slots_equipment_label(
                    eq_number,
                    row.get("name"),
                    row.get("site_id"),
                )

        equipment_ids = set()
        historical_equipment_ids = set(
            BoilerLog.objects.exclude(equipment_id__isnull=True)
            .exclude(equipment_id="")
            .values_list("equipment_id", flat=True)
            .distinct()
        )
        equipment_ids.update(historical_equipment_ids)
        equipment_ids.update(equipment_name_map.keys())
        for day_eq_map in timestamps_by_day_equipment.values():
            equipment_ids.update(day_eq_map.keys())
        if equipment_id_filter:
            equipment_ids = {equipment_id_filter}

        global_last_reading = {}
        last_qs = BoilerLog.objects.exclude(equipment_id__isnull=True).exclude(equipment_id="")
        if equipment_id_filter:
            last_qs = last_qs.filter(equipment_id=equipment_id_filter)
        for row in last_qs.values("equipment_id", "timestamp").order_by("equipment_id", "-timestamp"):
            equipment_id = row.get("equipment_id")
            if equipment_id and equipment_id not in global_last_reading:
                global_last_reading[equipment_id] = row.get("timestamp")

        def build_day_payload(day_value):
            day_key = day_value.isoformat()
            equipments_payload = []
            total_expected_slots = 0
            total_present_slots = 0
            total_missing_slots = 0

            for equipment_id in sorted(equipment_ids):
                eid = (equipment_id or "").strip()
                suppress_from = open_maintenance_suppress_from.get(eid)
                if suppress_from is not None and day_value > suppress_from:
                    continue
                interval, shift_hours = get_interval_for_equipment(equipment_id, "boiler")
                op_ts = timestamps_by_day_equipment.get(day_key, {}).get(eid, []) or []
                down_ts = downtime_timestamps_by_day.get(day_key, {}).get(eid, []) or []
                merged_ts = op_ts + down_ts
                stats = compute_missing_slots_for_day(
                    day_value=day_value,
                    timestamps=merged_ts,
                    interval=interval,
                    shift_duration_hours=shift_hours,
                    equipment_identifier=equipment_id,
                    log_type="boiler",
                )
                expected_count = stats["expected_slot_count"]
                present_count = stats["present_slot_count"]
                open_down_ts = open_downtime_timestamps_by_day.get(day_key, {}).get(eid, []) or []
                if open_down_ts:
                    missing_for_display = filter_missing_slots_before_earliest_downtime(
                        stats["missing_slots"],
                        down_ts,
                        interval,
                        shift_hours,
                    )
                else:
                    missing_for_display = stats["missing_slots"]
                missing_count = len(missing_for_display)
                total_expected_slots += expected_count
                total_present_slots += present_count
                total_missing_slots += missing_count
                missing_ranges = [
                    {
                        "slot_start": timezone.localtime(slot["slot_start"], slot_tz).isoformat(),
                        "slot_end": timezone.localtime(slot["slot_end"], slot_tz).isoformat(),
                        "label": (
                            f'{timezone.localtime(slot["slot_start"], slot_tz).strftime("%H:%M")}'
                            f' - {timezone.localtime(slot["slot_end"], slot_tz).strftime("%H:%M")}'
                        ),
                    }
                    for slot in missing_for_display
                ]

                _, day_end = get_slot_day_bounds(day_value)
                global_last = global_last_reading.get(equipment_id)
                last_reading_ts = daily_last_reading.get((day_key, equipment_id))
                if last_reading_ts is None and global_last is not None and global_last < day_end:
                    # Prevent showing a future reading (relative to this day) in historical day rows.
                    last_reading_ts = global_last

                next_due_display = None
                if missing_for_display:
                    next_due_display = timezone.localtime(
                        missing_for_display[0]["slot_start"], slot_tz
                    ).isoformat()

                equipments_payload.append(
                    {
                        "equipment_id": equipment_id,
                        "equipment_name": equipment_name_map.get(equipment_id, equipment_id),
                        "interval": interval,
                        "shift_duration_hours": shift_hours,
                        "expected_slot_count": expected_count,
                        "present_slot_count": present_count,
                        "missing_slot_count": missing_count,
                        "next_due": next_due_display,
                        "last_reading_timestamp": (
                            timezone.localtime(last_reading_ts).isoformat()
                            if last_reading_ts is not None
                            else None
                        ),
                        "missing_slots": missing_ranges,
                    }
                )

            return {
                "date": day_key,
                "log_type": "boiler",
                "total_expected_slots": total_expected_slots,
                "total_present_slots": total_present_slots,
                "total_missing_slots": total_missing_slots,
                "equipment_count": len(equipments_payload),
                "affected_equipment_count": len([e for e in equipments_payload if e["missing_slot_count"] > 0]),
                "equipments": equipments_payload,
            }

        day_payloads = [build_day_payload(day_item) for day_item in days]
        if not range_mode:
            payload = day_payloads[0]
            save_missing_slots_snapshot(
                user=request.user,
                log_type="boiler",
                date_from=days[0],
                date_to=days[0],
                payload=payload,
                filters={"equipment_id": equipment_id_filter or ""},
            )
            return Response(payload)

        payload = {
            "log_type": "boiler",
            "date_from": days[0].isoformat(),
            "date_to": days[-1].isoformat(),
            "day_count": len(day_payloads),
            "days": day_payloads,
            "total_expected_slots": sum(day_payload["total_expected_slots"] for day_payload in day_payloads),
            "total_present_slots": sum(day_payload["total_present_slots"] for day_payload in day_payloads),
            "total_missing_slots": sum(day_payload["total_missing_slots"] for day_payload in day_payloads),
            "affected_day_count": sum(1 for day_payload in day_payloads if day_payload["total_missing_slots"] > 0),
        }
        save_missing_slots_snapshot(
            user=request.user,
            log_type="boiler",
            date_from=days[0],
            date_to=days[-1],
            payload=payload,
            filters={"equipment_id": equipment_id_filter or ""},
        )
        return Response(payload)

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="boiler_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
            extra={
                "equipment_id": str(instance.equipment_id or ""),
                "log_timestamp": timezone.localtime(instance.timestamp).isoformat() if instance.timestamp else "",
                "log_date": str(instance.timestamp.date()) if instance.timestamp else "",
            },
        )
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        """
        Record boiler reading changes in the audit trail on update.
        """
        instance = self.get_object()
        tracked_fields = [
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
            log_audit_event(
                user=request.user,
                event_type="log_corrected",
                object_type="boiler_log",
                object_id=str(updated.id),
                field_name="status",
                old_value="rejected",
                new_value="pending_secondary_approval",
            )

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
        date_from_str = (request.query_params.get('date_from') or '').strip()
        date_to_str = (request.query_params.get('date_to') or '').strip()
        has_custom_range = bool(date_from_str and date_to_str)
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ref_date = datetime.strptime(date_str.strip()[:10], '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'date must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        if ref_date > timezone.localdate():
            return Response({'error': 'future date is not allowed'}, status=status.HTTP_400_BAD_REQUEST)
        if has_custom_range:
            try:
                range_start_d = datetime.strptime(date_from_str[:10], '%Y-%m-%d').date()
                range_end_d = datetime.strptime(date_to_str[:10], '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'date_from/date_to must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
            if range_start_d > range_end_d:
                return Response({'error': 'date_from must be <= date_to'}, status=status.HTTP_400_BAD_REQUEST)
            today_d = timezone.localdate()
            if range_end_d > today_d:
                return Response({'error': 'future date is not allowed'}, status=status.HTTP_400_BAD_REQUEST)
            ref_date = range_end_d
        equipment_id = request.query_params.get('equipment_id', '').strip() or None

        if has_custom_range:
            period_start = timezone.make_aware(datetime.combine(range_start_d, datetime.min.time()))
            period_end = timezone.make_aware(datetime.combine(range_end_d, datetime.max.time().replace(microsecond=999999)))
            days_in_period = (range_end_d - range_start_d).days + 1
        elif period_type == 'day':
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

        period_start_d = period_start.date() if hasattr(period_start, 'date') else period_start
        period_end_d = period_end.date() if hasattr(period_end, 'date') else period_end

        if has_custom_range:
            (
                actual_power_kwh,
                actual_diesel,
                actual_furnace_oil,
                actual_brigade,
                actual_steam_kg_hr,
                by_equipment_power,
            ) = _actual_boiler_for_date_range(period_start_d, period_end_d, equipment_id)
            actual_oil_liters = actual_diesel + actual_furnace_oil
        elif period_type == 'day':
            actual_power_kwh, actual_diesel, actual_furnace_oil, actual_brigade, actual_steam_kg_hr = _actual_boiler_for_date(
                ref_date, equipment_id
            )
            actual_oil_liters = actual_diesel + actual_furnace_oil
            by_equipment_power = {equipment_id: actual_power_kwh} if equipment_id else {}
            for eid in (BoilerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct() if not equipment_id else [equipment_id]):
                by_equipment_power[eid] = _actual_boiler_for_date(ref_date, eid)[0]
        else:
            (
                actual_power_kwh,
                actual_diesel,
                actual_furnace_oil,
                actual_brigade,
                actual_steam_kg_hr,
                by_equipment_power,
            ) = _actual_boiler_for_date_range(period_start_d, period_end_d, equipment_id)
            actual_oil_liters = actual_diesel + actual_furnace_oil

        equipment_ids_in_logs = set(by_equipment_power.keys()) if by_equipment_power else set()
        if ManualBoilerConsumption is not None:
            manual_eids = set(
                ManualBoilerConsumption.objects.filter(
                    date__gte=period_start_d,
                    date__lte=period_end_d,
                ).values_list('equipment_id', flat=True).distinct()
            )
            if equipment_id:
                manual_eids = {e for e in manual_eids if e == equipment_id}
            equipment_ids_in_logs = equipment_ids_in_logs | manual_eids
        configured_boiler_ids = set(
            BoilerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct()
        )
        if equipment_id:
            has_data = bool(
                equipment_ids_in_logs
                or equipment_id in configured_boiler_ids
                or BoilerEquipmentLimit.objects.filter(equipment_id=equipment_id).exists()
            )
            limit_equipment_ids = [equipment_id] if has_data else []
        else:
            limit_equipment_ids = list(configured_boiler_ids)
            if equipment_ids_in_logs:
                limit_equipment_ids = list(set(limit_equipment_ids) | equipment_ids_in_logs)

        if period_type == 'day':
            for eid in limit_equipment_ids:
                if eid not in by_equipment_power:
                    by_equipment_power[eid] = _actual_boiler_for_date(ref_date, eid)[0]

        if has_custom_range:
            limit_lookup_date = period_end_d
        elif period_type == 'day':
            limit_lookup_date = ref_date
        elif period_type == 'month':
            _, last_day_m = calendar.monthrange(ref_date.year, ref_date.month)
            limit_lookup_date = date(ref_date.year, ref_date.month, last_day_m)
        else:
            limit_lookup_date = date(ref_date.year, 12, 31)

        limit_power_kwh = 0.0
        limit_diesel = 0.0
        limit_furnace_oil = 0.0
        limit_brigade = 0.0
        limit_steam_kg_hr = 0.0
        by_equipment = []
        for eid in limit_equipment_ids:
            limit_row = _get_boiler_limit_for_display(eid, limit_lookup_date)
            # Keep by-equipment limits aligned with projected summary logic for all periods,
            # including day: use only exact configured dates in the selected range.
            limit_for_period = _projected_boiler_exact_dates(period_start_d, period_end_d, eid)[0]
            limit_power_kwh += limit_for_period
            limit_diesel += (getattr(limit_row, 'daily_diesel_limit_liters', None) or 0) * days_in_period if limit_row else 0
            limit_furnace_oil += (getattr(limit_row, 'daily_furnace_oil_limit_liters', None) or 0) * days_in_period if limit_row else 0
            limit_brigade += (getattr(limit_row, 'daily_brigade_limit_kg', None) or 0) * days_in_period if limit_row else 0
            limit_steam_kg_hr += (getattr(limit_row, 'daily_steam_limit_kg_hr', None) or 0) * days_in_period * 24 if limit_row else 0
            actual_e = by_equipment_power.get(eid, 0.0)
            by_equipment.append({
                'equipment_id': eid,
                'actual_power_kwh': round(actual_e, 2),
                'limit_power_kwh': round(limit_for_period, 2),
            })
        limit_power_kwh = round(limit_power_kwh, 2)
        limit_diesel = round(limit_diesel, 2)
        limit_furnace_oil = round(limit_furnace_oil, 2)
        limit_brigade = round(limit_brigade, 2)
        limit_steam_kg_hr = round(limit_steam_kg_hr, 2)
        limit_oil_liters = round(limit_diesel + limit_furnace_oil, 2)

        total_oil_liters = actual_diesel + actual_furnace_oil
        efficiency_ratio = (actual_steam_kg_hr / total_oil_liters) if total_oil_liters and total_oil_liters > 0 else None
        actual_steam_scaled = round(actual_steam_kg_hr * days_in_period * 24, 2)

        projected_power_kwh = None
        actual_cost_rs = 0.0
        projected_cost_rs = None
        # Projected uses only exact configured dates in selected period (no carry-forward).
        (
            projected_power_kwh,
            projected_diesel_liters,
            projected_furnace_oil_liters,
            projected_brigade_kg,
            _projected_steam_scaled,
        ) = _projected_boiler_exact_dates(period_start.date(), period_end.date(), equipment_id)

        rate_limit = _get_boiler_rate_row_for_scope(equipment_id, limit_equipment_ids, limit_lookup_date)
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
        if projected_power_kwh is not None:
            projected_cost_rs = _projected_boiler_cost_exact_dates(period_start_d, period_end_d, equipment_id)

        payload = {
            'period_type': period_type,
            'period_start': period_start.date().isoformat(),
            'period_end': period_end.date().isoformat(),
            'days_in_period': days_in_period,
            'has_boiler_equipment': len(limit_equipment_ids) > 0,
            'actual_power_kwh': round(actual_power_kwh, 2),
            'limit_power_kwh': limit_power_kwh,
            'actual_oil_liters': round(actual_oil_liters, 2),
            'limit_oil_liters': limit_oil_liters,
            'actual_diesel_liters': round(actual_diesel, 2),
            'limit_diesel_liters': limit_diesel,
            'projected_diesel_liters': projected_diesel_liters,
            'actual_furnace_oil_liters': round(actual_furnace_oil, 2),
            'limit_furnace_oil_liters': limit_furnace_oil,
            'projected_furnace_oil_liters': projected_furnace_oil_liters,
            'actual_brigade_kg': round(actual_brigade, 2),
            'limit_brigade_kg': limit_brigade,
            'projected_brigade_kg': projected_brigade_kg,
            'actual_steam_kg_hr': actual_steam_scaled,
            'limit_steam_kg_hr': limit_steam_kg_hr,
            'projected_steam_kg_hr': _projected_steam_scaled,
            'efficiency_ratio': round(efficiency_ratio, 4) if efficiency_ratio is not None else None,
            'by_equipment': by_equipment,
        }
        if projected_power_kwh is not None:
            payload['projected_power_kwh'] = projected_power_kwh
        payload['actual_cost_rs'] = actual_cost_rs
        if projected_cost_rs is not None:
            payload['projected_cost_rs'] = projected_cost_rs
        utilization_pct = (actual_power_kwh / limit_power_kwh * 100) if limit_power_kwh > 0 else None
        payload['utilization_pct'] = round(utilization_pct, 2) if utilization_pct is not None else None
        payload['kwh_per_day'] = round(actual_power_kwh / days_in_period, 2) if days_in_period else 0
        if has_custom_range:
            payload['period_type'] = 'custom'
        return Response(payload)

    @action(detail=False, methods=['get'], url_path='dashboard_series')
    def dashboard_series(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_id=...&days=1
        Returns time-series for charts: actual vs projected (power, cost, fuel by type, steam).
        Actuals from ManualBoilerConsumption (Consumption module), projected = limits from Settings.
        """
        period_type = (request.query_params.get('period_type') or 'day').lower()
        if period_type not in ('day', 'month', 'year'):
            return Response({'error': 'period_type must be day, month, or year'}, status=status.HTTP_400_BAD_REQUEST)
        date_from_str = (request.query_params.get('date_from') or '').strip()
        date_to_str = (request.query_params.get('date_to') or '').strip()
        has_custom_range = bool(date_from_str and date_to_str)
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ref_date = datetime.strptime(date_str.strip()[:10], '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'date must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        if has_custom_range:
            try:
                range_start_d = datetime.strptime(date_from_str[:10], '%Y-%m-%d').date()
                range_end_d = datetime.strptime(date_to_str[:10], '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'date_from/date_to must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
            if range_start_d > range_end_d:
                return Response({'error': 'date_from must be <= date_to'}, status=status.HTTP_400_BAD_REQUEST)
            if range_end_d > timezone.localdate():
                return Response({'error': 'future date is not allowed'}, status=status.HTTP_400_BAD_REQUEST)
            ref_date = range_end_d
        equipment_id = request.query_params.get('equipment_id', '').strip() or None
        days_param = request.query_params.get('days')
        series_days = int(days_param) if days_param and str(days_param).isdigit() else 1
        series_days = max(1, min(31, series_days))

        limit_eids = list(BoilerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())

        series = []
        try:
            if has_custom_range:
                (
                    actual_power_kwh,
                    actual_diesel,
                    actual_furnace_oil,
                    actual_brigade,
                    actual_steam_kg_hr,
                    _,
                ) = _actual_boiler_for_date_range(range_start_d, range_end_d, equipment_id)
                rate_limit = _get_boiler_rate_row_for_scope(equipment_id, limit_eids, range_end_d)
                power_rate = float(rate_limit.electricity_rate_rs_per_kwh or 0) if rate_limit else 0
                diesel_rate = float(getattr(rate_limit, 'diesel_rate_rs_per_liter', None) or 0) if rate_limit else 0
                fo_rate = float(getattr(rate_limit, 'furnace_oil_rate_rs_per_liter', None) or 0) if rate_limit else 0
                brigade_rate = float(getattr(rate_limit, 'brigade_rate_rs_per_kg', None) or 0) if rate_limit else 0
                proj_power, proj_diesel, proj_fo, proj_br, proj_steam = _projected_boiler_exact_dates(
                    range_start_d, range_end_d, equipment_id
                )
                if proj_power == 0:
                    actual_cost = 0.0
                    proj_cost = 0.0
                else:
                    actual_cost = round(
                        actual_power_kwh * power_rate
                        + actual_diesel * diesel_rate
                        + actual_furnace_oil * fo_rate
                        + actual_brigade * brigade_rate,
                        2,
                    )
                    proj_cost = _projected_boiler_cost_exact_dates(range_start_d, range_end_d, equipment_id)
                series.append({
                    'date': range_start_d.isoformat(),
                    'label': f"{range_start_d.strftime('%d %b')} - {range_end_d.strftime('%d %b')}",
                    'actual_power_kwh': round(actual_power_kwh, 2),
                    'projected_power_kwh': round(proj_power, 2),
                    'actual_cost_rs': actual_cost,
                    'projected_cost_rs': proj_cost,
                    'actual_diesel_liters': round(actual_diesel, 2),
                    'projected_diesel_liters': round(proj_diesel, 2),
                    'actual_furnace_oil_liters': round(actual_furnace_oil, 2),
                    'projected_furnace_oil_liters': round(proj_fo, 2),
                    'actual_brigade_kg': round(actual_brigade, 2),
                    'projected_brigade_kg': round(proj_br, 2),
                    'actual_steam_kg_hr': round(actual_steam_kg_hr * ((range_end_d - range_start_d).days + 1) * 24, 2),
                    'projected_steam_kg_hr': round(proj_steam, 2),
                })
            elif period_type == 'day':
                for i in range(series_days - 1, -1, -1):
                    d = ref_date - timedelta(days=i)
                    label = d.strftime('%d %b')
                    p, di, fo, br, st = _actual_boiler_for_date(d, equipment_id)
                    rate_limit = _get_boiler_rate_row_for_scope(equipment_id, limit_eids, d)
                    power_rate = float(rate_limit.electricity_rate_rs_per_kwh or 0) if rate_limit else 0
                    diesel_rate = float(getattr(rate_limit, 'diesel_rate_rs_per_liter', None) or 0) if rate_limit else 0
                    fo_rate = float(getattr(rate_limit, 'furnace_oil_rate_rs_per_liter', None) or 0) if rate_limit else 0
                    brigade_rate = float(getattr(rate_limit, 'brigade_rate_rs_per_kg', None) or 0) if rate_limit else 0
                    proj_power, proj_diesel, proj_fo, proj_br, proj_steam = _projected_boiler_exact_dates(
                        d, d, equipment_id
                    )
                    if proj_power == 0:
                        proj_power = 0.0
                        actual_cost = 0.0 if power_rate or diesel_rate or fo_rate or brigade_rate else 0.0
                        proj_cost = 0.0
                    else:
                        actual_cost = round(p * power_rate + di * diesel_rate + fo * fo_rate + br * brigade_rate, 2)
                        proj_cost = _projected_boiler_cost_exact_dates(d, d, equipment_id)
                    series.append({
                        'date': d.isoformat(),
                        'label': label,
                        'actual_power_kwh': round(p, 2),
                        'projected_power_kwh': round(proj_power, 2),
                        'actual_cost_rs': actual_cost,
                        'projected_cost_rs': proj_cost,
                        'actual_diesel_liters': round(di, 2),
                        'projected_diesel_liters': round(proj_diesel, 2),
                        'actual_furnace_oil_liters': round(fo, 2),
                        'projected_furnace_oil_liters': round(proj_fo, 2),
                        'actual_brigade_kg': round(br, 2),
                        'projected_brigade_kg': round(proj_br, 2),
                        'actual_steam_kg_hr': round(st * 24, 2),
                        'projected_steam_kg_hr': round(proj_steam, 2),
                    })
            elif period_type == 'month':
                _, last_day_m = calendar.monthrange(ref_date.year, ref_date.month)
                start_d_m = date(ref_date.year, ref_date.month, 1)
                end_d_m = date(ref_date.year, ref_date.month, last_day_m)
                (
                    actual_power_kwh,
                    actual_diesel,
                    actual_furnace_oil,
                    actual_brigade,
                    actual_steam_kg_hr,
                    _,
                ) = _actual_boiler_for_date_range(start_d_m, end_d_m, equipment_id)
                rate_limit = _get_boiler_rate_row_for_scope(equipment_id, limit_eids, end_d_m)
                power_rate = float(rate_limit.electricity_rate_rs_per_kwh or 0) if rate_limit else 0
                diesel_rate = float(getattr(rate_limit, 'diesel_rate_rs_per_liter', None) or 0) if rate_limit else 0
                fo_rate = float(getattr(rate_limit, 'furnace_oil_rate_rs_per_liter', None) or 0) if rate_limit else 0
                brigade_rate = float(getattr(rate_limit, 'brigade_rate_rs_per_kg', None) or 0) if rate_limit else 0
                proj_power, proj_diesel, proj_fo, proj_br, proj_steam = _projected_boiler_exact_dates(
                    start_d_m, end_d_m, equipment_id
                )
                if proj_power == 0:
                    proj_power = 0.0
                    actual_cost = 0.0
                    proj_cost = 0.0
                else:
                    actual_cost = round(
                        actual_power_kwh * power_rate
                        + actual_diesel * diesel_rate
                        + actual_furnace_oil * fo_rate
                        + actual_brigade * brigade_rate,
                        2,
                    )
                    proj_cost = _projected_boiler_cost_exact_dates(start_d_m, end_d_m, equipment_id)
                series.append({
                    'date': start_d_m.isoformat(),
                    'label': start_d_m.strftime('%b %Y'),
                    'actual_power_kwh': round(actual_power_kwh, 2),
                    'projected_power_kwh': round(proj_power, 2),
                    'actual_cost_rs': actual_cost,
                    'projected_cost_rs': proj_cost,
                    'actual_diesel_liters': round(actual_diesel, 2),
                    'projected_diesel_liters': round(proj_diesel, 2),
                    'actual_furnace_oil_liters': round(actual_furnace_oil, 2),
                    'projected_furnace_oil_liters': round(proj_fo, 2),
                    'actual_brigade_kg': round(actual_brigade, 2),
                    'projected_brigade_kg': round(proj_br, 2),
                    'actual_steam_kg_hr': round(actual_steam_kg_hr * last_day_m * 24, 2),
                    'projected_steam_kg_hr': round(proj_steam, 2),
                })
            else:
                period_start_d = date(ref_date.year, 1, 1)
                period_end_d = date(ref_date.year, 12, 31)
                days_in_year = (period_end_d - period_start_d).days + 1
                (
                    actual_power_kwh,
                    actual_diesel,
                    actual_furnace_oil,
                    actual_brigade,
                    actual_steam_kg_hr,
                    _,
                ) = _actual_boiler_for_date_range(period_start_d, period_end_d, equipment_id)
                rate_limit = _get_boiler_rate_row_for_scope(equipment_id, limit_eids, period_end_d)
                power_rate = float(rate_limit.electricity_rate_rs_per_kwh or 0) if rate_limit else 0
                diesel_rate = float(getattr(rate_limit, 'diesel_rate_rs_per_liter', None) or 0) if rate_limit else 0
                fo_rate = float(getattr(rate_limit, 'furnace_oil_rate_rs_per_liter', None) or 0) if rate_limit else 0
                brigade_rate = float(getattr(rate_limit, 'brigade_rate_rs_per_kg', None) or 0) if rate_limit else 0
                proj_power, proj_diesel, proj_fo, proj_br, proj_steam = _projected_boiler_exact_dates(
                    period_start_d, period_end_d, equipment_id
                )
                if proj_power == 0:
                    proj_power = 0.0
                    actual_cost = 0.0
                    proj_cost = 0.0
                else:
                    actual_cost = round(
                        actual_power_kwh * power_rate
                        + actual_diesel * diesel_rate
                        + actual_furnace_oil * fo_rate
                        + actual_brigade * brigade_rate,
                        2,
                    )
                    proj_cost = _projected_boiler_cost_exact_dates(period_start_d, period_end_d, equipment_id)
                series.append({
                    'date': period_start_d.isoformat(),
                    'label': str(ref_date.year),
                    'actual_power_kwh': round(actual_power_kwh, 2),
                    'projected_power_kwh': round(proj_power, 2),
                    'actual_cost_rs': actual_cost,
                    'projected_cost_rs': proj_cost,
                    'actual_diesel_liters': round(actual_diesel, 2),
                    'projected_diesel_liters': round(proj_diesel, 2),
                    'actual_furnace_oil_liters': round(actual_furnace_oil, 2),
                    'projected_furnace_oil_liters': round(proj_fo, 2),
                    'actual_brigade_kg': round(actual_brigade, 2),
                    'projected_brigade_kg': round(proj_br, 2),
                    'actual_steam_kg_hr': round(actual_steam_kg_hr * days_in_year * 24, 2),
                    'projected_steam_kg_hr': round(proj_steam, 2),
                })
        except Exception:
            series = []
        return Response({'series': series})

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
        if original.operator_id and original.operator_id != request.user.id:
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})

        data = request.data.copy()

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        timestamp = validated.pop('timestamp', None)

        payload = {
            **validated,
            'corrects': original,
            'operator': original.operator,
            'operator_name': original.operator_name or (original.operator.email if original.operator else request.user.email),
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
        slot_qs = BoilerLog.objects.filter(
            equipment_id=original.equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        )
        chain_root_id = original.corrects_id or original.pk
        conflict_exists = (
            slot_qs
            .exclude(pk=original.pk)
            .exclude(pk=chain_root_id)
            .exclude(corrects_id=original.pk)
            .exclude(corrects_id=chain_root_id)
            .exists()
        )
        if conflict_exists:
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        activity_type = payload.get('activity_type') or 'operation'
        if activity_type == 'operation':
            log_date = (payload.get('timestamp') or timezone.now()).date()
            ok, limit_errors = _validate_boiler_daily_limits(
                equipment_id=original.equipment_id,
                log_date=log_date,
                power_kwh=payload.get('daily_power_consumption_kwh') or 0,
                water_liters=payload.get('daily_water_consumption_liters') or 0,
                diesel_liters=payload.get('daily_diesel_consumption_liters') or 0,
                furnace_oil_liters=payload.get('daily_furnace_oil_consumption_liters') or 0,
                brigade_kg=payload.get('daily_brigade_consumption_kg') or 0,
                steam_kg_hr=payload.get('steam_consumption_kg_hr') or 0,
                exclude_log_id=original.id,
            )
            if not ok:
                raise ValidationError({'detail': limit_errors})

        new_log = BoilerLog.objects.create(**payload)
        log_audit_event(
            user=request.user,
            event_type="log_corrected",
            object_type="boiler_log",
            object_id=str(new_log.id),
            field_name="corrects_id",
            old_value=str(original.id),
            new_value=str(new_log.id),
        )

        tracked_fields = [
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
            if is_redundant_correction_status_audit(field, before, after):
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
        previous_status = log.status
        action_type = normalize_approval_action(request.data.get('action'))
        remarks = (request.data.get('remarks') or '').strip()
        require_rejection_comment(action_type, remarks)
        forbid_manager_rejecting_reading(request, action_type)

        if action_type == 'approve':
            # Primary/secondary approver must be different from the operator (Log Book Done By)
            ensure_not_operator(log.operator_id, request.user.id, "approved")
            if log.status == 'pending_secondary_approval':
                # Secondary approval must be done by a different person than who rejected
                ensure_secondary_approver_diff(log.approved_by_id, request.user.id)
                log.status = 'approved'
                log.secondary_approved_by = request.user
                log.secondary_approved_at = timezone.now()
            elif log.status in ('pending', 'draft'):
                log.status = 'approved'
            else:
                ensure_status_allowed(log.status, ('pending', 'draft', 'pending_secondary_approval'), 'approve')
        elif action_type == 'reject':
            # Rejector must be different from the operator (Log Book Done By)
            ensure_not_operator(log.operator_id, request.user.id, "rejected")
            ensure_status_allowed(log.status, ('pending', 'draft', 'pending_secondary_approval'), 'reject')
            previous_status = log.status
            log.status = 'rejected'
            log.secondary_approved_by = None
            log.secondary_approved_at = None
            log_audit_event(
                user=request.user,
                event_type="log_rejected",
                object_type="boiler_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
                extra={"remarks": remarks} if remarks else {},
            )
        if action_type == 'reject' or (action_type == 'approve' and log.status == 'approved'):
            log.approved_by = request.user
            log.approved_at = timezone.now()
        if remarks:
            log.comment = remarks
        log.save()

        if action_type == "approve" and log.status == "approved":
            log_audit_event(
                user=request.user,
                event_type="log_approved",
                object_type="boiler_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="approved",
                extra={"remarks": remarks} if remarks else {},
            )
        
        if action_type == 'approve' and log.status == 'approved':
            create_utility_report_for_log(
                log=log,
                source_table='boiler_logs',
                title_prefix='Boiler Monitoring',
                approved_by=request.user,
                remarks=remarks,
            )
        
        serializer = self.get_serializer(log)
        return Response(serializer.data)


class BoilerEquipmentLimitViewSet(viewsets.ModelViewSet):
    """ViewSet for boiler equipment daily limits (power, water, chemical). Write: Manager/Super Admin."""
    permission_classes = [IsAuthenticated]
    serializer_class = BoilerEquipmentLimitSerializer
    queryset = BoilerEquipmentLimit.objects.all()
    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get('equipment_id')
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return filter_queryset_by_equipment_scope(qs, self.request.user)

    def get_object(self):
        """
        Backward-compatible lookup:
        - Prefer UUID primary key (new date-wise Settings saves update by row id)
        - Fallback to equipment_id path (returns latest row)
        """
        lookup_value = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        queryset = self.filter_queryset(self.get_queryset())

        try:
            limit_id = UUID(str(lookup_value))
            obj = queryset.get(pk=limit_id)
            self.check_object_permissions(self.request, obj)
            return obj
        except (ValueError, TypeError, BoilerEquipmentLimit.DoesNotExist):
            pass

        obj = (
            queryset.filter(equipment_id=lookup_value)
            .order_by("-effective_from", "-updated_at", "-created_at")
            .first()
        )
        if obj is None:
            raise Http404
        self.check_object_permissions(self.request, obj)
        return obj
