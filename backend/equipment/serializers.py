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
    created_by_name = serializers.CharField(source="created_by.name", read_only=True, allow_null=True)
    approved_by_name = serializers.CharField(source="approved_by.name", read_only=True, allow_null=True)

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
            "status",
            "log_entry_interval",
            "shift_duration_hours",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "created_at",
            "updated_at",
        ]

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

        log_entry_interval = attrs.get("log_entry_interval")
        if log_entry_interval is None and self.instance:
            log_entry_interval = getattr(self.instance, "log_entry_interval", None)
        shift_duration_hours = attrs.get("shift_duration_hours")
        if shift_duration_hours is None and self.instance:
            shift_duration_hours = getattr(self.instance, "shift_duration_hours", None)

        if log_entry_interval == "shift":
            hours = shift_duration_hours
            if hours is None:
                hours = getattr(self.instance, "shift_duration_hours", 8) if self.instance else 8
            if hours is not None and (hours < 1 or hours > 24):
                raise serializers.ValidationError(
                    {"shift_duration_hours": "Shift duration must be between 1 and 24 hours when interval is 'shift'."}
                )

        return super().validate(attrs)

    def create(self, validated_data):
        """
        Set created_by from request user when creating new equipment.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            validated_data.setdefault("created_by", user)
        return super().create(validated_data)

