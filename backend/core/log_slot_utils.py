"""
Utilities for computing log entry time slots from SessionSetting (hourly / shift / daily).
Used to enforce one entry per equipment per slot and prevent duplicates.
"""
from datetime import timedelta
from typing import Tuple

from django.utils import timezone

from accounts.models import SessionSetting
from equipment.models import Equipment
from filter_master.models import FilterAssignment, FilterMaster


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
