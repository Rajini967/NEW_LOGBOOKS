import re
from rest_framework import serializers
from .models import BriquetteLog


class BriquetteLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source="operator.id", read_only=True)
    approved_by_id = serializers.UUIDField(source="approved_by.id", read_only=True, allow_null=True)
    approved_by_name = serializers.SerializerMethodField()
    secondary_approved_by_id = serializers.UUIDField(
        source="secondary_approved_by.id", read_only=True, allow_null=True
    )
    corrects_id = serializers.UUIDField(source="corrects.id", read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()
    tolerance_status = serializers.SerializerMethodField()

    class Meta:
        model = BriquetteLog
        fields = [
            "id",
            "equipment_id",
            "site_id",
            "activity_type",
            "activity_from_date",
            "activity_to_date",
            "activity_from_time",
            "activity_to_time",
            "time_slot",
            "steam_pressure",
            "furnace_pressure_mmwc",
            "id_fan_op_percent",
            "pa_damper_position_1",
            "pa_damper_position_2",
            "metering_screw_percent",
            "steam_reading_ton",
            "steam_flow_kg_hr",
            "stack_temp",
            "furnace_temp",
            "hot_air_temp",
            "feed_pump_1_2",
            "operator_sign_date",
            "feed_water_ph",
            "feed_water_hardness_ppm",
            "feed_water_tds_ppm",
            "boiler_water_ph",
            "boiler_water_hardness_ppm",
            "boiler_water_tds_ppm",
            "total_steam_in_1_day",
            "total_steam_flow_ratio",
            "remarks",
            "comment",
            "operator_id",
            "operator_name",
            "status",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "secondary_approved_by_id",
            "secondary_approved_at",
            "corrects_id",
            "has_corrections",
            "tolerance_status",
            "timestamp",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "operator_id",
            "operator_name",
            "approved_by_id",
            "approved_by_name",
            "approved_at",
            "secondary_approved_by_id",
            "secondary_approved_at",
            "corrects_id",
            "has_corrections",
            "tolerance_status",
            "created_at",
            "updated_at",
        ]

    def get_has_corrections(self, obj):
        return obj.corrections.exists()

    def get_approved_by_name(self, obj):
        user = obj.approved_by
        if user is None:
            return None
        return (getattr(user, "name", None) or "").strip() or getattr(user, "email", None)

    def get_tolerance_status(self, obj):
        try:
            from core.log_slot_utils import get_tolerance_status

            return get_tolerance_status(obj.timestamp, obj.equipment_id or "", "briquette")
        except Exception:
            return "none"

    def update(self, instance, validated_data):
        timestamp = validated_data.pop("timestamp", None)
        if timestamp is not None and instance.status not in ("rejected", "pending_secondary_approval"):
            validated_data["timestamp"] = instance.timestamp
        elif timestamp is not None:
            validated_data["timestamp"] = timestamp
        return super().update(instance, validated_data)

    def validate(self, attrs):
        remarks = (attrs.get("remarks") if "remarks" in attrs else getattr(self.instance, "remarks", None)) or ""
        if not str(remarks).strip():
            raise serializers.ValidationError({"remarks": ["Remarks are required."]})

        activity_type = attrs.get("activity_type") if "activity_type" in attrs else getattr(
            self.instance, "activity_type", "operation"
        )
        if (activity_type or "operation") == "operation":
            required = ["steam_pressure", "furnace_pressure_mmwc", "steam_flow_kg_hr"]
            missing = [f for f in required if attrs.get(f, getattr(self.instance, f, None)) in (None, "")]
            if missing:
                raise serializers.ValidationError(
                    {f: ["This field is required when activity_type is operation."] for f in missing}
                )

            time_slot = attrs.get("time_slot", getattr(self.instance, "time_slot", "")) or ""
            if time_slot and not re.match(r"^\d{2}:\d{2}:\d{2}$", str(time_slot).strip()):
                raise serializers.ValidationError(
                    {"time_slot": ["Use HH:MM:SS format for Time Slot."]}
                )
        return super().validate(attrs)
