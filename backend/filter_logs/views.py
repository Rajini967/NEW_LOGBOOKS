from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import uuid
from datetime import datetime, timedelta
from collections import defaultdict

from accounts.permissions import CanApproveReports, CanLogEntries, IsSuperAdmin, forbid_manager_rejecting_reading
from core.equipment_scope import assert_user_can_access_equipment, filter_queryset_by_equipment_scope
from equipment.models import Equipment
from core.log_slot_utils import (
    get_interval_for_equipment,
    get_slot_range,
    compute_missing_slots_for_day,
    get_slot_day_bounds,
    get_slot_timezone,
    filter_missing_slots_before_earliest_downtime,
)
from reports.utils import (
    log_limit_change,
    log_audit_event,
    delete_report_entry,
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

from .models import FilterLog
from .serializers import FilterLogSerializer

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."

FILTER_LOG_DUPLICATE_SLOT_DETAIL = (
    "An entry already exists for this equipment, area, filter number, and time slot."
)


def _filter_report_equipment_title(equipment_id: str) -> str:
    """Human-readable equipment line for approved report title (site stays UUID for matching)."""
    if not equipment_id:
        return "N/A"
    try:
        uid = uuid.UUID(str(equipment_id))
        eq = Equipment.objects.only("equipment_number", "name").filter(pk=uid).first()
        if eq:
            num = (eq.equipment_number or "").strip()
            name = (eq.name or "").strip()
            if num and name:
                return f"{num} – {name}"
            return name or num or equipment_id
    except (ValueError, TypeError, AttributeError):
        pass
    return equipment_id


def filterlog_same_slot_bucket_qs(queryset, equipment_id, area_category, filter_no):
    """
    Same equipment + same area category + same filter number share one hourly/shift/daily slot
    for duplicate checks. Blank/null area_category or filter_no each form a single bucket so
    legacy rows do not block each other by text alone.
    """
    qs = queryset.filter(equipment_id=equipment_id)
    ac = (area_category or "").strip() if area_category is not None else ""
    if ac:
        qs = qs.filter(area_category__iexact=ac)
    else:
        qs = qs.filter(Q(area_category__isnull=True) | Q(area_category=""))
    fn = (filter_no or "").strip() if filter_no is not None else ""
    if fn:
        qs = qs.filter(filter_no__iexact=fn)
    else:
        qs = qs.filter(Q(filter_no__isnull=True) | Q(filter_no=""))
    return qs


class FilterLogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FilterLogSerializer
    queryset = FilterLog.objects.all()

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
        status_param = self.request.query_params.get('status')
        if status_param and status_param.lower() == 'approved':
            qs = qs.filter(status='approved')
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
        return qs.order_by('-timestamp')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        validated = serializer.validated_data
        assert_user_can_access_equipment(self.request.user, validated.get("equipment_id"))
        equipment_id = validated.get('equipment_id')
        area_category = validated.get('area_category')
        filter_no = validated.get('filter_no')
        timestamp = validated.get('timestamp') or timezone.now()
        base_qs = filterlog_same_slot_bucket_qs(
            FilterLog.objects.all(), equipment_id, area_category, filter_no
        )
        interval, shift_hours = get_interval_for_equipment(equipment_id or "", "filter")
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if base_qs.filter(timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
            raise ValidationError({"detail": [FILTER_LOG_DUPLICATE_SLOT_DETAIL]})
        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
        )
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="filter_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
            extra={
                "equipment_id": str(log.equipment_id or ""),
                "filter_no": str(log.filter_no or ""),
                "log_timestamp": timezone.localtime(log.timestamp).isoformat() if log.timestamp else "",
                "log_date": str(log.timestamp.date()) if log.timestamp else "",
            },
        )

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail and remove report entry before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="filter_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
            extra={
                "equipment_id": str(instance.equipment_id or ""),
                "filter_no": str(instance.filter_no or ""),
                "log_timestamp": timezone.localtime(instance.timestamp).isoformat() if instance.timestamp else "",
                "log_date": str(instance.timestamp.date()) if instance.timestamp else "",
            },
        )
        delete_report_entry(source_id=str(instance.id), source_table='filter_logs')
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if (
            instance.status in ("rejected", "pending_secondary_approval")
            and instance.operator_id
            and instance.operator_id != request.user.id
        ):
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        incoming_timestamp = request.data.get("timestamp")
        if incoming_timestamp:
            try:
                parsed_timestamp = datetime.fromisoformat(str(incoming_timestamp).replace("Z", "+00:00"))
                if timezone.is_naive(parsed_timestamp):
                    parsed_timestamp = timezone.make_aware(parsed_timestamp, timezone.get_current_timezone())
            except ValueError:
                parsed_timestamp = instance.timestamp
        else:
            parsed_timestamp = instance.timestamp
        next_equipment_id = request.data.get("equipment_id") or instance.equipment_id
        next_area = request.data.get("area_category")
        if next_area is None:
            next_area = instance.area_category
        next_filter_no = request.data.get("filter_no")
        if next_filter_no is None:
            next_filter_no = instance.filter_no
        interval, shift_hours = get_interval_for_equipment(next_equipment_id or "", "filter")
        slot_start, slot_end = get_slot_range(parsed_timestamp, interval, shift_hours)
        duplicate_exists = (
            filterlog_same_slot_bucket_qs(
                FilterLog.objects.all(), next_equipment_id, next_area, next_filter_no
            )
            .filter(timestamp__gte=slot_start, timestamp__lt=slot_end)
            .exclude(pk=instance.pk)
            .exists()
        )
        if duplicate_exists:
            raise ValidationError({"detail": [FILTER_LOG_DUPLICATE_SLOT_DETAIL]})

        tracked_fields = [
            'equipment_id',
            'category',
            'filter_no',
            'filter_micron',
            'filter_size',
            'installed_date',
            'integrity_done_date',
            'integrity_due_date',
            'cleaning_done_date',
            'cleaning_due_date',
            'replacement_due_date',
            'remarks',
            'status',
            'timestamp',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        updated = self.get_object()
        user = request.user
        extra_base = {
            "equipment_id": updated.equipment_id,
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
                object_type="filter_log",
                key=str(updated.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_update",
            )
        if instance.status == "rejected":
            updated.status = "pending_secondary_approval"
            updated.save(update_fields=["status"])
            log_audit_event(
                user=request.user,
                event_type="log_corrected",
                object_type="filter_log",
                object_id=str(updated.id),
                field_name="status",
                old_value="rejected",
                new_value="pending_secondary_approval",
            )

        return response

    @action(detail=False, methods=['get'], url_path='missing-slots')
    def missing_slots(self, request):
        date_str = (request.query_params.get("date") or "").strip()
        date_from_str = (request.query_params.get("date_from") or "").strip()
        date_to_str = (request.query_params.get("date_to") or "").strip()
        equipment_id_filter = (request.query_params.get("equipment_id") or "").strip()
        range_mode = bool(date_from_str or date_to_str)

        if range_mode and date_str:
            return Response(
                {"error": "Use either date or date_from/date_to, not both."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def parse_day(raw: str, field_name: str):
            try:
                return datetime.strptime(raw[:10], "%Y-%m-%d").date()
            except ValueError:
                raise ValidationError({"error": f"{field_name} must be YYYY-MM-DD"})

        if range_mode:
            if not (date_from_str and date_to_str):
                return Response(
                    {"error": "Both date_from and date_to are required for range mode."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                day_from = parse_day(date_from_str, "date_from")
                day_to = parse_day(date_to_str, "date_to")
            except ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            if day_from > day_to:
                return Response(
                    {"error": "date_from cannot be after date_to."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (day_to - day_from).days > 366:
                return Response(
                    {"error": "Date range too large. Maximum span is 366 days."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            days = [day_from + timedelta(days=i) for i in range((day_to - day_from).days + 1)]
        else:
            if date_str:
                try:
                    day = parse_day(date_str, "date")
                except ValidationError as exc:
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            else:
                day = timezone.localdate()
            days = [day]

        slot_tz = get_slot_timezone()
        first_day_start, _ = get_slot_day_bounds(days[0])
        _, last_day_end = get_slot_day_bounds(days[-1])
        range_qs = FilterLog.objects.filter(timestamp__gte=first_day_start, timestamp__lt=last_day_end)
        if equipment_id_filter:
            range_qs = range_qs.filter(equipment_id=equipment_id_filter)

        def bucket_key(equipment_id: str, filter_no: str) -> str:
            return f"{equipment_id}||{filter_no}" if filter_no else equipment_id

        bucket_meta = {}
        timestamps_by_day_bucket = defaultdict(lambda: defaultdict(list))
        daily_last_reading = {}
        active_qs = range_qs.exclude(activity_type__in=["maintenance", "shutdown"])
        for row in active_qs.values("equipment_id", "filter_no", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            key = bucket_key(equipment_id, filter_no)
            bucket_meta[key] = {"equipment_id": equipment_id, "filter_no": filter_no}
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            timestamps_by_day_bucket[day_key][key].append(ts)
            prev = daily_last_reading.get((day_key, key))
            if prev is None or ts > prev:
                daily_last_reading[(day_key, key)] = ts

        downtime_timestamps_by_day = defaultdict(lambda: defaultdict(list))
        downtime_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
        ).exclude(status="rejected")
        for row in downtime_qs.values("equipment_id", "filter_no", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            key = bucket_key(equipment_id, filter_no)
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            downtime_timestamps_by_day[day_key][key].append(ts)

        open_downtime_timestamps_by_day = defaultdict(lambda: defaultdict(list))
        open_dt_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        for row in open_dt_qs.values("equipment_id", "filter_no", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            key = bucket_key(equipment_id, filter_no)
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            open_downtime_timestamps_by_day[day_key][key].append(ts)

        open_maintenance_suppress_from = {}
        open_ms_qs = FilterLog.objects.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        if equipment_id_filter:
            open_ms_qs = open_ms_qs.filter(equipment_id=equipment_id_filter)
        for row in open_ms_qs.values("equipment_id", "filter_no", "timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            ts = row.get("timestamp")
            if not equipment_id or ts is None:
                continue
            key = bucket_key(equipment_id, filter_no)
            start_d = timezone.localtime(ts, slot_tz).date()
            prev = open_maintenance_suppress_from.get(key)
            if prev is None or start_d < prev:
                open_maintenance_suppress_from[key] = start_d

        bucket_keys = set(bucket_meta.keys())
        historical_rows = (
            FilterLog.objects.exclude(equipment_id__isnull=True)
            .exclude(equipment_id="")
            .values("equipment_id", "filter_no")
            .distinct()
        )
        for row in historical_rows:
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            if not equipment_id:
                continue
            key = bucket_key(equipment_id, filter_no)
            bucket_meta.setdefault(key, {"equipment_id": equipment_id, "filter_no": filter_no})
            bucket_keys.add(key)
        if equipment_id_filter:
            bucket_keys = {k for k, meta in bucket_meta.items() if meta.get("equipment_id") == equipment_id_filter}

        uuid_pk_list = []
        for eid in {meta["equipment_id"] for meta in bucket_meta.values() if meta.get("equipment_id")}:
            if not eid:
                continue
            try:
                uuid_pk_list.append(uuid.UUID(str(eid)))
            except (ValueError, TypeError, AttributeError):
                continue
        equipment_by_id = {
            str(obj.id): obj
            for obj in Equipment.objects.filter(pk__in=uuid_pk_list).only(
                "id", "equipment_number", "name"
            )
        }

        def display_name_for_row(equipment_id: str) -> str:
            if not equipment_id:
                return ""
            try:
                uid = uuid.UUID(str(equipment_id))
            except (ValueError, TypeError, AttributeError):
                return equipment_id
            eq = equipment_by_id.get(str(uid))
            if eq is None:
                return equipment_id
            num = (eq.equipment_number or "").strip()
            name = (eq.name or "").strip()
            if num and name:
                return f"{num} – {name}"
            return name or num or equipment_id

        global_last_reading = {}
        last_qs = FilterLog.objects.exclude(equipment_id__isnull=True).exclude(equipment_id="")
        if equipment_id_filter:
            last_qs = last_qs.filter(equipment_id=equipment_id_filter)
        for row in last_qs.values("equipment_id", "filter_no", "timestamp").order_by("equipment_id", "filter_no", "-timestamp"):
            equipment_id = (row.get("equipment_id") or "").strip()
            filter_no = (row.get("filter_no") or "").strip()
            if not equipment_id:
                continue
            key = bucket_key(equipment_id, filter_no)
            if key not in global_last_reading:
                global_last_reading[key] = row.get("timestamp")

        def build_day_payload(day_value):
            day_key = day_value.isoformat()
            equipments_payload = []
            total_expected_slots = 0
            total_present_slots = 0
            total_missing_slots = 0

            for key in sorted(bucket_keys):
                meta = bucket_meta.get(key) or {}
                equipment_id = meta.get("equipment_id", "")
                filter_no = (meta.get("filter_no") or "").strip()
                if not equipment_id:
                    continue
                suppress_from = open_maintenance_suppress_from.get(key)
                if suppress_from is not None and day_value > suppress_from:
                    continue
                interval, shift_hours = get_interval_for_equipment(equipment_id, "filter")
                op_ts = timestamps_by_day_bucket.get(day_key, {}).get(key, []) or []
                down_ts = downtime_timestamps_by_day.get(day_key, {}).get(key, []) or []
                merged_ts = op_ts + down_ts
                stats = compute_missing_slots_for_day(
                    day_value=day_value,
                    timestamps=merged_ts,
                    interval=interval,
                    shift_duration_hours=shift_hours,
                    equipment_identifier=equipment_id,
                    log_type="filter",
                )
                expected_count = stats["expected_slot_count"]
                present_count = stats["present_slot_count"]
                open_down_ts = open_downtime_timestamps_by_day.get(day_key, {}).get(key, []) or []
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
                has_activity_today = key in timestamps_by_day_bucket.get(day_key, {})
                if missing_count == 0 and not has_activity_today:
                    continue
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
                next_due_display = None
                if missing_for_display:
                    next_due_display = timezone.localtime(
                        missing_for_display[0]["slot_start"], slot_tz
                    ).isoformat()
                _, day_end = get_slot_day_bounds(day_value)
                global_last = global_last_reading.get(key)
                last_reading_ts = daily_last_reading.get((day_key, key))
                if last_reading_ts is None and global_last is not None and global_last < day_end:
                    last_reading_ts = global_last
                equipment_display = display_name_for_row(equipment_id)
                if filter_no:
                    equipment_display = f"{equipment_display} | {filter_no}"
                equipments_payload.append(
                    {
                        "equipment_id": key,
                        "equipment_name": equipment_display,
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
                "log_type": "filter",
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
                log_type="filter",
                date_from=days[0],
                date_to=days[0],
                payload=payload,
                filters={"equipment_id": equipment_id_filter or ""},
            )
            return Response(payload)

        payload = {
            "log_type": "filter",
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
            log_type="filter",
            date_from=days[0],
            date_to=days[-1],
            payload=payload,
            filters={"equipment_id": equipment_id_filter or ""},
        )
        return Response(payload)

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """
        Create a new filter log entry as a correction of a rejected or pending-secondary-approval log.
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
            'status': 'pending_secondary_approval',
        }
        if timestamp is not None:
            payload['timestamp'] = timestamp

        check_ts = payload.get('timestamp') or timezone.now()
        correction_area = validated.get('area_category')
        if correction_area is None:
            correction_area = original.area_category
        correction_filter_no = validated.get('filter_no')
        if correction_filter_no is None:
            correction_filter_no = original.filter_no
        interval, shift_hours = get_interval_for_equipment(original.equipment_id or '', 'filter')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        slot_qs = filterlog_same_slot_bucket_qs(
            FilterLog.objects.all(),
            original.equipment_id,
            correction_area,
            correction_filter_no,
        ).filter(timestamp__gte=slot_start, timestamp__lt=slot_end)
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
            raise ValidationError({"detail": [FILTER_LOG_DUPLICATE_SLOT_DETAIL]})

        new_log = FilterLog.objects.create(**payload)
        log_audit_event(
            user=request.user,
            event_type="log_corrected",
            object_type="filter_log",
            object_id=str(new_log.id),
            field_name="corrects_id",
            old_value=str(original.id),
            new_value=str(new_log.id),
        )

        tracked_fields = [
            'equipment_id',
            'category',
            'filter_no',
            'filter_micron',
            'filter_size',
            'installed_date',
            'integrity_done_date',
            'integrity_due_date',
            'cleaning_done_date',
            'cleaning_due_date',
            'replacement_due_date',
            'remarks',
            'status',
            'timestamp',
        ]
        extra_base = {
            "equipment_id": original.equipment_id,
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
                object_type="filter_log",
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
        """
        Approve or reject a filter log.
        - Operator (Log Book Done By) cannot approve own entries.
        - Only pending/draft/pending_secondary_approval can be approved/rejected.
        - Secondary approval must be by a different user than the rejector.
        """
        log = self.get_object()
        previous_status = log.status
        action_type = normalize_approval_action(request.data.get('action'))
        # Backwards compatible: frontend currently sends approval/rejection comment as `remarks`.
        comment = (request.data.get('comment') or request.data.get('remarks') or '').strip()
        require_rejection_comment(action_type, comment)
        forbid_manager_rejecting_reading(request, action_type)

        if action_type == 'approve':
            ensure_not_operator(log.operator_id, request.user.id, "approved")

        ensure_status_allowed(log.status, ('draft', 'pending', 'pending_secondary_approval'), action_type)

        now = timezone.now()

        if action_type == 'reject':
            # Rejector must be different from the operator (Log Book Done By)
            ensure_not_operator(log.operator_id, request.user.id, "rejected")
            previous_status = log.status
            log.status = 'rejected'
            log.approved_by = request.user
            log.approved_at = now
            log_audit_event(
                user=request.user,
                event_type="log_rejected",
                object_type="filter_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
                extra={"remarks": comment} if comment else {},
            )
        else:
            if log.status == 'pending_secondary_approval':
                ensure_secondary_approver_diff(log.approved_by_id, request.user.id)
                log.secondary_approved_by = request.user
                log.secondary_approved_at = now
                log.status = 'approved'
            else:
                log.approved_by = request.user
                log.approved_at = now
                log.status = 'approved'

        if comment:
            log.comment = comment
        log.save(update_fields=[
            'status',
            'approved_by',
            'approved_at',
            'secondary_approved_by',
            'secondary_approved_at',
            'comment',
            'updated_at',
        ])

        if action_type == "approve" and log.status == "approved":
            log_audit_event(
                user=request.user,
                event_type="log_approved",
                object_type="filter_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="approved",
                extra={"remarks": comment} if comment else {},
            )

        if action_type == 'approve' and log.status == 'approved':
            eq_title = _filter_report_equipment_title(log.equipment_id or "")
            fn = (log.filter_no or "").strip()
            title = f"Filter Monitoring - {eq_title}"
            if fn:
                title = f"{title} · {fn}"

            create_utility_report_for_log(
                log=log,
                source_table='filter_logs',
                title_prefix='Filter Monitoring',
                title_override=title,
                approved_by=request.user,
                remarks=comment or None,
            )

        serializer = self.get_serializer(log)
        return Response(serializer.data)

