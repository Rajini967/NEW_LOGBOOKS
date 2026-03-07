"""
Custom password validators for policy enforcement: complexity and max length.
"""
import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class MaximumLengthValidator:
    """Reject passwords longer than max_length."""

    def __init__(self, max_length=128):
        self.max_length = max_length

    def validate(self, password, user=None):
        if len(password) > self.max_length:
            raise ValidationError(
                _("Password must not exceed %(max_length)d characters."),
                code="password_too_long",
                params={"max_length": self.max_length},
            )

    def get_help_text(self):
        return _("Password must not exceed %(max_length)d characters.") % {
            "max_length": self.max_length
        }


class UppercaseValidator:
    """Require at least one uppercase letter."""

    def validate(self, password, user=None):
        if not re.search(r"[A-Z]", password):
            raise ValidationError(
                _("Password must contain at least one uppercase letter (A-Z)."),
                code="password_no_upper",
            )

    def get_help_text(self):
        return _("Password must contain at least one uppercase letter (A-Z).")


class LowercaseValidator:
    """Require at least one lowercase letter."""

    def validate(self, password, user=None):
        if not re.search(r"[a-z]", password):
            raise ValidationError(
                _("Password must contain at least one lowercase letter (a-z)."),
                code="password_no_lower",
            )

    def get_help_text(self):
        return _("Password must contain at least one lowercase letter (a-z).")


class DigitValidator:
    """Require at least one digit."""

    def validate(self, password, user=None):
        if not re.search(r"\d", password):
            raise ValidationError(
                _("Password must contain at least one digit (0-9)."),
                code="password_no_digit",
            )

    def get_help_text(self):
        return _("Password must contain at least one digit (0-9).")


class SpecialCharacterValidator:
    """Require at least one special character."""

    def validate(self, password, user=None):
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]", password):
            raise ValidationError(
                _("Password must contain at least one special character."),
                code="password_no_special",
            )

    def get_help_text(self):
        return _("Password must contain at least one special character.")
