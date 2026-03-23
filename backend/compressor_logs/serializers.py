from rest_framework import serializers
from .models import CompressorLog


class CompressorLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    approved_by_name = serializers.SerializerMethodField()
    secondary_approved_by_id = serializers.UUIDField(
        source='secondary_approved_by.id',
        read_only=True,
        allow_null=True,
    )
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()
    
    class Meta:
        model = CompressorLog
        fields = [
            'id', 'equipment_id', 'site_id',
            'activity_type', 'activity_from_date', 'activity_to_date', 'activity_from_time', 'activity_to_time',
            'compressor_supply_temp', 'compressor_return_temp',
            'compressor_pressure', 'compressor_flow',
            'remarks', 'comment', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_by_name', 'approved_at', 'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'timestamp',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_by_name', 'approved_at',
            'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections',
            'timestamp', 'created_at', 'updated_at'
        ]

    def update(self, instance, validated_data):
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)

    def get_has_corrections(self, obj: CompressorLog) -> bool:
        return obj.corrections.exists()

    def get_approved_by_name(self, obj: CompressorLog):
        user = obj.approved_by
        if user is None:
            return None
        name = (getattr(user, "name", None) or "").strip()
        return name or getattr(user, "email", None)

    def validate(self, attrs):
        remarks = (attrs.get("remarks") if "remarks" in attrs else getattr(self.instance, "remarks", None)) or ""
        if not str(remarks).strip():
            raise serializers.ValidationError({"remarks": ["Remarks are required."]})

        activity_type = attrs.get("activity_type") if "activity_type" in attrs else getattr(self.instance, "activity_type", "operation")
        if (activity_type or "operation") == "operation":
            required = ["compressor_supply_temp", "compressor_return_temp", "compressor_pressure"]
            missing = [f for f in required if attrs.get(f, getattr(self.instance, f, None)) in (None, "")]
            if missing:
                raise serializers.ValidationError({f: ["This field is required when activity_type is operation."] for f in missing})
        return super().validate(attrs)

