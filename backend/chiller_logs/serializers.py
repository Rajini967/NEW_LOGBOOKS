from rest_framework import serializers
from .models import ChillerLog


class ChillerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    
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
            'cooling_tower_chemical_name', 'cooling_tower_chemical_qty_per_day',
            'chilled_water_pump_chemical_name', 'chilled_water_pump_chemical_qty_kg',
            'cooling_tower_fan_chemical_name', 'cooling_tower_fan_chemical_qty_kg',
            'recording_frequency', 'operator_sign', 'verified_by',
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_at', 'timestamp',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_at',
            'timestamp', 'created_at', 'updated_at'
        ]

