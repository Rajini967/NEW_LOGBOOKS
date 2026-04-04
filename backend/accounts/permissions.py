"""
Custom permission classes for role-based access control.
"""
from rest_framework import permissions

from .models import UserRole


def forbid_manager_rejecting_reading(request, action_type):
    """
    No-op: kept so approve endpoints can call a single hook.
    Managers may reject readings like other approver roles (same rules as approve: not own entry).
    """
    return


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
    """Permission to approve or reject readings (Super Admin, Admin, Supervisor, Manager)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.ADMIN,
                UserRole.SUPERVISOR,
                UserRole.MANAGER,
            ]
        )


class CanLogEntries(permissions.BasePermission):
    """Permission to create/update log entries (all roles that enter readings, including Manager)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in [
                UserRole.SUPER_ADMIN,
                UserRole.ADMIN,
                UserRole.SUPERVISOR,
                UserRole.MANAGER,
                UserRole.OPERATOR,
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


class CanAccessEquipmentMasterData(permissions.BasePermission):
    """
    Create/update equipment master rows (departments, categories, equipment, corrections).
    Supervisor, Manager, Admin, Super Admin per privilege matrix (rows 6–9, 12).
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [
                UserRole.SUPERVISOR,
                UserRole.MANAGER,
                UserRole.ADMIN,
                UserRole.SUPER_ADMIN,
            ]
        )


class CanApproveEquipmentMaster(permissions.BasePermission):
    """
    Approve/reject equipment list entries — Manager, Admin, Super Admin (not Supervisor).
    Rows 10–11.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        )


class CanDeleteEquipmentMaster(permissions.BasePermission):
    """Delete departments, categories, or equipment — Admin and Super Admin only. Row 13."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
        )


class CanManageChemicalInventory(permissions.BasePermission):
    """Chemical stock and assignment CRUD (excluding assignment approval). Rows 29–30."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [
                UserRole.SUPERVISOR,
                UserRole.MANAGER,
                UserRole.ADMIN,
                UserRole.SUPER_ADMIN,
            ]
        )


class CanApproveChemicalAssignment(permissions.BasePermission):
    """Approve/reject chemical equipment assignment. Row 31 — not Supervisor."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        )


class CanManageFilterConfiguration(permissions.BasePermission):
    """Filter categories, register mutations, assignments, schedule CRUD (not schedule approval). Rows 32–33, 35–36."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [
                UserRole.SUPERVISOR,
                UserRole.MANAGER,
                UserRole.ADMIN,
                UserRole.SUPER_ADMIN,
            ]
        )


class CanApproveFilterRegister(permissions.BasePermission):
    """Approve/reject filter register (FilterMaster). Manager+."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        )


class CanApproveFilterSchedule(permissions.BasePermission):
    """Approve/reject filter schedules. Row 34."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            in [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        )
