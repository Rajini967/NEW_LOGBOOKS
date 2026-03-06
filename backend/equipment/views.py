from django.db.models.deletion import ProtectedError
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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

    def destroy(self, request, *args, **kwargs):
        """
        Prevent deleting categories that are in use by Equipment (PROTECT FK).
        Return a clear 400 error instead of a 500 traceback.
        """
        instance: EquipmentCategory = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This equipment category cannot be deleted because it is already used by one or more equipment records. "
                        "Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


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

