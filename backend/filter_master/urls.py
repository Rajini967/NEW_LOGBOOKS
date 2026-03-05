from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FilterCategoryViewSet,
    FilterMasterViewSet,
    FilterAssignmentViewSet,
    FilterScheduleViewSet,
)

router = DefaultRouter()
router.register(r"filter-categories", FilterCategoryViewSet, basename="filter-category")
router.register(r"filters", FilterMasterViewSet, basename="filter-master")
router.register(r"filter-assignments", FilterAssignmentViewSet, basename="filter-assignment")
router.register(r"filter-schedules", FilterScheduleViewSet, basename="filter-schedule")

urlpatterns = [
    path("", include(router.urls)),
]

