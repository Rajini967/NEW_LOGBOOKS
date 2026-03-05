"""
Views for authentication and user management.
"""
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from django.db import IntegrityError

from .models import User, UserRole, PasswordResetToken, hash_reset_token, UserActivityLog, SessionSetting
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    CustomTokenObtainPairSerializer,
    ForgotPasswordSerializer,
    ValidateResetTokenSerializer,
    ResetPasswordSerializer,
    UserReportSerializer,
    UserActivityLogSerializer,
    SessionSettingSerializer,
)
from .permissions import (
    CanCreateUsers,
    CanManageUsers,
)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom JWT login view.
    Returns access and refresh tokens.
    Uses email instead of username.
    """
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            return Response(
                {'error': 'Invalid credentials. Please check your email and password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        user = serializer.user
        if not user.is_active or user.is_deleted:
            return Response(
                {'error': 'User account is inactive or deleted.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Log successful manual login
        try:
            ip_address = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            UserActivityLog.objects.create(
                user=user,
                event_type="manual_login",
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            # Logging should not block login if it fails
            pass
        
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class CustomTokenRefreshView(TokenRefreshView):
    """Custom JWT refresh view."""
    permission_classes = [AllowAny]
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            return Response(
                {'error': 'Invalid or expired refresh token.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    JWT logout view with token blacklisting.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """Blacklist the refresh token."""
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'error': 'Refresh token is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            token = RefreshToken(refresh_token)
            token.blacklist()

            # Determine logout event type (manual vs auto)
            event_type = "manual_logout"
            reason = request.query_params.get("reason")
            if reason == "auto":
                event_type = "auto_logout"

            try:
                ip_address = request.META.get("REMOTE_ADDR")
                user_agent = request.META.get("HTTP_USER_AGENT", "")
                UserActivityLog.objects.create(
                    user=request.user,
                    event_type=event_type,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            except Exception:
                # Do not block logout if logging fails
                pass
            
            return Response(
                {'message': 'Successfully logged out.'},
                status=status.HTTP_200_OK
            )
        except TokenError:
            return Response(
                {'error': 'Invalid refresh token.'},
                status=status.HTTP_400_BAD_REQUEST
            )


class ForgotPasswordView(APIView):
    """
    Initiate password reset via email.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.get_user_for_email()

        if user:
            token_obj, raw_token = PasswordResetToken.create_for_user(user)
            reset_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={raw_token}"

            subject = "Reset your LogBook account password"
            message = (
                "You (or someone else) requested a password reset for your LogBook account.\n\n"
                f"To set a new password, open the link below in your browser:\n\n{reset_url}\n\n"
                "This link will expire in 15 minutes and can be used only once.\n\n"
                "If you did not request this, you can safely ignore this email."
            )

            send_mail(
                subject=subject,
                message=message,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                recipient_list=[user.email],
                fail_silently=True,
            )

        # Always respond with a generic message to avoid revealing if the email exists.
        return Response(
            {
                "message": "If the email exists, a reset link has been sent."
            },
            status=status.HTTP_200_OK,
        )


