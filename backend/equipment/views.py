from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsManagerOrSuperAdmin

from .models import Department, EquipmentCategory, Equipment
from .serializers import (
    DepartmentSerializer,
    EquipmentCategorySerializer,
    EquipmentSerializer,
)


class DepartmentViewSet(viewsets.ModelViewSet):
    """CRUD for Department master."""

    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer
    queryset = Department.objects.all().order_by("name")

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]


class EquipmentCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for EquipmentCategory master."""

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentCategorySerializer
    queryset = EquipmentCategory.objects.all().order_by("name")

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]


class EquipmentViewSet(viewsets.ModelViewSet):
    """CRUD for Equipment master."""

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentSerializer
    queryset = Equipment.objects.filter(is_active=True).order_by("equipment_number")

    def get_queryset(self):
        qs = super().get_queryset()
        department_id = self.request.query_params.get("department")
        category_id = self.request.query_params.get("category")

        if department_id:
            qs = qs.filter(department_id=department_id)
        if category_id:
            qs = qs.filter(category_id=category_id)

        return qs

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]

