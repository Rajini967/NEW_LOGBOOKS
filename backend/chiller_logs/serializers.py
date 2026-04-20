from rest_framework import serializers
from django.utils import timezone
from .models import ChillerLog, ChillerEquipmentLimit
from reports.utils import log_limit_change


class ChillerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    approved_by_name = serializers.SerializerMethodField()
    secondary_approved_by_id = serializers.UUIDField(source='secondary_approved_by.id', read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()
    tolerance_status = serializers.SerializerMethodField()

    class Meta:
        model = ChillerLog
        fields = [
            'id', 'equipment_id', 'site_id',
            'activity_type', 'activity_from_date', 'activity_to_date', 'activity_from_time', 'activity_to_time',
            'evap_water_inlet_pressure', 'evap_water_outlet_pressure',
            'evap_entering_water_temp', 'evap_leaving_water_temp',
            'evap_approach_temp',
            'cond_water_inlet_pressure', 'cond_water_outlet_pressure',
            'cond_entering_water_temp', 'cond_leaving_water_temp',
            'cond_approach_temp',
            'chiller_control_signal', 'avg_motor_current',
            'compressor_running_time_min', 'starter_energy_kwh',
            'cooling_tower_pump_status', 'chilled_water_pump_status',
            'cooling_tower_fan_status', 'cooling_tower_blowoff_valve_status',
            'cooling_tower_blowdown_time_min',
            'daily_water_consumption_ct1_liters', 'daily_water_consumption_ct2_liters',
            'daily_water_consumption_ct3_liters',
            'operator_sign',
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_by_name', 'approved_at', 'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'tolerance_status',
            'timestamp', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_by_name', 'approved_at',
            'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'tolerance_status',
            'created_at', 'updated_at'
        ]

    def update(self, instance, validated_data):
        # Allow timestamp change only when correcting a rejected or pending-secondary-approval entry
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp  # keep unchanged
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)

    def get_has_corrections(self, obj: ChillerLog) -> bool:
        return obj.corrections.exists()

    def get_approved_by_name(self, obj: ChillerLog):
        user = obj.approved_by
        if user is None:
            return None
        name = (getattr(user, "name", None) or "").strip()
        return name or getattr(user, "email", None)

    def get_tolerance_status(self, obj: ChillerLog) -> str:
        try:
            from core.log_slot_utils import get_tolerance_status
            return get_tolerance_status(obj.timestamp, obj.equipment_id or "", "chiller")
        except Exception:
            return "none"

    def validate(self, attrs):
        remarks = (attrs.get("remarks") if "remarks" in attrs else getattr(self.instance, "remarks", None)) or ""
        if not str(remarks).strip():
            raise serializers.ValidationError({"remarks": ["Remarks are required."]})

        activity_type = attrs.get("activity_type") if "activity_type" in attrs else getattr(self.instance, "activity_type", "operation")
        return super().validate(attrs)


CHILLER_LIMIT_FIELDS = [
    'daily_power_limit_kw',
    'electricity_rate_rs_per_kwh',
    'daily_water_ct1_liters', 'daily_water_ct2_liters', 'daily_water_ct3_liters',
]


class ChillerEquipmentLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChillerEquipmentLimit
        fields = [
            'id', 'equipment_id', 'client_id', 'effective_from',
            'daily_power_limit_kw',
            'electricity_rate_rs_per_kwh',
            'daily_water_ct1_liters', 'daily_water_ct2_liters', 'daily_water_ct3_liters',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def _get_user(self):
        request = self.context.get("request")
        return request.user if request and getattr(request, "user", None) else None

    def validate_effective_from(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError("Effective from date cannot be in the future.")
        return value

    def create(self, validated_data):
        instance = super().create(validated_data)
        user = self._get_user()
        for field in CHILLER_LIMIT_FIELDS:
            if field in validated_data and validated_data[field] is not None:
                log_limit_change(
                    user=user,
                    object_type="chiller_limit",
                    key=instance.equipment_id,
                    field_name=field,
                    old=None,
                    new=validated_data[field],
                    event_type="limit_update",
                )
        return instance

    def update(self, instance, validated_data):
        user = self._get_user()
        old_values = {
            k: getattr(instance, k, None)
            for k in CHILLER_LIMIT_FIELDS
            if k in validated_data
        }
        super().update(instance, validated_data)
        for key in validated_data:
            if key not in CHILLER_LIMIT_FIELDS:
                continue
            old_val = old_values.get(key)
            new_val = getattr(instance, key, None)
            if old_val != new_val:
                log_limit_change(
                    user=user,
                    object_type="chiller_limit",
                    key=instance.equipment_id,
                    field_name=key,
                    old=old_val,
                    new=new_val,
                    event_type="limit_update",
                )
        return instance