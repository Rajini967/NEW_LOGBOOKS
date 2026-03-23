from typing import Optional

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
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    secondary_approved_by_name = serializers.SerializerMethodField()
    approved_by_id = serializers.UUIDField(source="approved_by.id", read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(source="secondary_approved_by.id", read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source="corrects.id", read_only=True)
    has_corrections = serializers.SerializerMethodField()

    @staticmethod
    def _user_display_name(user) -> Optional[str]:
        """Prefer full name; fall back to email when name is blank (matches list UI elsewhere)."""
        if user is None:
            return None
        name = (getattr(user, "name", None) or "").strip()
        if name:
            return name
        email = getattr(user, "email", None)
        return email.strip() if email else None

    def get_created_by_name(self, obj):
        return self._user_display_name(obj.created_by)

    def get_approved_by_name(self, obj):
        return self._user_display_name(obj.approved_by)

    def get_secondary_approved_by_name(self, obj):
        return self._user_display_name(obj.secondary_approved_by)

    def get_has_corrections(self, obj):
        return obj.corrections.exists()

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
            "tolerance_minutes",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "secondary_approved_by_id",
            "secondary_approved_by_name",
            "secondary_approved_at",
            "corrects_id",
            "has_corrections",
            "approval_comment",
            "rejection_comment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "secondary_approved_by_id",
            "secondary_approved_by_name",
            "secondary_approved_at",
            "corrects_id",
            "has_corrections",
            "approval_comment",
            "rejection_comment",
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

        tolerance_minutes = attrs.get("tolerance_minutes")
        if tolerance_minutes is not None and tolerance_minutes < 0:
            raise serializers.ValidationError(
                {"tolerance_minutes": "Tolerance must be zero or a positive number of minutes."}
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
        # When tolerance is set on create, also set tolerance_enabled_at
        tol = validated_data.get("tolerance_minutes")
        if tol is not None and tol > 0:
            from django.utils import timezone
            validated_data.setdefault("tolerance_enabled_at", timezone.now())
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # If tolerance_minutes changes from 0/None to >0, set tolerance_enabled_at (once)
        old_tol = getattr(instance, "tolerance_minutes", None) or 0
        new_tol = validated_data.get("tolerance_minutes", old_tol)
        if new_tol is not None and new_tol > 0 and old_tol <= 0 and "tolerance_enabled_at" not in validated_data:
            from django.utils import timezone
            validated_data["tolerance_enabled_at"] = timezone.now()
        return super().update(instance, validated_data)

