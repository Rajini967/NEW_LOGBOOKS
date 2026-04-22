"""
Serializers for User model.
"""
import json
from datetime import datetime

from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from equipment.models import Department, Equipment

from .models import User, UserRole, PasswordResetToken, hash_reset_token, UserActivityLog, SessionSetting
from .password_utils import check_password_history, append_password_history
from .audit_utils import log_user_activity_event
from reports.utils import log_limit_change


def _can_assign_user_department_equipment(request):
    u = getattr(request, "user", None) if request else None
    return (
        u is not None
        and u.is_authenticated
        and getattr(u, "role", None) in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    )


def _validate_dept_equipment_scope(dept_ids, eq_ids):
    """Ensure every selected equipment belongs to one of the selected departments when both are provided."""
    dept_ids = list(dept_ids or [])
    eq_ids = list(eq_ids or [])
    if not dept_ids or not eq_ids:
        return
    for eq in Equipment.objects.filter(pk__in=eq_ids).only("department_id"):
        if eq.department_id not in dept_ids:
            raise serializers.ValidationError(
                {
                    "equipment_ids": "Each selected equipment must belong to one of the selected departments."
                }
            )


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
    department_ids = serializers.SerializerMethodField(read_only=True)
    equipment_ids = serializers.SerializerMethodField(read_only=True)
    
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
            'department_ids',
            'equipment_ids',
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

    def get_department_ids(self, obj):
        return [str(x) for x in obj.scoped_departments.values_list("pk", flat=True)]

    def get_equipment_ids(self, obj):
        return [str(x) for x in obj.scoped_equipment.values_list("pk", flat=True)]


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating users."""

    department_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    equipment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )

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
            'department_ids',
            'equipment_ids',
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
        return value
    
    def validate(self, attrs):
        """Validate password confirmation."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': "Passwords do not match."
            })
        request = self.context.get("request")
        initial = getattr(self, "initial_data", None) or {}
        if any(k in initial for k in ("department_ids", "equipment_ids")):
            if not _can_assign_user_department_equipment(request):
                raise serializers.ValidationError(
                    {"department_ids": "Only Admin or Super Admin can assign department or equipment."}
                )
        _validate_dept_equipment_scope(
            attrs.get("department_ids") or [],
            attrs.get("equipment_ids") or [],
        )
        return attrs

    def create(self, validated_data):
        """Create user with hashed password."""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        email = validated_data.pop('email')
        dept_ids = validated_data.pop('department_ids', [])
        eq_ids = validated_data.pop('equipment_ids', [])
        user = User.objects.create_user(email=email, password=password, **validated_data)
        user.scoped_departments.set(dept_ids)
        user.scoped_equipment.set(eq_ids)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating users."""

    department_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    equipment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )

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
            'department_ids',
            'equipment_ids',
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        initial = getattr(self, "initial_data", None) or {}
        if any(k in initial for k in ("department_ids", "equipment_ids")):
            if not _can_assign_user_department_equipment(request):
                raise serializers.ValidationError(
                    {"department_ids": "Only Admin or Super Admin can assign department or equipment."}
                )
        inst = getattr(self, "instance", None)
        dept_part = attrs.get("department_ids")
        if dept_part is None and inst is not None:
            dept_part = list(inst.scoped_departments.values_list("pk", flat=True))
        eq_part = attrs.get("equipment_ids")
        if eq_part is None and inst is not None:
            eq_part = list(inst.scoped_equipment.values_list("pk", flat=True))
        if dept_part is not None and eq_part is not None:
            _validate_dept_equipment_scope(dept_part, eq_part)
        return attrs

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
            
            # Prevent downgrading Super Admin
            if user.role == UserRole.SUPER_ADMIN and value != UserRole.SUPER_ADMIN:
                raise serializers.ValidationError(
                    "Cannot change Super Admin role."
                )
        
        return value
    
    def update(self, instance, validated_data):
        """Update user."""
        request = self.context.get("request")
        actor = request.user if request and getattr(request.user, "is_authenticated", False) else None

        old_role = instance.role
        old_dept = {str(x) for x in instance.scoped_departments.values_list("pk", flat=True)}
        old_eq = {str(x) for x in instance.scoped_equipment.values_list("pk", flat=True)}

        dept_ids = validated_data.pop("department_ids", None)
        eq_ids = validated_data.pop("equipment_ids", None)
        ip_address = request.META.get("REMOTE_ADDR") if request else None
        user_agent = request.META.get("HTTP_USER_AGENT", "") if request else None

        password = validated_data.pop('password', None)
        if password:
            check_password_history(
                instance,
                password,
                performed_by=actor,
                ip_address=ip_address,
                user_agent=user_agent or "",
            )
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

        if dept_ids is not None:
            instance.scoped_departments.set(dept_ids)
        if eq_ids is not None:
            instance.scoped_equipment.set(eq_ids)

        if password:
            try:
                log_user_activity_event(
                    "password_changed",
                    instance,
                    performed_by=actor,
                    ip_address=ip_address,
                    user_agent=user_agent or "",
                )
            except Exception:
                pass

        if "role" in validated_data and old_role != instance.role:
            try:
                log_user_activity_event(
                    "role_changed",
                    instance,
                    performed_by=actor,
                    detail=f"role: {old_role} → {instance.role}",
                    ip_address=ip_address,
                    user_agent=user_agent or "",
                )
            except Exception:
                pass

        scope_parts: dict = {}
        if dept_ids is not None:
            new_dept = {str(x) for x in dept_ids}
            if new_dept != old_dept:
                scope_parts["departments"] = {
                    "previous": sorted(old_dept),
                    "current": sorted(new_dept),
                }
        if eq_ids is not None:
            new_eq = {str(x) for x in eq_ids}
            if new_eq != old_eq:
                scope_parts["equipment"] = {
                    "previous": sorted(old_eq),
                    "current": sorted(new_eq),
                }
        if scope_parts:
            try:
                log_user_activity_event(
                    "access_scope_changed",
                    instance,
                    performed_by=actor,
                    detail=json.dumps(scope_parts),
                    ip_address=ip_address,
                    user_agent=user_agent or "",
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
        request = self.context.get("request")
        try:
            check_password_history(
                user,
                new_password,
                performed_by=user,
                ip_address=request.META.get("REMOTE_ADDR") if request else None,
                user_agent=request.META.get("HTTP_USER_AGENT", "") if request else None,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages})
        user.set_password(new_password)
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.is_active = True
        user.save(update_fields=["password", "must_change_password", "password_changed_at", "is_active"])
        append_password_history(user, new_password)

        token_obj.mark_used()

        try:
            log_user_activity_event("password_changed", user)
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
        request = self.context.get("request")
        try:
            check_password_history(
                user,
                attrs["new_password"],
                performed_by=user,
                ip_address=request.META.get("REMOTE_ADDR") if request else None,
                user_agent=request.META.get("HTTP_USER_AGENT", "") if request else None,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages})
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
            request = self.context.get("request")
            log_user_activity_event(
                "password_changed",
                user,
                performed_by=user,
                ip_address=request.META.get("REMOTE_ADDR") if request else None,
                user_agent=request.META.get("HTTP_USER_AGENT", "") if request else None,
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

    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    performed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = UserActivityLog
        fields = [
            "id",
            "user",
            "user_email",
            "user_name",
            "attempted_email",
            "performed_by",
            "performed_by_email",
            "detail",
            "event_type",
            "ip_address",
            "user_agent",
            "created_at",
        ]

    def get_user_email(self, obj):
        if obj.user_id:
            return obj.user.email
        return obj.attempted_email or ""

    def get_user_name(self, obj):
        if obj.user_id:
            return obj.user.name
        return ""

    def get_performed_by_email(self, obj):
        if obj.performed_by_id:
            return obj.performed_by.email
        return ""


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
        user = request.user if request and getattr(request, "user", None) and request.user.is_authenticated else None
        if user:
            instance.updated_by = user

        setting_fields = ("auto_logout_minutes", "password_expiry_days", "log_entry_interval", "shift_duration_hours")
        old_values = {k: getattr(instance, k, None) for k in setting_fields if k in validated_data}

        result = super().update(instance, validated_data)

        for key in validated_data:
            if key not in setting_fields:
                continue
            old_val = old_values.get(key)
            new_val = getattr(instance, key, None)
            if old_val != new_val:
                log_limit_change(
                    user=user,
                    object_type="session_setting",
                    key="1",
                    field_name=key,
                    old=old_val,
                    new=new_val,
                    event_type="config_update",
                )
        return result



