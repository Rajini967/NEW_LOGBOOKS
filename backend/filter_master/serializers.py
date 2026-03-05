from typing import Any

from django.db import transaction
from django.db.models import IntegerField, Max
from django.db.models.functions import Cast, Substr
from rest_framework import serializers

from .models import (
    FilterCategory,
    FilterMaster,
    FilterAssignment,
    FilterSchedule,
    MICRON_SIZE_CHOICES,
)


class FilterCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FilterCategory
        fields = [
            "id",
            "name",
            "client_id",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FilterMasterSerializer(serializers.ModelSerializer):
    filter_id = serializers.CharField(read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = FilterMaster
        fields = [
            "id",
            "filter_id",
            "category",
            "category_name",
            "make",
            "model",
            "serial_number",
            "size_l",
            "size_w",
            "size_h",
            "micron_size",
            "certificate_file",
            "status",
            "created_by",
            "approved_by",
            "approved_at",
            "client_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "filter_id",
            "status",
            "created_by",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
        ]

    def validate_micron_size(self, value: str) -> str:
        allowed_values = {choice[0] for choice in MICRON_SIZE_CHOICES}
        if value not in allowed_values:
            raise serializers.ValidationError(
                f"Invalid micron size. Allowed values are: {', '.join(sorted(allowed_values))}."
            )
        return value

    def _generate_filter_id(self) -> str:
        """
        Generate a new sequential filter ID in the format FMT-0001.

        Uses a DB-safe aggregation to find the current max numeric suffix.
        """
        prefix = "FMT-"
        with transaction.atomic():
            # Extract numeric suffix where possible and get max
            max_suffix: dict[str, Any] | None = (
                FilterMaster.objects.filter(filter_id__startswith=prefix)
                .annotate(
                    num_part=Cast(
                        Substr("filter_id", 5),
                        IntegerField(),
                    )
                )
                .aggregate(max_num=Max("num_part"))
            )
            current_max = max_suffix.get("max_num") or 0
            next_num = current_max + 1
            return f"{prefix}{next_num:04d}"

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        # Status defaults to pending on create
        validated_data["status"] = "pending"

        # Attach creator
        if user and user.is_authenticated:
            validated_data["created_by"] = user

        # Generate unique filter_id
        # Simple loop to avoid race condition if two are created at once.
        for _ in range(5):
            candidate = self._generate_filter_id()
            if not FilterMaster.objects.filter(filter_id=candidate).exists():
                validated_data["filter_id"] = candidate
                break
        else:
            raise serializers.ValidationError(
                {"detail": "Unable to generate a unique filter ID. Please try again."}
            )

        return super().create(validated_data)


class FilterAssignmentSerializer(serializers.ModelSerializer):
    equipment_number = serializers.CharField(source="equipment.equipment_number", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)

    class Meta:
        model = FilterAssignment
        fields = [
            "id",
            "filter",
            "equipment",
            "equipment_number",
            "equipment_name",
            "area_category",
            "tag_info",
            "assigned_at",
            "assigned_by",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "assigned_at",
            "assigned_by",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            validated_data["assigned_by"] = user
        return super().create(validated_data)


class FilterScheduleSerializer(serializers.ModelSerializer):
    assignment_info = serializers.SerializerMethodField()

    class Meta:
        model = FilterSchedule
        fields = [
            "id",
            "assignment",
            "schedule_type",
            "frequency_days",
            "next_due_date",
            "last_done_date",
            "status",
            "assignment_info",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "assignment_info",
            "created_at",
            "updated_at",
        ]

    def get_assignment_info(self, obj: FilterSchedule) -> dict[str, Any]:
        assignment = obj.assignment
        equipment = assignment.equipment
        return {
            "equipment_id": str(equipment.id),
            "equipment_number": equipment.equipment_number,
            "equipment_name": equipment.name,
            "tag_info": assignment.tag_info,
        }

