from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ChemicalPreparation
from .serializers import ChemicalPreparationSerializer
from accounts.permissions import CanLogEntries, CanApproveReports
from reports.utils import log_limit_change


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

    def update(self, request, *args, **kwargs):
        """
        Record chemical preparation field changes in the audit trail on update.
        """
        instance = self.get_object()
        tracked_fields = [
            'equipment_name',
            'chemical_name',
            'chemical_category',
            'chemical_percent',
            'solution_concentration',
            'water_qty',
            'chemical_qty',
            'batch_no',
            'quantity_taken',
            'reason',
            'done_by',
            'remarks',
            'comment',
            'checked_by',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        updated = self.get_object()
        user = request.user
        from django.utils import timezone

        extra_base = {
            "equipment_name": updated.equipment_name,
            "chemical_name": updated.chemical_name,
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
                object_type="chemical_log",
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
        Record chemical preparation field changes in the audit trail on partial update.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)
    
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
