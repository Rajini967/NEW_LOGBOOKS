from typing import Any
from datetime import timedelta

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
    micron_costs = serializers.JSONField(required=False)

    class Meta:
        model = FilterCategory
        fields = [
            "id",
            "name",
            "client_id",
            "description",
            "micron_costs",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_micron_costs(self, value):
        """
        Expect a mapping of micron_size -> numeric cost.
        Only known micron sizes are allowed.
        """
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("micron_costs must be an object/map.")

        allowed = {choice[0] for choice in MICRON_SIZE_CHOICES}
        cleaned = {}
        for k, v in value.items():
            if k not in allowed:
                raise serializers.ValidationError(f"Invalid micron size key: {k}.")
            if v in (None, ""):
                continue
            try:
                num = float(v)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Cost for {k} must be numeric.")
            if num < 0:
                raise serializers.ValidationError(f"Cost for {k} cannot be negative.")
            cleaned[k] = num
        return cleaned


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

        return super().create(validated_data)


class FilterAssignmentSerializer(serializers.ModelSerializer):
    equipment_number = serializers.CharField(source="equipment.equipment_number", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    filter_id = serializers.CharField(source="filter.filter_id", read_only=True)
    filter_make = serializers.CharField(source="filter.make", read_only=True)
    filter_model = serializers.CharField(source="filter.model", read_only=True)
    filter_micron_size = serializers.CharField(source="filter.micron_size", read_only=True)
    filter_size_l = serializers.DecimalField(
        source="filter.size_l", read_only=True, max_digits=10, decimal_places=2
    )
    filter_size_w = serializers.DecimalField(
        source="filter.size_w", read_only=True, max_digits=10, decimal_places=2
    )
    filter_size_h = serializers.DecimalField(
        source="filter.size_h", read_only=True, max_digits=10, decimal_places=2
    )

    class Meta:
        model = FilterAssignment
        fields = [
            "id",
            "filter",
            "filter_id",
            "filter_make",
            "filter_model",
            "filter_micron_size",
            "filter_size_l",
            "filter_size_w",
            "filter_size_h",
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

    def validate_filter(self, value: FilterMaster) -> FilterMaster:
        """
        Business rule: only approved filters can be assigned to equipment.
        """
        if getattr(value, "status", None) != "approved":
            raise serializers.ValidationError(
                "Only approved filters can be assigned to equipment."
            )
        return value

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
            "is_approved",
            "approved_by",
            "approved_at",
            "status",
            "assignment_info",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "assignment_info",
            "is_approved",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        """
        Create schedule in pending-approval state.
        Start (set next_due_date) only after approval.
        """
        validated_data["is_approved"] = False
        validated_data["approved_by"] = None
        validated_data["approved_at"] = None
        validated_data["next_due_date"] = None
        return super().create(validated_data)

    def update(self, instance: FilterSchedule, validated_data):
        """
        Keep next_due_date consistent when frequency_days changes and
        next_due_date is not explicitly provided.
        """
        freq = validated_data.get("frequency_days", instance.frequency_days)
        next_due = validated_data.get("next_due_date", instance.next_due_date)
        if instance.is_approved and next_due is None and freq:
            base = instance.approved_at.date() if instance.approved_at else instance.assignment.assigned_at.date()
            validated_data["next_due_date"] = base + timedelta(days=int(freq))
        return super().update(instance, validated_data)

    def get_assignment_info(self, obj: FilterSchedule) -> dict[str, Any]:
        assignment = obj.assignment
        equipment = assignment.equipment
        return {
            "equipment_id": str(equipment.id),
            "equipment_number": equipment.equipment_number,
            "equipment_name": equipment.name,
            "tag_info": assignment.tag_info,
        }

