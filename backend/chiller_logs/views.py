from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from core.log_slot_utils import (
    get_interval_for_equipment,
    get_slot_range,
    compute_missing_slots_for_day,
    get_slot_day_bounds,
    get_slot_timezone,
    format_missing_slots_equipment_label,
)
from .models import ChillerLog, ChillerEquipmentStatusAudit, ChillerEquipmentLimit, ChillerDashboardConfig
from .serializers import ChillerLogSerializer, ChillerEquipmentLimitSerializer
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrAdmin
from reports.utils import log_limit_change, log_audit_event, save_missing_slots_snapshot
from reports.services import create_utility_report_for_log
from reports.approval_workflow import (
    ensure_not_operator,
    ensure_secondary_approver_diff,
    ensure_status_allowed,
    normalize_approval_action,
    require_rejection_comment,
)
from django.db.models import Sum
from datetime import datetime, date, timedelta
from collections import defaultdict
import calendar
from equipment.models import Equipment

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."

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

    Dashboard display must match the same date-effective rule used by save and
    validation paths.
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
    Actual power (kWh) for one day from ManualChillerConsumption only.
    """
    if ManualChillerConsumption is None:
        return 0.0
    if eid_filter:
        m = ManualChillerConsumption.objects.filter(equipment_id=eid_filter, date=d).first()
        return round(float(m.power_kwh or 0), 2) if m is not None else 0.0
    agg = ManualChillerConsumption.objects.filter(date=d).aggregate(s=Sum('power_kwh'))
    return round(float(agg['s'] or 0), 2)


def _actual_power_for_date_range(start_d, end_d, eid_filter=None):
    """
    Actual power (kWh) for a date range from ManualChillerConsumption only.
    Returns (total_kwh, by_equipment_dict).
    """
    if ManualChillerConsumption is None:
        return 0.0, {}
    manual_qs = ManualChillerConsumption.objects.filter(
        date__gte=start_d,
        date__lte=end_d,
    )
    if eid_filter:
        manual_qs = manual_qs.filter(equipment_id=eid_filter)
    by_day_equipment = {
        (r['date'], r['equipment_id']): float(r['power_kwh'] or 0)
        for r in manual_qs.values('date', 'equipment_id', 'power_kwh')
    }
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
        """Set operator and apply daily pump/fan status logic with audit trail."""
        validated = serializer.validated_data
        equipment_id = validated.get('equipment_id')
        activity_type = validated.get('activity_type') or 'operation'
        timestamp = validated.get('timestamp') or timezone.now()
        base_qs = ChillerLog.objects.filter(equipment_id=equipment_id)
        interval, shift_hours = get_interval_for_equipment(equipment_id or "", "chiller")
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if base_qs.filter(timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
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
        interval, shift_hours = get_interval_for_equipment(next_equipment_id or "", "chiller")
        slot_start, slot_end = get_slot_range(next_timestamp, interval, shift_hours)
        duplicate_exists = (
            ChillerLog.objects.filter(
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

        range_qs = ChillerLog.objects.filter(timestamp__gte=first_day_start, timestamp__lt=last_day_end)
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

        suppressed_by_day = defaultdict(set)
        suppressed_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        for row in suppressed_qs.values("equipment_id", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            suppressed_by_day[day_key].add(equipment_id)

        equipment_name_map = {}
        chiller_equipment_rows = Equipment.objects.filter(
            is_active=True,
            category__name__icontains="chiller",
        ).values("equipment_number", "name", "site_id")
        for row in chiller_equipment_rows:
            eq_number = (row.get("equipment_number") or "").strip()
            if eq_number:
                equipment_name_map[eq_number] = format_missing_slots_equipment_label(
                    eq_number,
                    row.get("name"),
                    row.get("site_id"),
                )

        equipment_ids = set()
        historical_equipment_ids = set(
            ChillerLog.objects.exclude(equipment_id__isnull=True)
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
        last_qs = ChillerLog.objects.exclude(equipment_id__isnull=True).exclude(equipment_id="")
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
            suppressed_for_day = suppressed_by_day.get(day_key, set())

            for equipment_id in sorted(equipment_ids):
                if not equipment_id_filter and equipment_id in suppressed_for_day:
                    continue

                interval, shift_hours = get_interval_for_equipment(equipment_id, "chiller")
                stats = compute_missing_slots_for_day(
                    day_value=day_value,
                    timestamps=timestamps_by_day_equipment.get(day_key, {}).get(equipment_id, []),
                    interval=interval,
                    shift_duration_hours=shift_hours,
                    equipment_identifier=equipment_id,
                    log_type="chiller",
                )
                expected_count = stats["expected_slot_count"]
                present_count = stats["present_slot_count"]
                missing_count = stats["missing_slot_count"]
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
                    for slot in stats["missing_slots"]
                ]

                _, day_end = get_slot_day_bounds(day_value)
                global_last = global_last_reading.get(equipment_id)
                last_reading_ts = daily_last_reading.get((day_key, equipment_id))
                if last_reading_ts is None and global_last is not None and global_last < day_end:
                    # Prevent showing a future reading (relative to this day) in historical day rows.
                    last_reading_ts = global_last

                equipments_payload.append(
                    {
                        "equipment_id": equipment_id,
                        "equipment_name": equipment_name_map.get(equipment_id, equipment_id),
                        "interval": interval,
                        "shift_duration_hours": shift_hours,
                        "expected_slot_count": expected_count,
                        "present_slot_count": present_count,
                        "missing_slot_count": missing_count,
                        "next_due": (
                            timezone.localtime(stats["next_due"]).isoformat()
                            if stats["next_due"] is not None
                            else None
                        ),
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
                "log_type": "chiller",
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
                log_type="chiller",
                date_from=days[0],
                date_to=days[0],
                payload=payload,
                filters={"equipment_id": equipment_id_filter or ""},
            )
            return Response(payload)

        payload = {
            "log_type": "chiller",
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
            log_type="chiller",
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
            object_type="chiller_log",
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
            log_audit_event(
                user=request.user,
                event_type="log_corrected",
                object_type="chiller_log",
                object_id=str(updated.id),
                field_name="status",
                old_value="rejected",
                new_value="pending_secondary_approval",
            )

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
        actual_cost_rs = 0.0
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
        if rate is not None:
            actual_cost_rs = round(actual_power_kwh * rate, 2)
        if projected_power_kwh is not None:
            projected_cost_rs = round(projected_power_kwh * rate, 2) if rate is not None else 0.0

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
                limit_row = _get_limit_for_display(eid_filter, d)
                daily_kw = (limit_row.daily_power_limit_kw or 0) if limit_row else 0
                return round(daily_kw * 1, 2)
            limit_ids = list(ChillerEquipmentLimit.objects.values_list('equipment_id', flat=True).distinct())
            total = 0.0
            for eid in limit_ids:
                limit_row = _get_limit_for_display(eid, d)
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
                        actual_cost = 0.0
                        proj_cost = 0.0
                    else:
                        proj_kwh = round(projected_kwh_month / month_days, 2) if projected_kwh_month is not None else limit
                        actual_cost = round(actual * rate_rs, 2) if rate_rs is not None else 0.0
                        proj_cost = round(proj_kwh * rate_rs, 2) if (rate_rs is not None and proj_kwh is not None) else 0.0
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
                    actual_cost_m = 0.0
                    proj_cost_m = 0.0
                else:
                    proj_kwh_m = round(projected_kwh_month, 2) if projected_kwh_month is not None else limit_m
                    actual_cost_m = round(actual_m * rate_rs, 2) if rate_rs is not None else 0.0
                    proj_cost_m = round(proj_kwh_m * rate_rs, 2) if (rate_rs is not None and proj_kwh_m is not None) else 0.0
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
                    actual_cost_y = 0.0
                    projected_cost_y = 0.0
                else:
                    projected_power_kwh_y = (
                        round(projected_kwh_month * 12, 2) if projected_kwh_month is not None else limit_power_kwh_y
                    )
                    actual_cost_y = round(actual_power_kwh * rate_rs, 2) if rate_rs is not None else 0.0
                    projected_cost_y = (
                        round(projected_power_kwh_y * rate_rs, 2)
                        if (rate_rs is not None and projected_power_kwh_y is not None)
                        else 0.0
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
        if original.operator_id and original.operator_id != request.user.id:
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})

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
        interval, shift_hours = get_interval_for_equipment(original.equipment_id or '', 'chiller')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        slot_qs = ChillerLog.objects.filter(
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

        new_log = ChillerLog.objects.create(**payload)
        log_audit_event(
            user=request.user,
            event_type="log_corrected",
            object_type="chiller_log",
            object_id=str(new_log.id),
            field_name="corrects_id",
            old_value=str(original.id),
            new_value=str(new_log.id),
        )

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
        action_type = normalize_approval_action(request.data.get('action'))
        remarks = (request.data.get('remarks') or '').strip()
        require_rejection_comment(action_type, remarks)
        
        if action_type == 'approve':
            # Primary/secondary approver must be different from the operator (Log Book Done By)
            ensure_not_operator(log.operator_id, request.user.id, "approved")
            if log.status == 'pending_secondary_approval':
                # Secondary approval must be done by a different person than who rejected
                ensure_secondary_approver_diff(log.approved_by_id, request.user.id)
                # Secondary approval (after correction)
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
                object_type="chiller_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
            )
        if action_type == 'reject' or (action_type == 'approve' and log.status == 'approved'):
            log.approved_by = request.user
            log.approved_at = timezone.now()
        if remarks:
            log.comment = remarks
        log.save()
        
        # Create report entry when approved (primary or secondary)
        if action_type == 'approve' and log.status == 'approved':
            create_utility_report_for_log(
                log=log,
                source_table='chiller_logs',
                title_prefix='Chiller Monitoring',
                approved_by=request.user,
                remarks=remarks,
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
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get('equipment_id')
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs
