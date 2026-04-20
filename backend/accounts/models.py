"""
Custom User model for the LogBook system.
"""
import uuid
import secrets
import hashlib
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from django.utils import timezone
from django.conf import settings


class UserRole(models.TextChoices):
    """User role choices."""
    SUPER_ADMIN = 'super_admin', 'Super Admin'
    ADMIN = 'admin', 'Admin'
    SUPERVISOR = 'supervisor', 'Supervisor'
    OPERATOR = 'operator', 'Operator'
    MANAGER = 'manager', 'Manager'


class UserManager(BaseUserManager):
    """Custom user manager."""
    
    def get_queryset(self):
        """Return queryset excluding soft-deleted users by default."""
        return super().get_queryset().filter(is_deleted=False)
    
    def create_user(self, email, password=None, **extra_fields):
        """Create and return a regular user with email and password."""
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        """Create and return a superuser with email and password."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', UserRole.SUPER_ADMIN)
        extra_fields.setdefault('is_active', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        if extra_fields.get('role') != UserRole.SUPER_ADMIN:
            raise ValueError('Superuser must have role=SUPER_ADMIN.')
        
        return self.create_user(email, password, **extra_fields)
    
    def get_by_natural_key(self, email):
        """Retrieve a user by their natural key (email)."""
        return self.get(email=email)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model with UUID, email authentication, and role-based access.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    
    # Role and permissions
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.OPERATOR,
    )

    scoped_departments = models.ManyToManyField(
        'equipment.Department',
        blank=True,
        related_name='scope_users',
        help_text='Departments this user may access (Supervisor/Operator/Manager); Admin/Super Admin ignore.',
    )
    scoped_equipment = models.ManyToManyField(
        'equipment.Equipment',
        blank=True,
        related_name='scope_users',
        help_text='Equipment this user may access; combined with scoped departments on the server.',
    )

    # Status flags
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    
    # Soft delete
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    # Lockout after failed login attempts
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    
    # Password policy
    must_change_password = models.BooleanField(default=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    objects = UserManager()  # Default manager (excludes soft-deleted)
    all_objects = models.Manager()  # Manager that includes all users
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.email
    
    def natural_key(self):
        """Return the natural key for the user (email)."""
        return (self.email,)
    
    def is_locked(self):
        """Return True if the account is currently locked due to failed login attempts."""
        return bool(self.locked_until and timezone.now() < self.locked_until)
    
    def soft_delete(self):
        """Soft delete the user."""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save()
    
    def restore(self):
        """Restore a soft-deleted user."""
        self.is_deleted = False
        self.deleted_at = None
        self.is_active = True
        self.save()
    
    @property
    def is_super_admin(self):
        """Check if user is Super Admin."""
        return self.role == UserRole.SUPER_ADMIN
    
    @property
    def is_admin(self):
        """Check if user is Admin."""
        return self.role == UserRole.ADMIN

    @property
    def is_manager(self):
        """Check if user is Manager (formerly Client)."""
        return self.role == UserRole.MANAGER

    @property
    def is_supervisor(self):
        """Check if user is Supervisor."""
        return self.role == UserRole.SUPERVISOR
    
    @property
    def is_operator(self):
        """Check if user is Operator."""
        return self.role == UserRole.OPERATOR


class UserActivityLog(models.Model):
    """
    Simple activity log for user login/logout and related events.
    """

    EVENT_TYPE_CHOICES = [
        ("login", "Login"),
        ("logout", "Logout"),
        ("manual_login", "Manual Login"),
        ("manual_logout", "Manual Logout"),
        ("auto_logout", "Auto Logout"),
        ("login_failed_blank_email", "Login Failed — Blank Email"),
        ("login_failed_blank_password", "Login Failed — Blank Password"),
        ("login_failed_invalid_password", "Login Failed — Invalid Password"),
        ("login_failed_unknown_email", "Login Failed — Unknown Email"),
        ("login_failed_account_locked", "Login Failed — Account Locked"),
        ("login_failed_inactive_user", "Login Failed — Inactive User"),
        ("user_created", "User Created"),
        ("password_changed", "Password Changed"),
        ("password_reuse_rejected", "Password Reuse Rejected"),
        ("user_locked", "User Locked"),
        ("user_unlocked", "User Unlocked"),
        ("role_changed", "Role Changed"),
        ("access_scope_changed", "Access Scope Changed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activity_logs",
        null=True,
        blank=True,
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performed_user_activity_logs",
        help_text="User who performed the action (e.g. admin editing another user).",
    )
    attempted_email = models.CharField(
        max_length=254,
        blank=True,
        default="",
        help_text="Email attempted when no user row is linked (unknown user) or for cross-reference.",
    )
    event_type = models.CharField(max_length=40, choices=EVENT_TYPE_CHOICES)
    detail = models.TextField(
        blank=True,
        default="",
        help_text="Optional human-readable or JSON context (e.g. role or scope change).",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_activity_logs"
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        ident = self.user.email if self.user_id else (self.attempted_email or "unknown")
        return f"{ident} - {self.event_type} at {self.created_at}"


class LogEntryInterval(models.TextChoices):
    """Log book entry interval for all log monitors."""
    HOURLY = 'hourly', 'Hourly'
    SHIFT = 'shift', 'Shift'
    DAILY = 'daily', 'Daily'


class SessionSetting(models.Model):
    """
    Singleton-style model storing session configuration such as
    auto-logout timeout. There should normally be only one row.
    """

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    auto_logout_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Auto logout after this many minutes of inactivity.",
    )
    password_expiry_days = models.PositiveIntegerField(
        default=90,
        null=True,
        blank=True,
        help_text="Force password change after this many days. Null/blank means no expiry.",
    )
    log_entry_interval = models.CharField(
        max_length=10,
        choices=LogEntryInterval.choices,
        default=LogEntryInterval.HOURLY,
        help_text="Common log book entry interval for all log monitors (chiller, boiler, filter, chemical, etc.).",
    )
    shift_duration_hours = models.PositiveIntegerField(
        default=8,
        help_text="Shift length in hours; used when log_entry_interval is 'shift' for next-entry-due calculation.",
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_session_settings",
    )

    class Meta:
        db_table = "session_settings"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Session settings (auto_logout_minutes={self.auto_logout_minutes})"

    @classmethod
    def get_solo(cls):
        """
        Return the single SessionSetting instance, creating it with defaults
        if it does not yet exist.
        """
        obj, _ = cls.objects.get_or_create(pk=1, defaults={})
        return obj


def hash_reset_token(raw_token: str) -> str:
    """
    Return a SHA-256 hex digest for a raw reset token.

    The raw token is only sent to the user via email and never stored.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class PasswordResetToken(models.Model):
    """
    Password reset token for a user.

    Tokens are single-use and time-limited. Only a hash of the token is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        db_table = "password_reset_tokens"
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Password reset token for {self.user.email}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def mark_used(self) -> None:
        self.is_used = True
        self.save(update_fields=["is_used"])

    @classmethod
    def create_for_user(cls, user, *, minutes_valid: int = 15):
        """
        Create a new token for the given user, invalidating existing unused ones.

        Returns a tuple of (instance, raw_token) where raw_token is suitable
        for inclusion in an email link.
        """
        cls.objects.filter(user=user, is_used=False).delete()

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_reset_token(raw_token)
        now = timezone.now()
        expires_at = now + timedelta(minutes=minutes_valid)

        instance = cls.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        return instance, raw_token


class UserPasswordHistory(models.Model):
    """
    Stores hashed password history for a user (last N entries) to enforce
    "cannot reuse last 3 passwords" policy.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="password_history_entries",
    )
    password_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_password_history"
        ordering = ["-created_at"]
        verbose_name = "User password history"
        verbose_name_plural = "User password histories"

    def __str__(self):
        return f"Password history for {self.user.email} at {self.created_at}"

