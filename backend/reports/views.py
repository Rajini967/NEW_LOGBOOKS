from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Report, AuditEvent
from .serializers import ReportSerializer, AuditEventSerializer


class ReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing approved reports.
    Read-only because reports are created automatically when entries are approved.
    """
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Only approved reports are stored in Report table; ensure we never show others
        queryset = Report.objects.all()
        
        # Filter by report type if provided
        report_type = self.request.query_params.get('type', None)
        if report_type:
            queryset = queryset.filter(report_type=report_type)
        
        # All roles see only approved reports (Report rows are created on approval only)
        # Customers additionally restricted to certain report types
        if self.request.user.role == 'customer':
            queryset = queryset.filter(
                report_type__in=[
                    'utility',
                    'validation',
                    'filter_register',
                    'air_velocity',
                    'filter_integrity',
                    'recovery',
                    'differential_pressure',
                    'nvpc',
                ]
            )

        # Non-super-admin users should not see super-admin details.
        if self.request.user.role != "super_admin":
            User = get_user_model()
            super_admin_emails = list(
                User.all_objects.filter(role="super_admin", is_deleted=False).values_list("email", flat=True)
            )
            queryset = queryset.exclude(approved_by__role="super_admin")
            if super_admin_emails:
                queryset = queryset.exclude(created_by__in=super_admin_emails)
        
        return queryset.order_by('-approved_at')


class AuditReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for audit trail events (e.g. limit changes).
    """

    serializer_class = AuditEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering = ["-timestamp"]

    def get_queryset(self):
        user = self.request.user

        # Only privileged roles can see audit trail
        if user.role not in ["super_admin", "manager", "supervisor"]:
            return AuditEvent.objects.none()

        qs = AuditEvent.objects.select_related("user").all()

        # Non-super-admin users should not see super-admin details.
        if user.role != "super_admin":
            User = get_user_model()
            super_admin_user_ids = [
                str(uid)
                for uid in User.all_objects.filter(role="super_admin", is_deleted=False).values_list("id", flat=True)
            ]
            qs = qs.exclude(user__role="super_admin")
            if super_admin_user_ids:
                qs = qs.exclude(Q(object_type="user") & Q(object_id__in=super_admin_user_ids))

        # Filters
        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")
        user_id = self.request.query_params.get("user")
        object_type = self.request.query_params.get("object_type")
        object_id = self.request.query_params.get("object_id")
        event_type = self.request.query_params.get("event_type")

        if from_date:
            qs = qs.filter(timestamp__date__gte=from_date)
        if to_date:
            qs = qs.filter(timestamp__date__lte=to_date)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if object_type:
            qs = qs.filter(object_type=object_type)
        if object_id:
            qs = qs.filter(object_id=object_id)
        if event_type:
            qs = qs.filter(event_type=event_type)

        return qs.order_by("-timestamp")
