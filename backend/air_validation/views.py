from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from reports.utils import log_audit_event
from .models import HVACValidation
from .serializers import HVACValidationSerializer
from accounts.permissions import CanLogEntries, CanApproveReports


class HVACValidationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing HVAC validations."""
    permission_classes = [IsAuthenticated]
    serializer_class = HVACValidationSerializer
    queryset = HVACValidation.objects.all()
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set operator when creating a validation."""
        instance = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="hvac_validation",
            object_id=str(instance.id),
            field_name="created",
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject an HVAC validation."""
        validation = self.get_object()
        action_type = request.data.get('action', 'approve')  # 'approve' or 'reject'
        remarks = request.data.get('remarks', '')
        
        if action_type == 'approve':
            validation.status = 'approved'
        elif action_type == 'reject':
            validation.status = 'rejected'
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        validation.approved_by = request.user
        from django.utils import timezone
        validation.approved_at = timezone.now()
        if remarks:
            validation.remarks = remarks
        validation.save()
        
        # Create report entry when approved
        if action_type == 'approve':
            from reports.utils import create_report_entry
            title = f"HVAC Validation - {validation.room_name or 'N/A'}"
            create_report_entry(
                report_type='validation',
                source_id=str(validation.id),
                source_table='hvac_validations',
                title=title,
                site=validation.room_name or 'N/A',
                created_by=validation.operator_name or 'Unknown',
                created_at=validation.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(validation)
        return Response(serializer.data)
