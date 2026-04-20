from rest_framework import serializers
from .models import Report, AuditEvent
from uuid import UUID


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
    target_user_email = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "timestamp",
            "user",
            "user_email",
            "user_name",
            "target_user_email",
            "event_type",
            "object_type",
            "object_id",
            "field_name",
            "old_value",
            "new_value",
            "extra",
        ]
        read_only_fields = fields

    def get_target_user_email(self, obj):
        """When object_type is 'user', return the target user's email (e.g. for user_locked where actor is null)."""
        if obj.object_type != "user" or not obj.object_id:
            return None
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.filter(pk=obj.object_id).values_list("email", flat=True).first()
        except Exception:
            return None

    def _is_uuid(self, value: str) -> bool:
        try:
            UUID(str(value))
            return True
        except Exception:
            return False

    def _resolve_log_extra_from_object(self, object_type: str, object_id: str):
        """Best-effort context enrichment for legacy audit rows missing extra payload."""
        normalized = str(object_type or "").strip().lower().replace(" ", "_")
        if not object_id or not self._is_uuid(object_id):
            return {}
        # Try prior audit rows first (helps deleted logs where source row no longer exists).
        history = (
            AuditEvent.objects
            .filter(object_type=object_type, object_id=object_id)
            .exclude(extra__isnull=True)
            .order_by("-timestamp")
            .values_list("extra", flat=True)[:20]
        )
        for entry in history:
            if not isinstance(entry, dict):
                continue
            equipment_id = str(entry.get("equipment_id") or "").strip()
            equipment_name = str(entry.get("equipment_name") or "").strip()
            filter_no = str(entry.get("filter_no") or "").strip()
            if equipment_id or equipment_name or filter_no:
                return {
                    "equipment_id": equipment_id,
                    "equipment_name": equipment_name,
                    "filter_no": filter_no,
                    "log_timestamp": str(entry.get("log_timestamp") or "").strip(),
                    "log_date": str(entry.get("log_date") or "").strip(),
                }
        try:
            if normalized == "chiller_log":
                from chiller_logs.models import ChillerLog
                row = ChillerLog.objects.filter(pk=object_id).values("equipment_id", "timestamp").first()
                if not row:
                    return {}
                return {
                    "equipment_id": str(row.get("equipment_id") or ""),
                    "log_timestamp": row["timestamp"].isoformat() if row.get("timestamp") else "",
                    "log_date": str(row["timestamp"].date()) if row.get("timestamp") else "",
                }
            if normalized == "boiler_log":
                from boiler_logs.models import BoilerLog
                row = BoilerLog.objects.filter(pk=object_id).values("equipment_id", "timestamp").first()
                if not row:
                    return {}
                return {
                    "equipment_id": str(row.get("equipment_id") or ""),
                    "log_timestamp": row["timestamp"].isoformat() if row.get("timestamp") else "",
                    "log_date": str(row["timestamp"].date()) if row.get("timestamp") else "",
                }
            if normalized == "filter_log":
                from filter_logs.models import FilterLog
                row = FilterLog.objects.filter(pk=object_id).values("equipment_id", "filter_no", "timestamp").first()
                if not row:
                    return {}
                return {
                    "equipment_id": str(row.get("equipment_id") or ""),
                    "filter_no": str(row.get("filter_no") or ""),
                    "log_timestamp": row["timestamp"].isoformat() if row.get("timestamp") else "",
                    "log_date": str(row["timestamp"].date()) if row.get("timestamp") else "",
                }
            if normalized == "chemical_log":
                from chemical_prep.models import ChemicalPreparation
                row = ChemicalPreparation.objects.filter(pk=object_id).values("equipment_name", "timestamp").first()
                if not row:
                    return {}
                return {
                    "equipment_name": str(row.get("equipment_name") or ""),
                    "log_timestamp": row["timestamp"].isoformat() if row.get("timestamp") else "",
                    "log_date": str(row["timestamp"].date()) if row.get("timestamp") else "",
                }
            if normalized == "briquette_log":
                from briquette_logs.models import BriquetteLog
                row = BriquetteLog.objects.filter(pk=object_id).values("equipment_id", "timestamp").first()
                if not row:
                    return {}
                return {
                    "equipment_id": str(row.get("equipment_id") or ""),
                    "log_timestamp": row["timestamp"].isoformat() if row.get("timestamp") else "",
                    "log_date": str(row["timestamp"].date()) if row.get("timestamp") else "",
                }
        except Exception:
            return {}
        return {}

    def _resolve_entity_extra_from_object(self, object_type: str, object_id: str):
        normalized = str(object_type or "").strip().lower().replace(" ", "_")
        if not object_id or not self._is_uuid(object_id):
            return {}
        try:
            if normalized == "equipment":
                from equipment.models import Equipment
                row = Equipment.objects.filter(pk=object_id).values("equipment_number", "name").first()
                if not row:
                    return {}
                return {
                    "equipment_id": str(row.get("equipment_number") or ""),
                    "equipment_name": str(row.get("name") or ""),
                }
            if normalized == "filter_master":
                from filter_master.models import FilterMaster
                row = FilterMaster.objects.filter(pk=object_id).values("filter_id").first()
                if not row:
                    return {}
                return {"filter_id": str(row.get("filter_id") or "")}
            if normalized == "filter_assignment":
                from filter_master.models import FilterAssignment
                row = (
                    FilterAssignment.objects
                    .filter(pk=object_id)
                    .values("filter__filter_id", "equipment__equipment_number", "equipment__name")
                    .first()
                )
                if not row:
                    return {}
                return {
                    "filter_id": str(row.get("filter__filter_id") or ""),
                    "equipment_id": str(row.get("equipment__equipment_number") or ""),
                    "equipment_name": str(row.get("equipment__name") or ""),
                }
            if normalized == "filter_schedule":
                from filter_master.models import FilterSchedule
                row = (
                    FilterSchedule.objects
                    .filter(pk=object_id)
                    .values(
                        "assignment__filter__filter_id",
                        "assignment__equipment__equipment_number",
                        "assignment__equipment__name",
                    )
                    .first()
                )
                if not row:
                    return {}
                return {
                    "filter_id": str(row.get("assignment__filter__filter_id") or ""),
                    "equipment_id": str(row.get("assignment__equipment__equipment_number") or ""),
                    "equipment_name": str(row.get("assignment__equipment__name") or ""),
                }
            if normalized == "chemical_assignment":
                from chemical_prep.models import ChemicalAssignment
                row = (
                    ChemicalAssignment.objects.filter(pk=object_id)
                    .values("equipment_name", "chemical_name", "chemical__name")
                    .first()
                )
                if not row:
                    return {}
                chem = row.get("chemical__name") or row.get("chemical_name") or ""
                return {
                    "equipment_name": str(row.get("equipment_name") or ""),
                    "chemical_name": str(chem),
                }
        except Exception:
            return {}
        return {}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        object_type = str(data.get("object_type") or "")
        event_type = str(data.get("event_type") or "").strip().lower().replace(" ", "_")
        is_log_row = object_type.strip().lower().replace(" ", "_").endswith("_log")
        is_entity_row = event_type.startswith("entity_")
        if not is_log_row and not event_type.startswith("log_") and not is_entity_row:
            return data

        extra = data.get("extra")
        if not isinstance(extra, dict):
            extra = {}
        has_context = bool(
            str(extra.get("equipment_id") or "").strip()
            or str(extra.get("equipment_name") or "").strip()
            or str(extra.get("filter_no") or "").strip()
        )
        if not has_context:
            resolved = self._resolve_log_extra_from_object(object_type, str(data.get("object_id") or ""))
            if resolved:
                extra = {**resolved, **extra}
                data["extra"] = extra
        if is_entity_row:
            has_entity_context = bool(
                str(extra.get("equipment_id") or "").strip()
                or str(extra.get("equipment_name") or "").strip()
                or str(extra.get("filter_no") or "").strip()
            )
            if not has_entity_context:
                resolved_entity = self._resolve_entity_extra_from_object(
                    object_type, str(data.get("object_id") or "")
                )
                if resolved_entity:
                    extra = {**resolved_entity, **extra}
                    data["extra"] = extra
        return data

