from django.utils import timezone
from datetime import datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from core.log_slot_utils import get_interval_for_equipment, get_slot_range
from reports.utils import log_audit_event, log_limit_change
from reports.services import create_utility_report_for_log
from .models import CompressorLog
from .serializers import CompressorLogSerializer
from accounts.permissions import CanLogEntries, CanApproveReports

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."


class CompressorLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing compressor logs."""
    permission_classes = [IsAuthenticated]
    serializer_class = CompressorLogSerializer
    queryset = CompressorLog.objects.all()

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
        return qs.order_by('-timestamp')

    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update', 'correct']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set operator when creating a log."""
        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="compressor_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
        )

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="compressor_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
        )
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if (
            instance.status in ("rejected", "pending_secondary_approval")
            and instance.operator_id
            and instance.operator_id != request.user.id
        ):
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """
        Create a new compressor log entry as a correction of a rejected or pending-secondary-approval log.
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

        check_ts = payload.get('timestamp') or timezone.now()
        interval, shift_hours = get_interval_for_equipment(original.equipment_id or '', 'compressor')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        slot_qs = CompressorLog.objects.filter(
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

        new_log = CompressorLog.objects.create(**payload)
        log_audit_event(
            user=request.user,
            event_type="log_corrected",
            object_type="compressor_log",
            object_id=str(new_log.id),
            field_name="corrects_id",
            old_value=str(original.id),
            new_value=str(new_log.id),
        )

        tracked_fields = [
            'compressor_supply_temp',
            'compressor_return_temp',
            'compressor_pressure',
            'compressor_flow',
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
                object_type="compressor_log",
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
        """Approve or reject a compressor log. Handles primary approval, secondary approval (after correction), and reject."""
        log = self.get_object()
        action_type = request.data.get('action', 'approve')
        remarks = (request.data.get('remarks') or '').strip()

        if action_type == 'reject' and not remarks:
            raise ValidationError({'remarks': ['Comment is required when rejecting.']})

        if action_type == 'approve':
            if log.operator_id and log.operator_id == request.user.id:
                return Response(
                    {'error': 'The log book entry must be approved by a different user than the operator (Log Book Done By).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if log.status == 'pending_secondary_approval':
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
            previous_status = log.status
            log.status = 'rejected'
            log.secondary_approved_by = None
            log.secondary_approved_at = None
            log_audit_event(
                user=request.user,
                event_type="log_rejected",
                object_type="compressor_log",
                object_id=str(log.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
            )
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
            create_utility_report_for_log(
                log=log,
                source_table='compressor_logs',
                title_prefix='Air Compressor Monitoring',
                approved_by=request.user,
                remarks=remarks,
            )

        serializer = self.get_serializer(log)
        return Response(serializer.data)
