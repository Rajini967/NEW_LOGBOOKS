from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReportViewSet, AuditReportViewSet

router = DefaultRouter()
router.register(r"", ReportViewSet, basename="report")
router.register(r"audit", AuditReportViewSet, basename="audit-report")

# Explicit audit list endpoint to avoid any router misconfiguration issues.
# This guarantees that /api/reports/audit/ is always resolvable.
audit_list = AuditReportViewSet.as_view({"get": "list"})

urlpatterns = [
    path("audit/", audit_list, name="audit-report-list"),
    path("", include(router.urls)),
]

