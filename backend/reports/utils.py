"""
Utility functions for creating reports when entries are approved
and for logging configuration/audit events.
"""
from django.conf import settings
from .models import Report, AuditEvent, MissingSlotsSnapshot


def create_report_entry(
    report_type: str,
    source_id: str,
    source_table: str,
    title: str,
    site: str,
    created_by: str,
    created_at,
    approved_by=None,
    remarks: str = None
):
    """
    Create a Report entry when an item is approved.
    
    Args:
        report_type: Type of report (e.g., 'utility', 'air_velocity', etc.)
        source_id: UUID of the original entry
        source_table: Name of the source table
        title: Report title
        site: Site identifier
        created_by: Name/email of creator
        created_at: Original creation datetime
        approved_by: User who approved (optional)
        remarks: Approval remarks (optional)
    """
    try:
        report = Report.objects.create(
            report_type=report_type,
            source_id=source_id,
            source_table=source_table,
            title=title,
            site=site,
            created_by=created_by,
            created_at=created_at,
            approved_by=approved_by,
            remarks=remarks,
        )
        return report
    except Exception as e:
        # Log error but don't fail the approval process
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error creating report entry: {e}")
        return None


def delete_report_entry(source_id: str, source_table: str):
    """
    Delete a Report entry when the source entry is deleted.
    
    Args:
        source_id: UUID of the source entry
        source_table: Name of the source table
    """
    try:
        Report.objects.filter(source_id=source_id, source_table=source_table).delete()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error deleting report entry: {e}")


def is_redundant_correction_status_audit(field_name: str, old, new) -> bool:
    """
    New correction log rows are always created with status pending_secondary_approval.
    The rejected -> pending_secondary_approval transition is implied by log_corrected
    plus the rejection event; omitting it avoids an extra noisy audit row per correction.
    """
    if field_name != "status":
        return False
    o = str(old) if old is not None else ""
    n = str(new) if new is not None else ""
    return o == "rejected" and n == "pending_secondary_approval"


def log_limit_change(
    user,
    object_type: str,
    key: str,
    field_name: str,
    old,
    new,
    extra=None,
    event_type: str = "limit_update",
):
    """
    Helper to record a limit/configuration change in the audit trail.

    Args:
        user: User performing the change (can be None for system changes)
        object_type: Short label for the object type (e.g. 'chiller_limit')
        key: Identifier/key for the specific object (e.g. equipment id)
        field_name: Name of field that changed
        old: Previous value
        new: New value
        extra: Optional dict with additional context
        event_type: Audit event type label, defaults to 'limit_update'
    """
    try:
        AuditEvent.objects.create(
            user=user if getattr(user, "is_authenticated", False) else None,
            event_type=event_type or "limit_update",
            object_type=object_type,
            object_id=str(key),
            field_name=field_name,
            old_value=str(old) if old is not None else None,
            new_value=str(new) if new is not None else None,
            extra=extra or {},
        )
    except Exception as e:  # pragma: no cover - safety net
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error logging limit change: {e}")


def log_audit_event(
    user,
    event_type: str,
    object_type: str,
    object_id: str = "",
    field_name: str = "",
    old_value=None,
    new_value=None,
    extra=None,
):
    """
    Record a generic audit event (log create/delete, entity create/update/delete/approve/reject).

    Args:
        user: User performing the action (request.user); can be None.
        event_type: e.g. 'log_created', 'log_deleted', 'log_approved', 'log_rejected',
                    'entity_created', 'entity_updated', 'entity_deleted', 'entity_approved',
                    'entity_rejected', 'consumption_updated'.
        object_type: e.g. 'chiller_log', 'boiler_log', 'equipment', 'filter_master'.
        object_id: ID of the affected object (string).
        field_name: Optional field name (e.g. 'created', 'status').
        old_value: Optional previous value.
        new_value: Optional new value.
        extra: Optional dict for additional context.
    """
    import logging
    logger = logging.getLogger(__name__)
    try:
        AuditEvent.objects.create(
            user=user if user and getattr(user, "is_authenticated", False) else None,
            event_type=event_type,
            object_type=object_type,
            object_id=str(object_id) if object_id else "",
            field_name=field_name or "",
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            extra=extra or {},
        )
    except Exception as e:
        logger.error("Error logging audit event: %s", e)


def save_missing_slots_snapshot(
    *,
    user,
    log_type: str,
    date_from,
    date_to,
    payload: dict,
    filters: dict | None = None,
):
    """
    Persist missing-slots report payload and emit an audit event.
    """
    import logging
    logger = logging.getLogger(__name__)
    try:
        total_missing_slots = int(payload.get("total_missing_slots") or 0)
        day_count = int(payload.get("day_count") or (1 if payload.get("date") else 0) or 1)
        snapshot = MissingSlotsSnapshot.objects.create(
            log_type=log_type,
            date_from=date_from,
            date_to=date_to,
            day_count=day_count,
            total_missing_slots=total_missing_slots,
            payload=payload or {},
            filters=filters or {},
            requested_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        log_audit_event(
            user=user,
            event_type="missing_slots_snapshot",
            object_type="missing_slots",
            object_id=str(snapshot.id),
            field_name="snapshot_created",
            new_value=str(total_missing_slots),
            extra={
                "snapshot_id": str(snapshot.id),
                "log_type": log_type,
                "date_from": str(date_from),
                "date_to": str(date_to),
                "day_count": day_count,
                "total_missing_slots": total_missing_slots,
                **(filters or {}),
            },
        )
        return snapshot
    except Exception as e:  # pragma: no cover - safety
        logger.error("Error saving missing slots snapshot: %s", e)
        return None


def _format_audit_value(value):
    """Format a field value for audit old_value/new_value display."""
    if value is None:
        return None
    if hasattr(value, "pk"):
        return str(value.pk)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def log_entity_update_changes(serializer, request, object_type, object_id_attr="id"):
    """
    Call from perform_update: snapshot old values, save, then log one entity_updated
    audit event per changed field with old_value and new_value populated.
    """
    instance = serializer.instance
    validated = serializer.validated_data
    if not validated:
        serializer.save()
        return
    old = {k: _format_audit_value(getattr(instance, k, None)) for k in validated}
    serializer.save()
    updated = serializer.instance
    obj_id = str(getattr(updated, object_id_attr, getattr(updated, "pk", "")))
    for k in validated:
        new_val = _format_audit_value(getattr(updated, k, None))
        if old.get(k) != new_val:
            log_audit_event(
                user=request.user,
                event_type="entity_updated",
                object_type=object_type,
                object_id=obj_id,
                field_name=k,
                old_value=old.get(k),
                new_value=new_val,
            )

