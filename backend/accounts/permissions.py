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


class IsManager(permissions.BasePermission):
    """Permission check for Manager role."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == UserRole.MANAGER
        )


class IsSuperAdminOrManager(permissions.BasePermission):
    """Permission check for Super Admin or Manager roles."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.MANAGER]
        )


class CanCreateUsers(permissions.BasePermission):
    """Permission to create users (Super Admin and Manager only)."""
    
    def has_permission(self, request, view):
        if request.method != 'POST':
            return True
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.MANAGER]
        )


class CanManageUsers(permissions.BasePermission):
    """
    Permission to manage users.
    Super Admin can manage all users.
    Manager can manage Supervisor, Operator, Client (not Super Admin or Manager).
    """
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Super Admin can do everything
        if request.user.role == UserRole.SUPER_ADMIN:
            return True
        
        # Manager can manage non-admin users
        if request.user.role == UserRole.MANAGER:
            return True
        
        return False
    
    def has_object_permission(self, request, view, obj):
        """Check if user can manage a specific user object."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Super Admin can manage everyone
        if request.user.role == UserRole.SUPER_ADMIN:
            return True
        
        # Manager can manage Supervisor, Operator, Client
        # Cannot manage Super Admin or other Managers
        if request.user.role == UserRole.MANAGER:
            if obj.role in [UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.CLIENT]:
                return True
            return False
        
        # Others cannot manage users
        return False


class CanApproveReports(permissions.BasePermission):
    """Permission to approve reports (Super Admin, Manager, Supervisor)."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.MANAGER,
                UserRole.SUPERVISOR
            ]
        )


class CanLogEntries(permissions.BasePermission):
    """Permission to log entries (Super Admin, Admin/Manager, Supervisor, Operator)."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.MANAGER,
                UserRole.SUPERVISOR,
                UserRole.OPERATOR
            ]
        )


class CanViewReports(permissions.BasePermission):
    """Permission to view reports (all roles, but Client only sees approved)."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated
        )


class IsManagerOrSuperAdmin(permissions.BasePermission):
    """Permission check for Manager or Super Admin roles."""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [UserRole.SUPER_ADMIN, UserRole.MANAGER]
        )

