from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DepartmentViewSet, EquipmentCategoryViewSet, EquipmentViewSet

router = DefaultRouter()
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"equipment-categories", EquipmentCategoryViewSet, basename="equipment-category")
router.register(r"equipment", EquipmentViewSet, basename="equipment")

urlpatterns = [
    path("", include(router.urls)),
]

