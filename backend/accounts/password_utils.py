"""
Password policy helpers: history check and append.
"""
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

from .audit_utils import log_user_activity_event
from .models import UserPasswordHistory

PASSWORD_HISTORY_COUNT = 3


def check_password_history(
    user,
    new_password,
    last_n=PASSWORD_HISTORY_COUNT,
    *,
    performed_by=None,
    ip_address=None,
    user_agent=None,
):
    """
    Raise ValidationError if new_password matches any of the user's last_n stored hashes.
    When rejected, records ``password_reuse_rejected`` on user activity (when audit kwargs allow).
    """
    entries = (
        UserPasswordHistory.objects.filter(user=user)
        .order_by("-created_at")[:last_n]
    )
    for entry in entries:
        if check_password(new_password, entry.password_hash):
            detail = (
                _("Password matches one of the last %(count)d passwords; reuse not allowed.")
                % {"count": last_n}
            )
            try:
                log_user_activity_event(
                    "password_reuse_rejected",
                    user,
                    performed_by=performed_by,
                    detail=str(detail),
                    ip_address=ip_address,
                    user_agent=user_agent or "",
                )
            except Exception:
                pass
            raise ValidationError(
                _("Cannot reuse any of your last %(count)d passwords.") % {"count": last_n}
            )


def append_password_history(user, new_password, keep_last=PASSWORD_HISTORY_COUNT):
    """
    Append the hashed new_password to user's history and prune to keep_last entries.
    Call after set_password and user.save().
    """
    password_hash = make_password(new_password)
    UserPasswordHistory.objects.create(user=user, password_hash=password_hash)
    # Prune: get IDs of entries to keep (newest keep_last)
    to_keep = (
        UserPasswordHistory.objects.filter(user=user)
        .order_by("-created_at")[:keep_last]
        .values_list("id", flat=True)
    )
    UserPasswordHistory.objects.filter(user=user).exclude(id__in=to_keep).delete()