class ValidateResetTokenView(APIView):
    """
    Validate that a password reset token is still valid.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ValidateResetTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"valid": True}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    """
    Reset password using a valid token.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Blacklist all outstanding refresh tokens for this user.
        for token in OutstandingToken.objects.filter(user=user):
            try:
                BlacklistedToken.objects.get_or_create(token=token)
            except Exception:
                # If a token is already blacklisted or another error occurs, continue.
                continue

        return Response(
            {"message": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )
class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for User CRUD operations.
    """
    queryset = User.objects.filter(is_deleted=False)
    permission_classes = [IsAuthenticated, CanManageUsers]
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer
    
    def get_permissions(self):
        """Override permissions for create action."""
        if self.action == 'create':
            return [IsAuthenticated(), CanCreateUsers()]
        return super().get_permissions()
    
    def get_queryset(self):
        """Filter queryset based on user role."""
        user = self.request.user
        
        # Super Admin can see all users
        if user.role == UserRole.SUPER_ADMIN:
            return User.objects.filter(is_deleted=False)
        
        # Manager can see Supervisor, Operator, Client (not Super Admin or Manager)
        if user.role == UserRole.MANAGER:
            return User.objects.filter(
                is_deleted=False,
                role__in=[UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.CLIENT]
            )
        
        # Others cannot list users
        return User.objects.none()
    
    def create(self, request, *args, **kwargs):
        """Create a new user."""
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        try:
            user = serializer.save()
        except IntegrityError as e:
            # Handle database-level unique constraint violations
            error_message = str(e)
            if 'email' in error_message.lower() or 'users_email_key' in error_message:
                # Check if it's a soft-deleted user
                email = request.data.get('email')
                if email:
                    try:
                        existing_user = User.all_objects.get(email=email)
                        if existing_user.is_deleted:
                            error_msg = (
                                f"A user with this email already exists but is soft-deleted. "
                                f"Please restore the existing user or use a different email."
                            )
                        else:
                            error_msg = "A user with this email already exists."
                    except User.DoesNotExist:
                        error_msg = "A user with this email already exists."
                else:
                    error_msg = "A user with this email already exists."
                
                return Response(
                    {
                        'email': [error_msg]
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Re-raise if it's not an email-related error
            raise
        
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED
        )
    
    def update(self, request, *args, **kwargs):
        """Update a user."""
        instance = self.get_object()
        
        # Check object-level permissions
        if not request.user.role == UserRole.SUPER_ADMIN:
            if instance.role == UserRole.SUPER_ADMIN:
                return Response(
                    {'error': 'Cannot modify Super Admin user.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            if instance.role == UserRole.MANAGER and request.user.role == UserRole.MANAGER:
                return Response(
                    {'error': 'Managers cannot modify other Manager users.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.context['request'] = request
        serializer.save()
        
        return Response(UserSerializer(instance).data)
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete a user."""
        instance = self.get_object()
        
        # Prevent self-deletion
        if instance.id == request.user.id:
            return Response(
                {'error': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Prevent deleting Super Admin
        if instance.role == UserRole.SUPER_ADMIN:
            return Response(
                {'error': 'Cannot delete Super Admin user.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check permissions
        if not request.user.role == UserRole.SUPER_ADMIN:
            if instance.role == UserRole.MANAGER:
                return Response(
                    {'error': 'Managers cannot delete other Manager users.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Soft delete
        instance.soft_delete()
        
        return Response(
            {'message': 'User deleted successfully.'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Get current user information."""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class UserReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset exposing basic user information for reporting.
    """

    serializer_class = UserReportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ["email", "name", "role"]

    def get_serializer_context(self):
        """
        Extend serializer context with optional activity_date used for
        computing per-day first login and last logout.
        """
        context = super().get_serializer_context()
        activity_date = self.request.query_params.get("activity_date")
        if activity_date:
            context["activity_date"] = activity_date
        return context

    def get_queryset(self):
        user = self.request.user

        # Super Admin can see all active, non-deleted users
        if user.role == UserRole.SUPER_ADMIN:
            qs = User.all_objects.filter(is_deleted=False)
        # Manager/Admin should see Admin, Supervisor, Operator, Client
        elif user.role == UserRole.MANAGER:
            qs = User.all_objects.filter(
                is_deleted=False,
                role__in=[
                    UserRole.MANAGER,
                    UserRole.SUPERVISOR,
                    UserRole.OPERATOR,
                    UserRole.CLIENT,
                ],
            )
        # Supervisor can see Admin, Supervisor, Operator, Client for reporting
        elif user.role == UserRole.SUPERVISOR:
            qs = User.all_objects.filter(
                is_deleted=False,
                role__in=[
                    UserRole.MANAGER,
                    UserRole.SUPERVISOR,
                    UserRole.OPERATOR,
                    UserRole.CLIENT,
                ],
            )
        else:
            return User.objects.none()

        # Optional filtering by role/active via query params
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        return qs.order_by("-created_at")


class UserActivityReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for user login/logout activity reports.
    """

    serializer_class = UserActivityLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user

        # Supervisors, Managers(Admin), and Super Admin can see activity
        if user.role not in [UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
            return UserActivityLog.objects.none()

        # Exclude Super Admin activity from the report
        qs = UserActivityLog.objects.select_related("user").exclude(
            user__role=UserRole.SUPER_ADMIN
        )

        # Filters
        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")
        user_id = self.request.query_params.get("user")
        event_type = self.request.query_params.get("event_type")

        if from_date:
            qs = qs.filter(created_at__date__gte=from_date)
        if to_date:
            qs = qs.filter(created_at__date__lte=to_date)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if event_type:
            qs = qs.filter(event_type=event_type)

        return qs.order_by("-created_at")


class SessionSettingsView(APIView):
    """
    API for retrieving and updating session/auto-logout configuration.

    - GET: any authenticated user can read current settings.
    - PATCH: only Super Admin and Admin (Manager) can update.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        setting = SessionSetting.get_solo()
        serializer = SessionSettingSerializer(setting)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
            return Response(
                {"detail": "You do not have permission to update session settings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        setting = SessionSetting.get_solo()
        serializer = SessionSettingSerializer(
            setting, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

