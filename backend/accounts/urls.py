"""
URL configuration for accounts app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    LogoutView,
    ForgotPasswordView,
    ValidateResetTokenView,
    ResetPasswordView,
    ChangePasswordView,
    UserViewSet,
    UserReportViewSet,
    UserActivityReportViewSet,
    SessionSettingsView,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'reports/users', UserReportViewSet, basename='user-report')
router.register(r'reports/user-activity', UserActivityReportViewSet, basename='user-activity-report')

urlpatterns = [
    # Authentication endpoints
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='auth_forgot_password'),
    path('auth/validate-reset-token/', ValidateResetTokenView.as_view(), name='auth_validate_reset_token'),
    path('auth/reset-password/', ResetPasswordView.as_view(), name='auth_reset_password'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='auth_change_password'),
    
    # Session / activity settings
    path('settings/session/', SessionSettingsView.as_view(), name='session_settings'),
    
    # User management endpoints (via router)
    path('', include(router.urls)),
]

