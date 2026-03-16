from rest_framework import serializers
from .models import BoilerLog, BoilerEquipmentLimit
from reports.utils import log_limit_change


class BoilerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(source='secondary_approved_by.id', read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()
    tolerance_status = serializers.SerializerMethodField()

    class Meta:
        model = BoilerLog
        fields = [
            'id', 'equipment_id', 'site_id',
            'activity_type', 'activity_from_date', 'activity_to_date', 'activity_from_time', 'activity_to_time',
            'feed_water_temp', 'oil_temp', 'steam_temp',
            'steam_pressure', 'steam_flow_lph',
            'fo_hsd_ng_day_tank_level', 'feed_water_tank_level',
            'fo_pre_heater_temp', 'burner_oil_pressure', 'burner_heater_temp',
            'boiler_steam_pressure', 'stack_temperature', 'steam_pressure_after_prv',
            'feed_water_hardness_ppm', 'feed_water_tds_ppm', 'fo_hsd_ng_consumption',
            'mobrey_functioning', 'manual_blowdown_time',
            'daily_power_consumption_kwh', 'daily_water_consumption_liters', 'daily_chemical_consumption_kg',
            'daily_diesel_consumption_liters', 'daily_furnace_oil_consumption_liters', 'daily_brigade_consumption_kg',
            'steam_consumption_kg_hr',
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_at', 'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'tolerance_status',
            'timestamp', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_at',
            'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'tolerance_status',
            'created_at', 'updated_at'
        ]

    def get_has_corrections(self, obj: BoilerLog) -> bool:
        return obj.corrections.exists()

    def get_tolerance_status(self, obj: BoilerLog) -> str:
        try:
            from core.log_slot_utils import get_tolerance_status
            return get_tolerance_status(obj.timestamp, obj.equipment_id or "", "boiler")
        except Exception:
            return "none"

    def update(self, instance, validated_data):
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)

    def validate(self, attrs):
        remarks = (attrs.get("remarks") if "remarks" in attrs else getattr(self.instance, "remarks", None)) or ""
        if not str(remarks).strip():
            raise serializers.ValidationError({"remarks": ["Remarks are required."]})

        activity_type = attrs.get("activity_type") if "activity_type" in attrs else getattr(self.instance, "activity_type", "operation")
        if (activity_type or "operation") == "operation":
            required = ["feed_water_temp", "oil_temp", "steam_temp", "steam_pressure"]
            missing = [f for f in required if attrs.get(f, getattr(self.instance, f, None)) in (None, "")]
            if missing:
                raise serializers.ValidationError({f: ["This field is required when activity_type is operation."] for f in missing})
        return super().validate(attrs)


BOILER_LIMIT_FIELDS = [
    'daily_power_limit_kw', 'daily_water_limit_liters', 'daily_chemical_limit_kg',
    'daily_diesel_limit_liters', 'daily_furnace_oil_limit_liters', 'daily_brigade_limit_kg',
    'daily_steam_limit_kg_hr',
    'electricity_rate_rs_per_kwh', 'diesel_rate_rs_per_liter', 'furnace_oil_rate_rs_per_liter', 'brigade_rate_rs_per_kg',
]


class BoilerEquipmentLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoilerEquipmentLimit
        fields = [
            'id', 'equipment_id', 'client_id', 'effective_from',
            'daily_power_limit_kw', 'daily_water_limit_liters', 'daily_chemical_limit_kg',
            'daily_diesel_limit_liters', 'daily_furnace_oil_limit_liters', 'daily_brigade_limit_kg',
            'daily_steam_limit_kg_hr',
            'electricity_rate_rs_per_kwh', 'diesel_rate_rs_per_liter', 'furnace_oil_rate_rs_per_liter', 'brigade_rate_rs_per_kg',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def _get_user(self):
        request = self.context.get("request")
        return request.user if request and getattr(request, "user", None) else None

    def create(self, validated_data):
        instance = super().create(validated_data)
        user = self._get_user()
        for field in BOILER_LIMIT_FIELDS:
            if field in validated_data and validated_data[field] is not None:
                log_limit_change(
                    user=user,
                    object_type="boiler_limit",
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
            for k in BOILER_LIMIT_FIELDS
            if k in validated_data
        }
        super().update(instance, validated_data)
        for key in validated_data:
            if key not in BOILER_LIMIT_FIELDS:
                continue
            old_val = old_values.get(key)
            new_val = getattr(instance, key, None)
            if old_val != new_val:
                log_limit_change(
                    user=user,
                    object_type="boiler_limit",
                    key=instance.equipment_id,
                    field_name=key,
                    old=old_val,
                    new=new_val,
                    event_type="limit_update",
                )
        return instance

