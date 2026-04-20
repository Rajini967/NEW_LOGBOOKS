"""
Department/equipment data scope for non-admin users.

Admin and Super Admin are not restricted by assignments.
Other roles: if scoped_departments or scoped_equipment is non-empty, APIs return only
data whose equipment lies in the intersection of:
  - equipment in scoped_equipment (if any), and
  - equipment whose department is in scoped_departments (if any).
If both M2Ms are empty, behaviour matches the previous unscoped model (full access subject to role).
"""
from __future__ import annotations

import re
from typing import Optional, Set

from django.db.models import QuerySet

from accounts.models import UserRole


def _scoped_department_ids(user) -> list:
    return list(user.scoped_departments.values_list("pk", flat=True))


def _scoped_equipment_ids(user) -> list:
    return list(user.scoped_equipment.values_list("pk", flat=True))


def should_bypass_equipment_scope(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return True
    return getattr(user, "role", None) in (UserRole.SUPER_ADMIN, UserRole.ADMIN)


def user_has_scope_assignments(user) -> bool:
    """True if scoped M2Ms are non-empty."""
    return bool(_scoped_department_ids(user) or _scoped_equipment_ids(user))


def _scoped_equipment_queryset(user):
    """
    Equipment rows allowed for this user when department/equipment scope applies.
    Returns None when no scope filter should be applied (admin / unscoped users).
    """
    if should_bypass_equipment_scope(user):
        return None
    dept_ids = _scoped_department_ids(user)
    eq_ids = _scoped_equipment_ids(user)
    if not dept_ids and not eq_ids:
        return None

    from equipment.models import Equipment

    qs = Equipment.objects.all()
    if dept_ids:
        qs = qs.filter(department_id__in=dept_ids)
    if eq_ids:
        qs = qs.filter(pk__in=eq_ids)
    return qs


def get_allowed_equipment_pk_strings(user) -> Optional[Set[str]]:
    """
    None  -> no equipment filter (full access for role, or admin).
    set() -> no equipment allowed (empty scope result).
    Otherwise UUID primary key strings only (for ``Equipment.objects.filter(pk__in=...)``).
    """
    qs = _scoped_equipment_queryset(user)
    if qs is None:
        return None
    return {str(x) for x in qs.values_list("pk", flat=True)}


def get_allowed_equipment_id_strings(user) -> Optional[Set[str]]:
    """
    None  -> no equipment filter (full access for role, or admin).
    set() -> no equipment allowed (empty scope result).
    Set of strings -> allowed identifiers for log rows.

    Log models (chiller, boiler, filter, etc.) store ``equipment_id`` as a CharField that
    usually matches ``Equipment.equipment_number``, not always the UUID primary key. Scoped
    users must match using either the PK string or the equipment number.
    """
    qs = _scoped_equipment_queryset(user)
    if qs is None:
        return None
    out: Set[str] = set()
    for pk, eq_num in qs.values_list("pk", "equipment_number"):
        out.add(str(pk))
        if eq_num:
            out.add(str(eq_num).strip())
    return out


def filter_queryset_by_equipment_scope(
    qs: QuerySet,
    user,
    equipment_field: str = "equipment_id",
    *,
    use_equipment_uuid_fk: bool = False,
) -> QuerySet:
    """
    Filter a queryset by scoped equipment.

    Log models use CharField ``equipment_id`` (often equipment_number): use default
    ``use_equipment_uuid_fk=False`` so allowed values include PK and number strings.

    Querysets filtered on ``Equipment`` UUID FK (e.g. ``equipment_id`` on
    ``FilterAssignment``, or ``assignment__equipment_id`` on ``FilterSchedule``) must
    pass ``use_equipment_uuid_fk=True`` so only primary-key strings are used; equipment
    numbers are not valid UUIDs and will error in SQL.
    """
    if use_equipment_uuid_fk:
        allowed = get_allowed_equipment_pk_strings(user)
    else:
        allowed = get_allowed_equipment_id_strings(user)
    if allowed is None:
        return qs
    return qs.filter(**{f"{equipment_field}__in": allowed})


def assert_user_can_access_equipment(user, equipment_id) -> None:
    """Raise PermissionDenied if scoped user cannot use this equipment."""
    from rest_framework.exceptions import PermissionDenied

    allowed = get_allowed_equipment_id_strings(user)
    if allowed is None:
        return
    key = str(equipment_id).strip() if equipment_id is not None else ""
    if not key or key not in allowed:
        raise PermissionDenied("You do not have access to this equipment.")


def resolve_equipment_from_chemical_label(raw: str):
    """
    Map chemical assignment / log ``equipment_name`` to an Equipment row.

    Accepts ``equipment_number``, ``name``, or composite labels such as
    ``NUM – NAME`` / ``NUM - NAME`` (en dash, em dash, or ASCII hyphen), matching
    Chemical Equipment Assignment storage in the UI.
    """
    from equipment.models import Equipment

    text = (raw or "").strip()
    if not text:
        return None
    eq = Equipment.objects.filter(equipment_number__iexact=text).first()
    if eq is None:
        eq = Equipment.objects.filter(name__iexact=text).first()
    if eq is not None:
        return eq

    # Delimiter must be surrounded by whitespace so hyphens inside equipment_number
    # (e.g. "B-SCOPE-01") are not treated as separators (matches assignment UI: "NUM – NAME").
    parts = re.split(r"\s+[-\u2013\u2014]\s+", text.strip(), maxsplit=1)
    if len(parts) != 2:
        return None
    left, right = parts[0].strip(), parts[1].strip()
    if not left or not right:
        return None
    eq = Equipment.objects.filter(
        equipment_number__iexact=left, name__iexact=right
    ).first()
    if eq is not None:
        return eq
    return Equipment.objects.filter(
        equipment_number__iexact=right, name__iexact=left
    ).first()


def assert_user_can_access_equipment_name(user, equipment_name: Optional[str]) -> None:
    """Resolve equipment by equipment_number, name, or composite label (chemical prep) and enforce scope."""
    from rest_framework.exceptions import PermissionDenied

    text = (equipment_name or "").strip()
    if not text:
        return
    allowed = get_allowed_equipment_id_strings(user)
    if allowed is None:
        return
    eq = resolve_equipment_from_chemical_label(text)
    if eq is None or str(eq.pk) not in allowed:
        raise PermissionDenied("You do not have access to this equipment.")


def filter_department_queryset(qs: QuerySet, user) -> QuerySet:
    """Restrict department master list for scoped users."""
    if should_bypass_equipment_scope(user):
        return qs
    dept_ids = _scoped_department_ids(user)
    eq_ids = _scoped_equipment_ids(user)
    if not dept_ids and not eq_ids:
        return qs
    if dept_ids:
        return qs.filter(pk__in=dept_ids)
    from equipment.models import Equipment

    parent_dept_ids = (
        Equipment.objects.filter(pk__in=eq_ids)
        .values_list("department_id", flat=True)
        .distinct()
    )
    return qs.filter(pk__in=list(parent_dept_ids))


def filter_equipment_master_queryset(qs: QuerySet, user) -> QuerySet:
    """Restrict equipment master list for scoped users."""
    if should_bypass_equipment_scope(user):
        return qs
    allowed = get_allowed_equipment_pk_strings(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()
    return qs.filter(pk__in=allowed)


def filter_chemical_preparation_queryset(qs: QuerySet, user) -> QuerySet:
    """
    Chemical prep rows use equipment_name (string). Match against equipment_number and name
    of allowed equipment rows.
    """
    if should_bypass_equipment_scope(user):
        return qs
    pk_allowed = get_allowed_equipment_pk_strings(user)
    if pk_allowed is None:
        return qs
    if not pk_allowed:
        return qs.none()
    from equipment.models import Equipment

    labels: Set[str] = set()
    for row in Equipment.objects.filter(pk__in=pk_allowed).only(
        "equipment_number", "name"
    ):
        num = (row.equipment_number or "").strip()
        nam = (row.name or "").strip()
        if num:
            labels.add(num)
        if nam:
            labels.add(nam)
        if num and nam:
            labels.add(f"{num} – {nam}")
            labels.add(f"{num} - {nam}")
    if not labels:
        return qs.none()
    return qs.filter(equipment_name__in=labels)
