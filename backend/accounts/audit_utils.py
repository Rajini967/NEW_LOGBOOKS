"""
User lifecycle audit logging for 21 CFR Part 11 compliance.
Writes to reports.AuditEvent so the audit trail is unified and read-only via API.
"""
import logging

logger = logging.getLogger(__name__)


def log_user_audit_event(
    event_type,
    target_user,
    actor=None,
    old_value=None,
    new_value=None,
    field_name="user",
):
    """
    Record a user lifecycle event in the audit trail.

    Args:
        event_type: One of user_created, password_changed, user_locked, user_unlocked.
        target_user: The user affected (created, locked, unlocked, or whose password changed).
        actor: The user who performed the action (request.user); None for system-driven events (e.g. lock).
        old_value: Previous value (e.g. "Locked"); use "[Redacted]" for password.
        new_value: New value (e.g. "Unlocked" or created user email); use "[Redacted]" for password.
        field_name: Optional label for the field (e.g. "user", "password", "lock").
    """
    try:
        from reports.models import AuditEvent

        AuditEvent.objects.create(
            event_type=event_type,
            user=actor if (actor is not None and getattr(actor, "is_authenticated", False)) else None,
            object_type="user",
            object_id=str(target_user.id),
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
        )
    except Exception as e:
        logger.exception("Failed to write user audit event: %s", e)
