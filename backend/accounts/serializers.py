"""
Serializers for User model.
"""
from datetime import datetime

from django.utils import timezone
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User, UserRole, PasswordResetToken, hash_reset_token, UserActivityLog, SessionSetting
from .password_utils import check_password_history, append_password_history
from .audit_utils import log_user_audit_event


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom token serializer that uses email instead of username."""
    
    username_field = 'email'
    
    def validate(self, attrs):
        """Validate and return user with email authentication."""
        # Change 'username' to 'email' in attrs
        if 'username' in attrs:
            attrs['email'] = attrs.pop('username')
        
        data = super().validate(attrs)
        return data


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model (read operations)."""
    
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    is_locked = serializers.SerializerMethodField(read_only=True)
    password_expired = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'name',
            'role',
            'role_display',
            'is_active',
            'is_staff',
            'is_superuser',
            'is_deleted',
            'is_locked',
            'locked_until',
            'must_change_password',
            'password_changed_at',
            'password_expired',
            'last_login',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'last_login',
            'created_at',
            'updated_at',
            'is_deleted',
            'locked_until',
            'must_change_password',
            'password_changed_at',
        ]
    
    def get_is_locked(self, obj):
        return obj.is_locked()
    
    def get_password_expired(self, obj):
        if not getattr(obj, "password_changed_at", None):
            return False
        from .models import SessionSetting
        setting = SessionSetting.get_solo()
        expiry_days = getattr(setting, "password_expiry_days", None)
        if not expiry_days or expiry_days <= 0:
            return False
        from datetime import timedelta
        return timezone.now() - obj.password_changed_at > timedelta(days=expiry_days)


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating users."""
    
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    
    class Meta:
        model = User
        fields = [
            'email',
            'name',
            'password',
            'password_confirm',
            'role',
            'is_active',
        ]
    
    def validate_email(self, value):
        """Validate email uniqueness."""
        # Check both active and soft-deleted users since email has unique constraint
        if User.all_objects.filter(email=value).exists():
            existing_user = User.all_objects.get(email=value)
            if existing_user.is_deleted:
                raise serializers.ValidationError(
                    f"A user with this email already exists but is soft-deleted. "
                    f"Please restore the existing user (ID: {existing_user.id}) or use a different email."
                )
            else:
                raise serializers.ValidationError("A user with this email already exists.")
        return value
    
    def validate_role(self, value):
        """Validate role assignment."""
        request = self.context.get('request')
        if request and request.user:
            # Prevent privilege escalation
            if value == UserRole.SUPER_ADMIN and request.user.role != UserRole.SUPER_ADMIN:
                raise serializers.ValidationError(
                    "Only Super Admin can create Super Admin users."
                )
            if value == UserRole.MANAGER and request.user.role == UserRole.MANAGER:
                raise serializers.ValidationError(
                    "Managers cannot create other Manager users."
                )
        return value
    
    def validate(self, attrs):
        """Validate password confirmation."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': "Passwords do not match."
            })
        return attrs
    
    def create(self, validated_data):
        """Create user with hashed password."""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        email = validated_data.pop('email')
        user = User.objects.create_user(email=email, password=password, **validated_data)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating users."""
    
    password = serializers.CharField(
        write_only=True,
        required=False,
        validators=[validate_password],
        style={'input_type': 'password'},
        allow_null=True
    )
    
    class Meta:
        model = User
        fields = [
            'email',
            'name',
            'password',
            'role',
            'is_active',
        ]
    
    def validate_email(self, value):
        """Validate email uniqueness (excluding current user)."""
        user = self.instance
        # Only validate uniqueness if email is being changed
        if user and user.email != value:
            if User.objects.filter(email=value, is_deleted=False).exclude(id=user.id).exists():
                raise serializers.ValidationError("A user with this email already exists.")
        return value
    
    def validate_role(self, value):
        """Validate role assignment and prevent privilege escalation."""
        request = self.context.get('request')
        user = self.instance
        
        if request and request.user:
            # Prevent users from elevating their own role
            if user.id == request.user.id:
                raise serializers.ValidationError(
                    "You cannot change your own role."
                )
            
            # Prevent privilege escalation
            if value == UserRole.SUPER_ADMIN and request.user.role != UserRole.SUPER_ADMIN:
                raise serializers.ValidationError(
                    "Only Super Admin can assign Super Admin role."
                )
            
            # Managers cannot assign Manager role
            if value == UserRole.MANAGER and request.user.role == UserRole.MANAGER:
                raise serializers.ValidationError(
                    "Managers cannot assign Manager role to other users."
                )
            
            # Prevent downgrading Super Admin
            if user.role == UserRole.SUPER_ADMIN and value != UserRole.SUPER_ADMIN:
                raise serializers.ValidationError(
                    "Cannot change Super Admin role."
                )
        
        return value
    
    def update(self, instance, validated_data):
        """Update user."""
        password = validated_data.pop('password', None)
        if password:
            check_password_history(instance, password)
            instance.set_password(password)
            instance.must_change_password = True
            instance.password_changed_at = timezone.now()
            append_password_history(instance, password)

        # Only update fields that have changed
        for attr, value in validated_data.items():
            # Skip email if it hasn't changed to avoid unnecessary database updates
            if attr == 'email' and instance.email == value:
                continue
            setattr(instance, attr, value)

        instance.save()

        if password:
            request = self.context.get('request')
            try:
                log_user_audit_event(
                    "password_changed",
                    instance,
                    actor=request.user if request else None,
                    old_value="[Redacted]",
                    new_value="[Redacted]",
                    field_name="password",
                )
            except Exception:
                pass

        return instance


class ForgotPasswordSerializer(serializers.Serializer):
    """
    Serializer for initiating a password reset by email.
    """

    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        # Normalize, but do not reveal whether the email exists.
        return value.strip().lower()

    def get_user_for_email(self):
        email = self.validated_data.get("email")
        try:
            # Use all_objects to respect soft-delete rules but filter them out.
            return User.all_objects.get(email=email, is_deleted=False, is_active=True)
        except User.DoesNotExist:
            return None


class _BaseTokenSerializer(serializers.Serializer):
    token = serializers.CharField()

    def _get_token_obj(self, raw_token: str) -> PasswordResetToken:
        token_hash = hash_reset_token(raw_token)
        now: datetime = timezone.now()

        try:
            token_obj = PasswordResetToken.objects.select_related("user").get(
                token_hash=token_hash,
                is_used=False,
                expires_at__gt=now,
            )
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError({"token": "Invalid or expired token."})

        return token_obj


class ValidateResetTokenSerializer(_BaseTokenSerializer):
    """
    Serializer used to validate that a reset token is still valid.
    """

    def validate(self, attrs):
        # Will raise if invalid
        raw_token = attrs.get("token", "")
        self.token_obj = self._get_token_obj(raw_token)
        return attrs


class ResetPasswordSerializer(_BaseTokenSerializer):
    """
    Serializer used to perform a password reset given a token.
    """

    new_password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={"input_type": "password"},
    )
    confirm_password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    def validate(self, attrs):
        if attrs.get("new_password") != attrs.get("confirm_password"):
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )

        # Will raise if token invalid/expired/used.
        raw_token = attrs.get("token", "")
        self.token_obj = self._get_token_obj(raw_token)
        return attrs

    def save(self, **kwargs):
        token_obj: PasswordResetToken = getattr(self, "token_obj")
        user = token_obj.user

        new_password = self.validated_data["new_password"]
        check_password_history(user, new_password)
        user.set_password(new_password)
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.is_active = True
        user.save(update_fields=["password", "must_change_password", "password_changed_at", "is_active"])
        append_password_history(user, new_password)

        token_obj.mark_used()

        try:
            log_user_audit_event(
                "password_changed",
                user,
                actor=None,
                old_value="[Redacted]",
                new_value="[Redacted]",
                field_name="password",
            )
        except Exception:
            pass

        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for authenticated user changing their own password."""

    current_password = serializers.CharField(write_only=True, required=True, style={"input_type": "password"})
    new_password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={"input_type": "password"},
    )
    new_password_confirm = serializers.CharField(write_only=True, required=True, style={"input_type": "password"})

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Passwords do not match."})
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        check_password_history(user, attrs["new_password"])
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        new_password = self.validated_data["new_password"]
        user.set_password(new_password)
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        append_password_history(user, new_password)
        try:
            log_user_audit_event(
                "password_changed",
                user,
                actor=self.context.get("request").user if self.context.get("request") else None,
                old_value="[Redacted]",
                new_value="[Redacted]",
                field_name="password",
            )
        except Exception:
            pass
        return user


class UserReportSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for user management reports.
    """

    role_display = serializers.CharField(source="get_role_display", read_only=True)
    first_login = serializers.SerializerMethodField(read_only=True)
    last_logout = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "role",
            "role_display",
            "is_active",
            "created_at",
            "last_login",
            "first_login",
            "last_logout",
        ]
        read_only_fields = fields

    def _get_target_date(self):
        """
        Resolve the target date for activity aggregation from context,
        defaulting to today's local date when not provided or invalid.
        """
        activity_date_str = self.context.get("activity_date")
        if activity_date_str:
            try:
                return datetime.fromisoformat(activity_date_str).date()
            except ValueError:
                pass
        return timezone.localdate()

    def get_first_login(self, obj):
        """
        Return the first login event timestamp for the target date for this user, if any.
        """
        target_date = self._get_target_date()
        qs = (
            UserActivityLog.objects.filter(
                user=obj,
                event_type__in=["login", "manual_login"],
                created_at__date=target_date,
            )
            .order_by("created_at")
            .first()
        )
        return qs.created_at if qs else None

    def get_last_logout(self, obj):
        """
        Return the last logout event timestamp for the target date for this user, if any.
        """
        target_date = self._get_target_date()
        qs = (
            UserActivityLog.objects.filter(
                user=obj,
                event_type__in=["logout", "manual_logout", "auto_logout"],
                created_at__date=target_date,
            )
            .order_by("-created_at")
            .first()
        )
        return qs.created_at if qs else None


class UserActivityLogSerializer(serializers.ModelSerializer):
    """
    Serializer for user activity reporting.
    """

    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)

    class Meta:
        model = UserActivityLog
        fields = [
            "id",
            "user",
            "user_email",
            "user_name",
            "event_type",
            "ip_address",
            "user_agent",
            "created_at",
        ]


class SessionSettingSerializer(serializers.ModelSerializer):
    """
    Serializer for session/auto-logout and log entry interval configuration.
    """

    class Meta:
        model = SessionSetting
        fields = [
            "auto_logout_minutes",
            "password_expiry_days",
            "log_entry_interval",
            "shift_duration_hours",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        log_entry_interval = attrs.get("log_entry_interval")
        shift_duration_hours = attrs.get("shift_duration_hours")
        if log_entry_interval == "shift":
            hours = shift_duration_hours
            if hours is None:
                hours = getattr(self.instance, "shift_duration_hours", 8) if self.instance else 8
            if hours is not None and (hours < 1 or hours > 24):
                raise serializers.ValidationError(
                    {"shift_duration_hours": "Shift duration must be between 1 and 24 hours when interval is 'shift'."}
                )
        return attrs

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            instance.updated_by = request.user
        return super().update(instance, validated_data)



