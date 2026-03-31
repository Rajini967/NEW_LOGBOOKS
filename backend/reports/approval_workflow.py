from rest_framework.exceptions import ValidationError


def normalize_approval_action(raw_action: str | None) -> str:
    action = (raw_action or "approve").strip().lower()
    if action not in {"approve", "reject"}:
        raise ValidationError({"error": 'Invalid action. Use "approve" or "reject".'})
    return action


def require_rejection_comment(action: str, comment: str) -> None:
    if action == "reject" and not (comment or "").strip():
        raise ValidationError({"remarks": ["Comment is required when rejecting."]})


def ensure_not_operator(operator_id: str | None, actor_id: str, operation: str) -> None:
    if operator_id and str(operator_id) == str(actor_id):
        raise ValidationError(
            {
                "error": (
                    f"The log book entry must be {operation} by a different user than the "
                    "operator (Log Book Done By)."
                )
            }
        )


def ensure_status_allowed(current_status: str, allowed_statuses: tuple[str, ...], action: str) -> None:
    if current_status not in allowed_statuses:
        allowed_text = ", ".join(allowed_statuses)
        raise ValidationError({"error": f"Only {allowed_text} entries can be {action}d."})


def ensure_secondary_approver_diff(previous_approver_id: str | None, actor_id: str) -> None:
    if previous_approver_id and str(previous_approver_id) == str(actor_id):
        raise ValidationError(
            {
                "error": (
                    "A different person must perform secondary approval. "
                    "The person who rejected cannot approve the corrected entry."
                )
            }
        )
