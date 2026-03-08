from rest_framework import serializers
from .models import BoilerLog, BoilerEquipmentLimit


class BoilerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(source='secondary_approved_by.id', read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()

    class Meta:
        model = BoilerLog
        fields = [
            'id', 'equipment_id', 'site_id',
            'feed_water_temp', 'oil_temp', 'steam_temp',
            'steam_pressure', 'steam_flow_lph',
            'fo_hsd_ng_day_tank_level', 'feed_water_tank_level',
            'fo_pre_heater_temp', 'burner_oil_pressure', 'burner_heater_temp',
            'boiler_steam_pressure', 'stack_temperature', 'steam_pressure_after_prv',
            'feed_water_hardness_ppm', 'feed_water_tds_ppm', 'fo_hsd_ng_consumption',
            'mobrey_functioning', 'manual_blowdown_time',
            'diesel_stock_liters', 'diesel_cost_rupees',
            'furnace_oil_stock_liters', 'furnace_oil_cost_rupees',
            'brigade_stock_kg', 'brigade_cost_rupees',
            'daily_power_consumption_kwh', 'daily_water_consumption_liters', 'daily_chemical_consumption_kg',
            'daily_diesel_consumption_liters', 'daily_furnace_oil_consumption_liters', 'daily_brigade_consumption_kg',
            'steam_consumption_kg_hr',
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_at', 'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections',
            'timestamp', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_at',
            'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections',
            'created_at', 'updated_at'
        ]

    def get_has_corrections(self, obj: BoilerLog) -> bool:
        return obj.corrections.exists()

    def update(self, instance, validated_data):
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)


class BoilerEquipmentLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoilerEquipmentLimit
        fields = [
            'id', 'equipment_id', 'client_id',
            'daily_power_limit_kw', 'daily_water_limit_liters', 'daily_chemical_limit_kg',
            'daily_diesel_limit_liters', 'daily_furnace_oil_limit_liters', 'daily_brigade_limit_kg',
            'daily_steam_limit_kg_hr',
            'electricity_rate_rs_per_kwh', 'diesel_rate_rs_per_liter', 'furnace_oil_rate_rs_per_liter', 'brigade_rate_rs_per_kg',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

