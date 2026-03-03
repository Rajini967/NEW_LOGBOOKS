from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReportViewSet, AuditReportViewSet

router = DefaultRouter()
router.register(r"", ReportViewSet, basename="report")
router.register(r"audit", AuditReportViewSet, basename="audit-report")

urlpatterns = [
    path("", include(router.urls)),
]

