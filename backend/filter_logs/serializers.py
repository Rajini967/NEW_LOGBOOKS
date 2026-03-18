from rest_framework import serializers

from .models import FilterLog


class FilterLogSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(
        source='secondary_approved_by.id',
        read_only=True,
        allow_null=True,
    )
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()
    tolerance_status = serializers.SerializerMethodField()

    class Meta:
        model = FilterLog
        fields = [
            'id',
            'equipment_id',
            'activity_type', 'activity_from_date', 'activity_to_date', 'activity_from_time', 'activity_to_time',
            'category',
            'filter_no',
            'filter_micron',
            'filter_size',
            'tag_info',
            'installed_date',
            'integrity_done_date',
            'integrity_due_date',
            'cleaning_done_date',
            'cleaning_due_date',
            'replacement_due_date',
            'remarks',
            'comment',
            'operator_id',
            'operator_name',
            'status',
            'approved_by_id',
            'approved_at',
            'secondary_approved_by_id',
            'secondary_approved_at',
            'corrects_id',
            'has_corrections',
            'tolerance_status',
            'timestamp',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'operator_id',
            'operator_name',
            'approved_by_id',
            'approved_at',
            'secondary_approved_by_id',
            'secondary_approved_at',
            'corrects_id',
            'has_corrections',
            'tolerance_status',
            'created_at',
            'updated_at',
        ]

    def update(self, instance, validated_data):
        # Allow timestamp change only when correcting a rejected or pending-secondary-approval entry
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)

    def get_has_corrections(self, obj: FilterLog) -> bool:
        return obj.corrections.exists()

    def get_tolerance_status(self, obj: FilterLog) -> str:
        try:
            from core.log_slot_utils import get_tolerance_status
            return get_tolerance_status(obj.timestamp, obj.equipment_id or "", "filter")
        except Exception:
            return "none"

    def validate(self, attrs):
        remarks = (attrs.get("remarks") if "remarks" in attrs else getattr(self.instance, "remarks", None)) or ""
        if not str(remarks).strip():
            raise serializers.ValidationError({"remarks": ["Remarks are required."]})
        return super().validate(attrs)

