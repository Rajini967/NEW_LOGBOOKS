from rest_framework import serializers
from .models import LogbookSchema, LogbookRoleAssignment, LogbookEntry
from accounts.models import UserRole
from reports.utils import log_limit_change


class LogbookRoleAssignmentSerializer(serializers.ModelSerializer):
    assigned_by_name = serializers.CharField(source='assigned_by.name', read_only=True)
    
    class Meta:
        model = LogbookRoleAssignment
        fields = ['id', 'role', 'assigned_at', 'assigned_by', 'assigned_by_name']
        read_only_fields = ['id', 'assigned_at', 'assigned_by']


class LogbookSchemaSerializer(serializers.ModelSerializer):
    assigned_roles = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    
    class Meta:
        model = LogbookSchema
        fields = [
            'id', 'name', 'description', 'client_id', 'category',
            'fields', 'workflow', 'display', 'metadata',
            'created_at', 'updated_at', 'created_by', 'created_by_name',
            'assigned_roles'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']
    
    def get_assigned_roles(self, obj):
        """Get list of roles assigned to this logbook."""
        assignments = LogbookRoleAssignment.objects.filter(schema=obj)
        return [assignment.role for assignment in assignments]


class LogbookSchemaCreateSerializer(serializers.ModelSerializer):
    assigned_roles = serializers.ListField(
        child=serializers.ChoiceField(choices=UserRole.choices),
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = LogbookSchema
        fields = [
            'name', 'description', 'client_id', 'category',
            'fields', 'workflow', 'display', 'metadata',
            'assigned_roles'
        ]
    
    def create(self, validated_data):
        assigned_roles = validated_data.pop('assigned_roles', [])
        request = self.context.get('request')
        
        # created_by is set in perform_create, so don't set it here
        schema = LogbookSchema.objects.create(**validated_data)
        
        # Create role assignments
        for role in assigned_roles:
            LogbookRoleAssignment.objects.create(
                schema=schema,
                role=role,
                assigned_by=request.user if request else None
            )
        
        return schema


class LogbookSchemaUpdateSerializer(serializers.ModelSerializer):
    assigned_roles = serializers.ListField(
        child=serializers.ChoiceField(choices=UserRole.choices),
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = LogbookSchema
        fields = [
            'name', 'description', 'client_id', 'category',
            'fields', 'workflow', 'display', 'metadata',
            'assigned_roles'
        ]
    
    def update(self, instance, validated_data):
        assigned_roles = validated_data.pop('assigned_roles', None)
        request = self.context.get('request')

        # Capture old config before changes
        old_fields = list(instance.fields or [])
        old_metadata = dict(instance.metadata or {})

        # Update schema fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Capture new config after changes
        new_fields = list(instance.fields or [])
        new_metadata = dict(instance.metadata or {})

        user = request.user if request and getattr(request, "user", None) else None

        # --- Log limit-like changes in fields JSON ---
        try:
            # Index fields by their 'name' for comparison
            def index_fields(fields_list):
                indexed = {}
                for f in fields_list:
                    if not isinstance(f, dict):
                        continue
                    name = f.get("name") or f.get("id")
                    if name:
                        indexed[name] = f
                return indexed

            old_index = index_fields(old_fields)
            new_index = index_fields(new_fields)

            limit_keys = {
                "min",
                "max",
                "nmt",
                "nlt",
                "warning_low",
                "warning_high",
                "critical_low",
                "critical_high",
            }

            for field_name in sorted(set(old_index.keys()) | set(new_index.keys())):
                old_cfg = old_index.get(field_name, {}) or {}
                new_cfg = new_index.get(field_name, {}) or {}

                for key in limit_keys:
                    old_val = old_cfg.get(key)
                    new_val = new_cfg.get(key)
                    if old_val == new_val:
                        continue

                    extra = {
                        "schema_name": instance.name,
                        "client_id": instance.client_id,
                        "category": instance.category,
                        "field_label": new_cfg.get("label") or old_cfg.get("label") or field_name,
                    }
                    log_limit_change(
                        user=user,
                        object_type="logbook_field_limit",
                        key=f"{instance.id}:{field_name}",
                        field_name=f"{field_name}.{key}",
                        old=old_val,
                        new=new_val,
                        extra=extra,
                        event_type="limit_update",
                    )
        except Exception:
            # Never block saving schemas due to audit issues
            pass

        # --- Log metadata limit-like changes ---
        try:
            combined_keys = set(old_metadata.keys()) | set(new_metadata.keys())
            for meta_key in sorted(combined_keys):
                old_val = old_metadata.get(meta_key)
                new_val = new_metadata.get(meta_key)
                if old_val == new_val:
                    continue

                # Only treat obvious limit-style metadata keys as limits
                if not (
                    str(meta_key).endswith("_min")
                    or str(meta_key).endswith("_max")
                    or str(meta_key).endswith("_limit")
                ):
                    continue

                extra = {
                    "schema_name": instance.name,
                    "client_id": instance.client_id,
                    "category": instance.category,
                }
                log_limit_change(
                    user=user,
                    object_type="logbook_schema",
                    key=str(instance.id),
                    field_name=f"metadata.{meta_key}",
                    old=old_val,
                    new=new_val,
                    extra=extra,
                    event_type="limit_update",
                )
        except Exception:
            pass
        
        # Update role assignments if provided
        if assigned_roles is not None:
            # Clear existing assignments
            LogbookRoleAssignment.objects.filter(schema=instance).delete()
            
            # Create new assignments
            for role in assigned_roles:
                LogbookRoleAssignment.objects.create(
                    schema=instance,
                    role=role,
                    assigned_by=request.user if request else None
                )
        
        return instance


class LogbookEntrySerializer(serializers.ModelSerializer):
    schema_name = serializers.CharField(source='schema.name', read_only=True)
    operator_name = serializers.CharField(read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.name', read_only=True)
    
    class Meta:
        model = LogbookEntry
        fields = [
            'id', 'schema', 'schema_name', 'client_id', 'site_id',
            'data', 'operator', 'operator_name', 'status',
            'approved_by', 'approved_by_name', 'approved_at',
            'remarks', 'attachments', 'timestamp',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator', 'operator_name', 'approved_by', 'approved_by_name',
            'approved_at', 'timestamp', 'created_at', 'updated_at'
        ]

