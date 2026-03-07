from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from accounts.models import SessionSetting
from core.log_slot_utils import get_slot_range
from .models import BoilerLog
from .serializers import BoilerLogSerializer
from accounts.permissions import CanLogEntries, CanApproveReports
from reports.utils import log_limit_change


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
        setting = SessionSetting.get_solo()
        interval = getattr(setting, 'log_entry_interval', None) or 'hourly'
        shift_hours = getattr(setting, 'shift_duration_hours', None) or 8
        slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
        if BoilerLog.objects.filter(
            equipment_id=equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )
        serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )

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
        setting = SessionSetting.get_solo()
        interval = getattr(setting, 'log_entry_interval', None) or 'hourly'
        shift_hours = getattr(setting, 'shift_duration_hours', None) or 8
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        if BoilerLog.objects.filter(
            equipment_id=original.equipment_id,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).exclude(pk=original.pk).exists():
            raise ValidationError(
                {'detail': ['An entry for this equipment already exists for this time slot.']}
            )

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
