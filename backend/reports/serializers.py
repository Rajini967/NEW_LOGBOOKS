from rest_framework import serializers
from .models import Report, AuditEvent


class ReportSerializer(serializers.ModelSerializer):
    approved_by_name = serializers.CharField(source='approved_by.name', read_only=True, allow_null=True)
    approved_by_email = serializers.CharField(source='approved_by.email', read_only=True, allow_null=True)
    
    class Meta:
        model = Report
        fields = [
            'id',
            'report_type',
            'source_id',
            'source_table',
            'title',
            'site',
            'created_by',
            'created_at',
            'approved_by',
            'approved_by_name',
            'approved_by_email',
            'approved_at',
            'remarks',
            'timestamp',
            'updated_at',
        ]
        read_only_fields = ['id', 'approved_at', 'timestamp', 'updated_at']


class AuditEventSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True, allow_null=True)
    user_name = serializers.CharField(source="user.name", read_only=True, allow_null=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "timestamp",
            "user",
            "user_email",
            "user_name",
            "event_type",
            "object_type",
            "object_id",
            "field_name",
            "old_value",
            "new_value",
            "extra",
        ]
        read_only_fields = fields

