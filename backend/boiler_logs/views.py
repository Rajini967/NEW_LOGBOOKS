from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import BoilerLog
from .serializers import BoilerLogSerializer
from accounts.permissions import CanLogEntries, CanApproveReports


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
