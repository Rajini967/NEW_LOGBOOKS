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
    UserViewSet,
    UserReportViewSet,
    UserActivityReportViewSet,
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
    
    # User management endpoints (via router)
    path('', include(router.urls)),
]

