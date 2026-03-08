from rest_framework import serializers
from .models import ChillerLog, ChillerEquipmentLimit, CoolingTowerChemicalLog


class ChillerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(source='secondary_approved_by.id', read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()

    class Meta:
        model = ChillerLog
        fields = [
            'id', 'equipment_id', 'site_id',
            'chiller_supply_temp', 'chiller_return_temp',
            'cooling_tower_supply_temp', 'cooling_tower_return_temp',
            'ct_differential_temp', 'chiller_water_inlet_pressure',
            'chiller_makeup_water_flow',
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
            'cooling_tower_chemical_name', 'cooling_tower_chemical_qty_per_day',
            'chilled_water_pump_chemical_name', 'chilled_water_pump_chemical_qty_kg',
            'cooling_tower_fan_chemical_name', 'cooling_tower_fan_chemical_qty_kg',
            'recording_frequency', 'operator_sign', 'verified_by',
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


class ChillerEquipmentLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChillerEquipmentLimit
        fields = [
            'id', 'equipment_id', 'client_id',
            'daily_power_limit_kw',
            'daily_water_ct1_liters', 'daily_water_ct2_liters', 'daily_water_ct3_liters',
            'daily_chemical_ct1_kg', 'daily_chemical_ct2_kg', 'daily_chemical_ct3_kg',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CoolingTowerChemicalLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True, allow_null=True)

    class Meta:
        model = CoolingTowerChemicalLog
        fields = [
            'id', 'date', 'equipment_id', 'tower_slot', 'chemical_name', 'quantity_kg', 'batch',
            'operator_id', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

