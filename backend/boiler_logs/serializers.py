from rest_framework import serializers
from .models import BoilerLog


class BoilerLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    
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
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_at', 'timestamp',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_at',
            'timestamp', 'created_at', 'updated_at'
        ]

