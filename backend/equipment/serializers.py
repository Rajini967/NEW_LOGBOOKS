from rest_framework import serializers

from .models import Department, EquipmentCategory, Equipment


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = [
            "id",
            "name",
            "client_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EquipmentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentCategory
        fields = [
            "id",
            "name",
            "client_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EquipmentSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Equipment
        fields = [
            "id",
            "equipment_number",
            "name",
            "capacity",
            "department",
            "department_name",
            "category",
            "category_name",
            "site_id",
            "client_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_equipment_number(self, value: str) -> str:
        qs = Equipment.objects.filter(equipment_number=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Equipment number must be unique.")
        return value

    def validate(self, attrs):
        department = attrs.get("department") or getattr(self.instance, "department", None)
        category = attrs.get("category") or getattr(self.instance, "category", None)

        if department is None:
            raise serializers.ValidationError({"department": "Department is required."})
        if category is None:
            raise serializers.ValidationError({"category": "Equipment category is required."})

        return super().validate(attrs)

