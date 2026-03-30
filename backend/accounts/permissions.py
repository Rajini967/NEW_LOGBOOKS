"""
Custom permission classes for role-based access control.
"""
from rest_framework import permissions
from .models import UserRole


class IsSuperAdmin(permissions.BasePermission):
    """Permission check for Super Admin role."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == UserRole.SUPER_ADMIN
        )


class IsAdmin(permissions.BasePermission):
    """Permission check for Admin role."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == UserRole.ADMIN
        )


class IsSuperAdminOrAdmin(permissions.BasePermission):
    """Permission check for Super Admin or Admin roles."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]
        )


class CanCreateUsers(permissions.BasePermission):
    """Permission to create users (Super Admin and Admin only)."""

    def has_permission(self, request, view):
        if request.method != 'POST':
            return True
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]
        )


class CanManageUsers(permissions.BasePermission):
    """
    Permission to manage users.
    Super Admin can manage all users.
    Admin can manage Supervisor, Operator, Manager (not Super Admin or other Admins).
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == UserRole.SUPER_ADMIN:
            return True

        if request.user.role == UserRole.ADMIN:
            return True

        return False

    def has_object_permission(self, request, view, obj):
        """Check if user can manage a specific user object."""
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.role == UserRole.SUPER_ADMIN:
            return True

        if request.user.role == UserRole.ADMIN:
            if obj.role in [
                UserRole.ADMIN,
                UserRole.SUPERVISOR,
                UserRole.OPERATOR,
                UserRole.MANAGER,
            ]:
                return True
            return False

        return False


class CanApproveReports(permissions.BasePermission):
    """Permission to approve reports (Super Admin, Admin, Supervisor)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.ADMIN,
                UserRole.SUPERVISOR
            ]
        )


class CanLogEntries(permissions.BasePermission):
    """Permission to log entries (Super Admin, Admin, Supervisor, Operator)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.ADMIN,
                UserRole.SUPERVISOR,
                UserRole.OPERATOR
            ]
        )


class CanViewReports(permissions.BasePermission):
    """Permission to view reports (all roles; Manager role has type-limited list in ReportViewSet)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated
        )


class IsAdminOrSuperAdmin(permissions.BasePermission):
    """Permission check for Admin or Super Admin roles."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]
        )
