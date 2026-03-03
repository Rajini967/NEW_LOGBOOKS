"""
Utility functions for creating reports when entries are approved
and for logging configuration/audit events.
"""
from django.conf import settings
from .models import Report, AuditEvent


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

