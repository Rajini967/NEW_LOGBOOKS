"""
Utilities for computing log entry time slots from SessionSetting (hourly / shift / daily).
Used to enforce one entry per equipment per slot and prevent duplicates.
"""
from datetime import timedelta
from typing import Tuple, Literal, TypedDict, Optional

from django.utils import timezone

from accounts.models import SessionSetting
from equipment.models import Equipment
from filter_master.models import FilterAssignment, FilterMaster


class SlotStatus(TypedDict):
    slot_start: timezone.datetime
    slot_end: timezone.datetime
    tolerance_end: Optional[timezone.datetime]
    status: Literal["interval", "tolerance", "late"]


def get_slot_range(timestamp, interval, shift_duration_hours):
    """
    Return (slot_start, slot_end) for the given timestamp and interval.

    - timestamp: datetime (timezone-aware preferred; naive is interpreted in current TZ).
    - interval: str, one of 'hourly', 'shift', 'daily'.
    - shift_duration_hours: int, used when interval is 'shift'.

    Returns timezone-aware (slot_start, slot_end) such that any log with
    slot_start <= timestamp < slot_end is in the same slot.
    """
    if timestamp is None:
        timestamp = timezone.now()
    if timezone.is_naive(timestamp):
        timestamp = timezone.make_aware(timestamp, timezone.get_current_timezone())

    interval = (interval or "").strip().lower() or "hourly"
    shift_hours = shift_duration_hours if shift_duration_hours is not None else 8
    if shift_hours < 1:
        shift_hours = 8

    if interval == "hourly":
        slot_start = timestamp.replace(minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(hours=1)
        return slot_start, slot_end

    if interval == "daily":
        slot_start = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(days=1)
        return slot_start, slot_end

    if interval == "shift":
        # Slot start = midnight of the day + (hour // shift_duration_hours) * shift_duration_hours
        day_start = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        shift_index = timestamp.hour // shift_hours
        slot_start = day_start + timedelta(hours=shift_index * shift_hours)
        slot_end = slot_start + timedelta(hours=shift_hours)
        return slot_start, slot_end

    # Fallback to hourly
    slot_start = timestamp.replace(minute=0, second=0, microsecond=0)
    slot_end = slot_start + timedelta(hours=1)
    return slot_start, slot_end


def get_interval_for_equipment(equipment_identifier: str, log_type: str) -> Tuple[str, int]:
    """
    Resolve (interval, shift_hours) for a given equipment identifier.
    Uses Equipment's log_entry_interval if set; otherwise SessionSetting global default.

    - equipment_identifier: equipment_id (equipment_number) for chiller/boiler/filter,
      or equipment_name for chemical (e.g. "C-001 – chemical-1").
    - log_type: one of 'chiller', 'boiler', 'filter', 'chemical'.

    Returns (interval, shift_hours) for use with get_slot_range.
    """
    if not equipment_identifier or not isinstance(equipment_identifier, str):
        setting = SessionSetting.get_solo()
        interval = getattr(setting, "log_entry_interval", None) or "hourly"
        shift_hours = getattr(setting, "shift_duration_hours", None) or 8
        return interval, shift_hours

    identifier = equipment_identifier.strip()
    equipment = None

    if log_type in ("chiller", "boiler"):
        equipment = Equipment.objects.filter(equipment_number=identifier).first()
    elif log_type == "filter":
        # Filter log stores filter_id in equipment_id; resolve via FilterAssignment
        fm = FilterMaster.objects.filter(filter_id=identifier).first()
        if fm:
            assignment = FilterAssignment.objects.filter(filter=fm, is_active=True).select_related("equipment").first()
            if assignment:
                equipment = assignment.equipment
    elif log_type == "chemical":
        # equipment_name may be "C-001 – chemical-1" or "C-001"; try equipment_number first
        part_before_dash = identifier.split(" – ")[0].strip() if " – " in identifier else identifier
        equipment = Equipment.objects.filter(equipment_number=part_before_dash).first()
        if not equipment:
            equipment = Equipment.objects.filter(equipment_number=identifier).first()
        if not equipment:
            equipment = Equipment.objects.filter(name__iexact=identifier).first()

    if equipment and equipment.log_entry_interval:
        interval = equipment.log_entry_interval
        shift_hours = equipment.shift_duration_hours
        if interval == "shift" and (shift_hours is None or shift_hours < 1):
            shift_hours = 8
        elif shift_hours is None:
            shift_hours = 8
        return interval, shift_hours

    setting = SessionSetting.get_solo()
    interval = getattr(setting, "log_entry_interval", None) or "hourly"
    shift_hours = getattr(setting, "shift_duration_hours", None) or 8
    return interval, shift_hours


def get_tolerance_status(save_time, equipment_identifier: str, log_type: str) -> str:
    """
    Return tolerance status for a log entry: 'none' | 'within' | 'outside'.

    Business rule (late focus, interval remains primary):
    - Slot is computed from the log interval as today (existing behaviour).
    - If the log timestamp is inside the slot → 'none' (normal on‑time entry).
    - If tolerance_minutes is configured (>0):
        * From slot_end up to slot_end + tolerance_minutes → 'within' (yellow).
        * After slot_end + tolerance_minutes → 'outside' (red).
    - Entries before slot_start are treated as 'outside'.
    - When tolerance is not configured or log is older than tolerance_enabled_at → 'none'.
    """
    if save_time is None or not equipment_identifier:
        return "none"

    try:
        if log_type in ("chiller", "boiler"):
            equipment = Equipment.objects.filter(equipment_number=equipment_identifier).first()
        elif log_type == "filter":
            fm = FilterMaster.objects.filter(filter_id=equipment_identifier).first()
            equipment = None
            if fm:
                assignment = (
                    FilterAssignment.objects.filter(filter=fm, is_active=True)
                    .select_related("equipment")
                    .first()
                )
                if assignment:
                    equipment = assignment.equipment
        elif log_type == "chemical":
            part_before_dash = (
                equipment_identifier.split(" – ")[0].strip()
                if " – " in equipment_identifier
                else equipment_identifier
            )
            equipment = Equipment.objects.filter(equipment_number=part_before_dash).first()
            if not equipment:
                equipment = Equipment.objects.filter(name__iexact=equipment_identifier).first()
        else:
            equipment = None
    except Exception:
        equipment = None

    if not equipment:
        return "none"

    tol = equipment.tolerance_minutes or 0
    if tol <= 0:
        return "none"

    # Ensure save_time is timezone-aware
    if timezone.is_naive(save_time):
        save_time = timezone.make_aware(save_time, timezone.get_current_timezone())

    # If tolerance_enabled_at is set and log is older than that, treat as 'none'
    if equipment.tolerance_enabled_at and save_time < equipment.tolerance_enabled_at:
        return "none"

    # Reuse compute_slot_status so colouring matches duplicate rules exactly.
    # We need the previous log time for this equipment.
    last_time = None
    try:
        if log_type == "chiller":
            from chiller_logs.models import ChillerLog

            last = (
                ChillerLog.objects.filter(
                    equipment_id=equipment_identifier, timestamp__lt=save_time
                )
                .order_by("-timestamp")
                .first()
            )
            last_time = last.timestamp if last else None
        elif log_type == "boiler":
            from boiler_logs.models import BoilerLog

            last = (
                BoilerLog.objects.filter(
                    equipment_id=equipment_identifier, timestamp__lt=save_time
                )
                .order_by("-timestamp")
                .first()
            )
            last_time = last.timestamp if last else None
        elif log_type == "filter":
            from filter_logs.models import FilterLog

            last = (
                FilterLog.objects.filter(
                    equipment_id=equipment_identifier, timestamp__lt=save_time
                )
                .order_by("-timestamp")
                .first()
            )
            last_time = last.timestamp if last else None
        elif log_type == "chemical":
            from chemical_prep.models import ChemicalPreparation

            last = (
                ChemicalPreparation.objects.filter(
                    equipment_name=equipment_identifier, timestamp__lt=save_time
                )
                .order_by("-timestamp")
                .first()
            )
            last_time = last.timestamp if last else None
    except Exception:
        last_time = None

    slot_info = compute_slot_status(
        equipment_identifier=equipment_identifier,
        log_type=log_type,
        new_time=save_time,
        last_time=last_time,
    )

    status = slot_info.get("status")
    if status == "interval":
        return "none"
    if status == "tolerance":
        return "within"
    return "outside"


def compute_slot_status(
    equipment_identifier: str,
    log_type: str,
    new_time,
    *,
    last_time=None,
) -> SlotStatus:
    """
    Classify a new log timestamp relative to the previous entry for this equipment.

    Returns:
      - slot_start, slot_end: the primary interval window.
      - tolerance_end: end of tolerance window (or None if no tolerance).
      - status: 'interval' | 'tolerance' | 'late'

    Rules (for hourly interval; others fall back to interval-only behaviour):
      - Inside [slot_start, slot_end): status='interval'
      - Inside (slot_end, slot_end + tolerance]: status='tolerance'
      - Else: status='late'
    """
    if timezone.is_naive(new_time):
        new_time = timezone.make_aware(new_time, timezone.get_current_timezone())

    interval, shift_hours = get_interval_for_equipment(equipment_identifier or "", log_type)

    # Non-hourly intervals: keep existing behaviour (slot based on new_time only, no tolerance)
    if interval != "hourly":
        slot_start, slot_end = get_slot_range(new_time, interval, shift_hours)
        return {
            "slot_start": slot_start,
            "slot_end": slot_end,
            "tolerance_end": None,
            "status": "interval",
        }

    # Resolve equipment to read tolerance
    try:
        if log_type in ("chiller", "boiler"):
            equipment = Equipment.objects.filter(equipment_number=equipment_identifier).first()
        elif log_type == "filter":
            fm = FilterMaster.objects.filter(filter_id=equipment_identifier).first()
            equipment = None
            if fm:
                assignment = (
                    FilterAssignment.objects.filter(filter=fm, is_active=True)
                    .select_related("equipment")
                    .first()
                )
                if assignment:
                    equipment = assignment.equipment
        elif log_type == "chemical":
            part_before_dash = (
                equipment_identifier.split(" – ")[0].strip()
                if " – " in equipment_identifier
                else equipment_identifier
            )
            equipment = Equipment.objects.filter(equipment_number=part_before_dash).first()
            if not equipment:
                equipment = Equipment.objects.filter(name__iexact=equipment_identifier).first()
        else:
            equipment = None
    except Exception:
        equipment = None

    tol_minutes = (equipment.tolerance_minutes or 0) if equipment else 0
    tol_delta = timedelta(minutes=tol_minutes) if tol_minutes > 0 else timedelta(0)

    # When there is no previous entry, anchor slot on the new_time itself (hourly rounding)
    if not last_time:
        slot_start = new_time.replace(minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(hours=1)
    else:
        # Next slot is anchored at last entry time
        if timezone.is_naive(last_time):
            last_time = timezone.make_aware(last_time, timezone.get_current_timezone())
        slot_start = last_time
        slot_end = slot_start + timedelta(hours=1)

    # Tolerance window is symmetric around slot_end:
    #   tolerance_start = slot_end - tol_delta
    #   tolerance_end   = slot_end + tol_delta
    tolerance_start = slot_end - tol_delta if tol_minutes > 0 else slot_end
    tolerance_end = slot_end + tol_delta if tol_minutes > 0 else slot_end

    if slot_start <= new_time < tolerance_start:
        status: Literal["interval", "tolerance", "late"] = "interval"
    elif tol_minutes > 0 and tolerance_start <= new_time <= tolerance_end:
        status = "tolerance"
    else:
        status = "late"

    return {
        "slot_start": slot_start,
        "slot_end": slot_end,
        "tolerance_end": tolerance_end if tol_minutes > 0 else None,
        "status": status,
    }
