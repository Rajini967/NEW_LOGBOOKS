from collections import defaultdict
from datetime import datetime
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.equipment_scope import assert_user_can_access_equipment, filter_queryset_by_equipment_scope
from accounts.permissions import CanApproveReports, CanLogEntries, IsSuperAdmin, forbid_manager_rejecting_reading
from core.log_slot_utils import (
    compute_missing_slots_for_day,
    get_interval_for_equipment,
    get_slot_day_bounds,
    get_slot_range,
    get_slot_timezone,
    filter_missing_slots_before_earliest_downtime,
)
from reports.utils import log_audit_event
from reports.services import create_utility_report_for_log
from .models import BriquetteLog
from .serializers import BriquetteLogSerializer

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."


def _signature_text(user):
    actor = (getattr(user, "name", None) or getattr(user, "email", None) or "Unknown").strip()
    now_str = timezone.localtime(timezone.now()).strftime("%d/%m/%Y %H:%M:%S")
    return f"{actor} - {now_str}"


class BriquetteLogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BriquetteLogSerializer
    queryset = BriquetteLog.objects.all()

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update"]:
            return [IsAuthenticated(), CanLogEntries()]
        if self.action == "approve":
            return [IsAuthenticated(), CanApproveReports()]
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = filter_queryset_by_equipment_scope(qs, self.request.user)
        if self.action != "list":
            return qs
        equipment_id = self.request.query_params.get("equipment_id")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs.order_by("timestamp")

    def perform_create(self, serializer):
        validated = serializer.validated_data
        assert_user_can_access_equipment(self.request.user, validated.get("equipment_id"))
        equipment_id = validated.get("equipment_id")
        timestamp = validated.get("timestamp") or timezone.now()
        interval, shift_hours = get_interval_for_equipment(equipment_id or "", "boiler")
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if BriquetteLog.objects.filter(
            equipment_id=equipment_id, timestamp__gte=slot_start, timestamp__lt=slot_end
        ).exists():
            raise ValidationError({"detail": ["An entry for this equipment already exists for this time slot."]})
        signature = _signature_text(self.request.user)
        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
            operator_sign_date=validated.get("operator_sign_date") or signature,
            verified_sign_date=validated.get("verified_sign_date") or signature,
        )
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="briquette_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
        )

    def perform_update(self, serializer):
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
            BriquetteLog.objects.filter(
                equipment_id=next_equipment_id, timestamp__gte=slot_start, timestamp__lt=slot_end
            )
            .exclude(pk=instance.pk)
            .exists()
        )
        if duplicate_exists:
            raise ValidationError({"detail": ["An entry for this equipment already exists for this time slot."]})
        serializer.save()

    @action(detail=False, methods=["get"], url_path="missing-slots")
    def missing_slots(self, request):
        date_str = (request.query_params.get("date") or "").strip()
        equipment_id_filter = (request.query_params.get("equipment_id") or "").strip()
        if date_str:
            try:
                day = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": "date must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            day = timezone.localdate()

        day_start, day_end = get_slot_day_bounds(day)
        slot_tz = get_slot_timezone()
        base_qs = BriquetteLog.objects.filter(timestamp__gte=day_start, timestamp__lt=day_end)
        if equipment_id_filter:
            base_qs = base_qs.filter(equipment_id=equipment_id_filter)

        open_maintenance_suppress_from = {}
        open_ms_qs = BriquetteLog.objects.filter(
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

        downtime_by_equipment = defaultdict(list)
        for row in base_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
        ).exclude(status="rejected").values("equipment_id", "timestamp"):
            eid = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if eid and ts is not None:
                downtime_by_equipment[eid].append(ts)

        open_downtime_by_equipment = defaultdict(list)
        for row in base_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        ).values("equipment_id", "timestamp"):
            eid = (row.get("equipment_id") or "").strip()
            ts = row.get("timestamp")
            if eid and ts is not None:
                open_downtime_by_equipment[eid].append(ts)

        timestamps_by_equipment = defaultdict(list)
        timestamps_qs = base_qs.exclude(activity_type__in=["maintenance", "shutdown"])
        for row in timestamps_qs.values("equipment_id", "timestamp"):
            equipment_id = row.get("equipment_id") or ""
            if equipment_id:
                timestamps_by_equipment[equipment_id].append(row.get("timestamp"))

        equipment_ids = set(timestamps_by_equipment.keys())
        equipment_ids.update(
            set(
                BriquetteLog.objects.exclude(equipment_id__isnull=True)
                .exclude(equipment_id="")
                .values_list("equipment_id", flat=True)
                .distinct()
            )
        )
        if equipment_id_filter:
            equipment_ids.add(equipment_id_filter)

        equipments_payload = []
        total_expected_slots = 0
        total_present_slots = 0
        total_missing_slots = 0
        for equipment_id in sorted(equipment_ids):
            eid = (equipment_id or "").strip()
            suppress_from = open_maintenance_suppress_from.get(eid)
            if suppress_from is not None and day > suppress_from:
                continue
            interval, shift_hours = get_interval_for_equipment(equipment_id, "boiler")
            op_ts = timestamps_by_equipment.get(equipment_id, []) or []
            down_ts = downtime_by_equipment.get(eid, []) or []
            merged_ts = op_ts + down_ts
            stats = compute_missing_slots_for_day(
                day_value=day,
                timestamps=merged_ts,
                interval=interval,
                shift_duration_hours=shift_hours,
                equipment_identifier=equipment_id,
                log_type="boiler",
            )
            expected_count = stats["expected_slot_count"]
            present_count = stats["present_slot_count"]
            open_down_ts = open_downtime_by_equipment.get(eid, []) or []
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
            next_due_display = None
            if missing_for_display:
                next_due_display = timezone.localtime(
                    missing_for_display[0]["slot_start"], slot_tz
                ).isoformat()
            equipments_payload.append(
                {
                    "equipment_id": equipment_id,
                    "equipment_name": equipment_id,
                    "interval": interval,
                    "shift_duration_hours": shift_hours,
                    "expected_slot_count": expected_count,
                    "present_slot_count": present_count,
                    "missing_slot_count": missing_count,
                    "next_due": next_due_display,
                    "last_reading_timestamp": None,
                    "missing_slots": missing_ranges,
                }
            )
        return Response(
            {
                "date": day.isoformat(),
                "log_type": "briquette",
                "total_expected_slots": total_expected_slots,
                "total_present_slots": total_present_slots,
                "total_missing_slots": total_missing_slots,
                "equipment_count": len(equipments_payload),
                "affected_equipment_count": len([e for e in equipments_payload if e["missing_slot_count"] > 0]),
                "equipments": equipments_payload,
            }
        )

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        original = self.get_object()
        if original.status not in ("rejected", "pending_secondary_approval"):
            return Response(
                {"error": "Only rejected or pending secondary approval entries can be corrected as new entries."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if original.operator_id and original.operator_id != request.user.id:
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        serializer = self.get_serializer(data=request.data.copy())
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        timestamp = validated.pop("timestamp", None)
        payload = {
            **validated,
            "corrects": original,
            "operator": original.operator,
            "operator_name": original.operator_name or (original.operator.email if original.operator else request.user.email),
            "equipment_id": original.equipment_id,
            "site_id": original.site_id,
            "status": "pending_secondary_approval",
            "operator_sign_date": validated.get("operator_sign_date") or original.operator_sign_date or _signature_text(request.user),
            "verified_sign_date": validated.get("verified_sign_date") or original.verified_sign_date or _signature_text(request.user),
        }
        if timestamp is not None:
            payload["timestamp"] = timestamp
        new_log = BriquetteLog.objects.create(**payload)
        return Response(self.get_serializer(new_log).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        log = self.get_object()
        previous_status = log.status
        action_type = request.data.get("action", "approve")
        remarks = (request.data.get("remarks") or "").strip()
        forbid_manager_rejecting_reading(request, action_type)
        if action_type == "reject" and not remarks:
            raise ValidationError({"remarks": ["Comment is required when rejecting."]})

        if action_type == "approve":
            if log.operator_id and log.operator_id == request.user.id:
                return Response(
                    {"error": "The log book entry must be approved by a different user than the operator (Log Book Done By)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if log.status == "pending_secondary_approval":
                if log.approved_by_id and log.approved_by_id == request.user.id:
                    return Response(
                        {"error": "A different person must perform secondary approval. The person who rejected cannot approve the corrected entry."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                log.status = "approved"
                log.secondary_approved_by = request.user
                log.secondary_approved_at = timezone.now()
            elif log.status in ("pending", "draft"):
                log.status = "approved"
            else:
                return Response(
                    {"error": "Only pending, draft, or pending secondary approval entries can be approved."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif action_type == "reject":
            if log.operator_id and log.operator_id == request.user.id:
                return Response(
                    {"error": "The log book entry must be rejected by a different user than the operator (Log Book Done By)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if log.status not in ("pending", "draft", "pending_secondary_approval"):
                return Response(
                    {"error": "Only pending, draft, or pending secondary approval entries can be rejected."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            log_audit_event(
                user=request.user,
                event_type="log_rejected",
                object_type="briquette_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
                extra={"remarks": remarks} if remarks else {},
            )
            log.status = "rejected"
            log.secondary_approved_by = None
            log.secondary_approved_at = None
        else:
            return Response({"error": "Invalid action. Use approve or reject."}, status=status.HTTP_400_BAD_REQUEST)

        log.approved_by = request.user
        log.approved_at = timezone.now()
        log.verified_sign_date = _signature_text(request.user)
        if remarks:
            log.remarks = remarks
        log.save()

        if action_type == "approve" and log.status == "approved":
            log_audit_event(
                user=request.user,
                event_type="log_approved",
                object_type="briquette_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="approved",
                extra={"remarks": remarks} if remarks else {},
            )
            from reports.models import Report
            title = f"Briquette Boiler Monitoring - {log.equipment_id or 'N/A'}"
            # Idempotent: avoid duplicates if approve called twice.
            exists = Report.objects.filter(source_id=log.id, source_table="briquette_logs").exists()
            if not exists:
                create_utility_report_for_log(
                    log=log,
                    source_table="briquette_logs",
                    title_prefix="Briquette Boiler Monitoring",
                    approved_by=request.user,
                    remarks=remarks,
                    title_override=title,
                )
        return Response(self.get_serializer(log).data)

    @action(detail=False, methods=["post"], url_path="backfill-reports", permission_classes=[IsAuthenticated, CanApproveReports])
    def backfill_reports(self, request):
        """
        Create missing rows in centralized reports table for already-approved briquette logs.
        Safe to run multiple times.
        """
        from reports.models import Report

        created = 0
        skipped = 0
        qs = BriquetteLog.objects.filter(status="approved")
        for log in qs.iterator():
            if Report.objects.filter(source_id=log.id, source_table="briquette_logs").exists():
                skipped += 1
                continue
            title = f"Briquette Boiler Monitoring - {log.equipment_id or 'N/A'}"
            r = create_utility_report_for_log(
                log=log,
                source_table="briquette_logs",
                title_prefix="Briquette Boiler Monitoring",
                title_override=title,
                approved_by=log.approved_by,
                remarks=log.remarks,
            )
            if r is not None:
                created += 1
        return Response({"created": created, "skipped": skipped})
