from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from reports.utils import log_audit_event
from .models import UtilityLog
from .serializers import UtilityLogSerializer
from accounts.permissions import CanLogEntries, CanApproveReports


class UtilityLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing utility logs."""
    permission_classes = [IsAuthenticated]
    serializer_class = UtilityLogSerializer
    queryset = UtilityLog.objects.all()
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
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
            object_type="utility_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
        )

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="utility_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a utility log."""
        log = self.get_object()
        action_type = request.data.get('action', 'approve')  # 'approve' or 'reject'
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
            log.remarks = remarks
        log.save()
        
        serializer = self.get_serializer(log)
        return Response(serializer.data)
