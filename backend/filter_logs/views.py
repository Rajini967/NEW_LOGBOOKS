from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import CanApproveReports, CanLogEntries
from core.log_slot_utils import get_interval_for_equipment, get_slot_range, compute_slot_status
from reports.utils import log_limit_change, log_audit_event, create_report_entry, delete_report_entry

from .models import FilterLog
from .serializers import FilterLogSerializer


class FilterLogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FilterLogSerializer
    queryset = FilterLog.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
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
        return qs.order_by('-timestamp')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        validated = serializer.validated_data
        equipment_id = validated.get('equipment_id')
        timestamp = validated.get('timestamp') or timezone.now()
        base_qs = FilterLog.objects.filter(equipment_id=equipment_id)
        last_log = base_qs.order_by('-timestamp').first()
        last_time = last_log.timestamp if last_log is not None else None

        slot_info = compute_slot_status(equipment_id or '', 'filter', timestamp, last_time=last_time)
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
        )
        delete_report_entry(source_id=str(instance.id), source_table='filter_logs')
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()

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

        return response

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
            'status': 'pending_secondary_approval',
        }
        if timestamp is not None:
            payload['timestamp'] = timestamp

        new_log = FilterLog.objects.create(**payload)

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
        action_type = request.data.get('action', 'approve')
        # Backwards compatible: frontend currently sends approval/rejection comment as `remarks`.
        comment = (request.data.get('comment') or request.data.get('remarks') or '').strip()

        if action_type == 'reject' and not comment:
            raise ValidationError({'remarks': ['Comment is required when rejecting.']})

        if action_type == 'approve':
            if log.operator_id and log.operator_id == request.user.id:
                raise ValidationError(
                    {'detail': ['Log Book Done By and Approved By users must be different.']}
                )

        if log.status not in ('draft', 'pending', 'pending_secondary_approval'):
            raise ValidationError(
                {'detail': ['Only draft, pending or pending secondary approval entries can be approved or rejected.']}
            )

        now = timezone.now()

        if action_type == 'reject':
            # Rejector must be different from the operator (Log Book Done By)
            if log.operator_id and log.operator_id == request.user.id:
                raise ValidationError(
                    {'detail': ['Log Book Done By and Rejected By users must be different.']}
                )
            log.status = 'rejected'
            log.approved_by = request.user
            log.approved_at = now
        else:
            if log.status == 'pending_secondary_approval':
                if log.approved_by and log.approved_by_id == request.user.id:
                    raise ValidationError(
                        {'detail': ['Secondary approver must be different from the primary approver.']}
                    )
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

        if action_type == 'approve' and log.status == 'approved':
            title = f"Filter Monitoring - {log.equipment_id or 'N/A'}"
            create_report_entry(
                report_type='utility',
                source_id=str(log.id),
                source_table='filter_logs',
                title=title,
                site=log.equipment_id or 'N/A',
                created_by=log.operator_name or 'Unknown',
                created_at=log.created_at,
                approved_by=request.user,
                remarks=comment or None,
            )

        serializer = self.get_serializer(log)
        return Response(serializer.data)

