from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from reports.utils import log_audit_event, log_entity_update_changes
from .models import Instrument
from .serializers import InstrumentSerializer
from accounts.permissions import IsAdminOrSuperAdmin


class InstrumentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing instruments."""
    permission_classes = [IsAuthenticated]
    serializer_class = InstrumentSerializer
    queryset = Instrument.objects.filter(is_active=True)

    def get_permissions(self):
        """Only managers and super admins can create/update/delete."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="instrument",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "instrument")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="instrument",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()
