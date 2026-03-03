from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ChemicalPreparation
from .serializers import ChemicalPreparationSerializer
from accounts.permissions import CanLogEntries, CanApproveReports


class ChemicalPreparationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing chemical preparations."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChemicalPreparationSerializer
    queryset = ChemicalPreparation.objects.all()
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set operator when creating a preparation."""
        serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a chemical preparation."""
        prep = self.get_object()
        action_type = request.data.get('action', 'approve')  # 'approve' or 'reject'
        remarks = request.data.get('remarks', '')
        
        if action_type == 'approve':
            prep.status = 'approved'
        elif action_type == 'reject':
            prep.status = 'rejected'
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        prep.approved_by = request.user
        from django.utils import timezone
        prep.approved_at = timezone.now()
        if remarks:
            prep.comment = remarks
        prep.save()
        
        # Create report entry when approved
        if action_type == 'approve':
            from reports.utils import create_report_entry
            title = f"{prep.chemical_name or 'Chemical Preparation'} - {prep.equipment_name or 'N/A'}"
            create_report_entry(
                report_type='utility',
                source_id=str(prep.id),
                source_table='chemical_preparations',
                title=title,
                site=prep.equipment_name or 'N/A',
                created_by=prep.checked_by or prep.operator_name or 'Unknown',
                created_at=prep.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(prep)
        return Response(serializer.data)
