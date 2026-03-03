from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
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
    
    def perform_create(self, serializer):
        """Set operator when creating a log."""
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

        return response

    def partial_update(self, request, *args, **kwargs):
        """
        Record boiler reading changes in the audit trail on partial update.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a boiler log."""
        log = self.get_object()
        action_type = request.data.get('action', 'approve')
        remarks = request.data.get('remarks', '')
        
        if action_type == 'approve':
            log.status = 'approved'
        elif action_type == 'reject':
            log.status = 'rejected'
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        log.approved_by = request.user
        from django.utils import timezone
        log.approved_at = timezone.now()
        if remarks:
            log.comment = remarks
        log.save()
        
        # Create report entry when approved
        if action_type == 'approve':
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
