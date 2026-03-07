"""
Utilities for computing log entry time slots from SessionSetting (hourly / shift / daily).
Used to enforce one entry per equipment per slot and prevent duplicates.
"""
from datetime import timedelta

from django.utils import timezone


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
