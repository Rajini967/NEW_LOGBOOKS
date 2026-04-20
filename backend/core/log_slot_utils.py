"""
Utilities for computing log entry time slots from SessionSetting (hourly / shift / daily).
Used to enforce one entry per equipment per slot and prevent duplicates.
"""
import uuid
from datetime import timedelta, datetime, time
from typing import Tuple, Literal, TypedDict, Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.conf import settings

from accounts.models import SessionSetting
from equipment.models import Equipment
from filter_master.models import FilterAssignment, FilterMaster


class SlotStatus(TypedDict):
    slot_start: timezone.datetime
    slot_end: timezone.datetime
    tolerance_end: Optional[timezone.datetime]
    status: Literal["interval", "tolerance", "late"]


class DaySlot(TypedDict):
    slot_index: int
    slot_start: timezone.datetime
    slot_end: timezone.datetime
    slot_key: str


def get_slot_timezone():
    """
    Operational timezone used for slot/day calculations.
    Uses LOG_SLOT_TIMEZONE if present; otherwise TIME_ZONE; falls back to Asia/Kolkata.
    """
    explicit_slot_tz = getattr(settings, "LOG_SLOT_TIMEZONE", None)
    if explicit_slot_tz:
        tz_name = explicit_slot_tz
    else:
        base_tz = getattr(settings, "TIME_ZONE", None) or "Asia/Kolkata"
        # If project timezone is UTC, keep slot scheduling in IST by default
        # to match pharma shift/hourly operational usage and UI expectations.
        tz_name = "Asia/Kolkata" if str(base_tz).upper() == "UTC" else base_tz
    try:
        return ZoneInfo(str(tz_name))
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def get_slot_day_bounds(day_value):
    """
    Return timezone-aware (day_start, day_end) in slot timezone for a given date/datetime.
    """
    if isinstance(day_value, datetime):
        day = day_value.date()
    else:
        day = day_value
    tz = get_slot_timezone()
    day_start = timezone.make_aware(datetime.combine(day, time.min), tz)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def _resolve_equipment_for_filter_log_identifier(identifier: str):
    """
    FilterLog.equipment_id may store Equipment.id (UUID) from the assignment UI,
    or legacy filter_id (e.g. FMT-0001).
    """
    if not identifier or not isinstance(identifier, str):
        return None
    identifier = identifier.strip()
    # UUIDField rejects non-UUID strings (e.g. legacy filter_id "FMT-0001") at query prep time.
    try:
        pk = uuid.UUID(identifier)
        eq = Equipment.objects.filter(pk=pk).first()
        if eq:
            return eq
    except (ValueError, TypeError, AttributeError):
        pass
    fm = FilterMaster.objects.filter(filter_id=identifier).first()
    if fm:
        assignment = (
            FilterAssignment.objects.filter(filter=fm, is_active=True)
            .select_related("equipment")
            .first()
        )
        if assignment:
            return assignment.equipment
    return None


def normalize_equipment_identifier(equipment_identifier: Optional[str], log_type: Optional[str] = None) -> str:
    """
    Normalize identifier values used across log apps before lookup.
    """
    if not equipment_identifier or not isinstance(equipment_identifier, str):
        return ""
    normalized = equipment_identifier.strip()
    if log_type == "chemical" and " – " in normalized:
        normalized = normalized.split(" – ")[0].strip()
    return normalized


def _resolve_equipment_for_log_type(equipment_identifier: str, log_type: str):
    if not equipment_identifier or not isinstance(equipment_identifier, str):
        return None
    identifier = normalize_equipment_identifier(equipment_identifier, log_type)
    if not identifier:
        return None
    equipment = None
    if log_type in ("chiller", "boiler", "briquette"):
        equipment = Equipment.objects.filter(equipment_number=identifier).first()
    elif log_type == "filter":
        equipment = _resolve_equipment_for_filter_log_identifier(identifier)
    elif log_type == "chemical":
        part_before_dash = normalize_equipment_identifier(identifier, "chemical")
        equipment = Equipment.objects.filter(equipment_number=part_before_dash).first()
        if not equipment:
            equipment = Equipment.objects.filter(equipment_number=identifier).first()
        if not equipment:
            equipment = Equipment.objects.filter(name__iexact=identifier).first()
    return equipment


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


def build_expected_slots_for_day(
    day_value,
    interval: str,
    shift_duration_hours: Optional[int] = None,
) -> List[DaySlot]:
    """
    Build deterministic expected slots for one local day.
    """
    day_start, _ = get_slot_day_bounds(day_value)
    normalized_interval = (interval or "").strip().lower() or "hourly"
    shift_hours = shift_duration_hours if shift_duration_hours is not None else 8
    if shift_hours < 1:
        shift_hours = 8

    slots: List[DaySlot] = []
    if normalized_interval == "daily":
        slot_start = day_start
        slot_end = day_start + timedelta(days=1)
        slots.append(
            {
                "slot_index": 0,
                "slot_start": slot_start,
                "slot_end": slot_end,
                "slot_key": f"{slot_start.isoformat()}|{slot_end.isoformat()}",
            }
        )
        return slots

    if normalized_interval == "shift":
        total_slots = max(1, (24 + shift_hours - 1) // shift_hours)
        for idx in range(total_slots):
            slot_start = day_start + timedelta(hours=idx * shift_hours)
            slot_end = min(day_start + timedelta(days=1), slot_start + timedelta(hours=shift_hours))
            slots.append(
                {
                    "slot_index": idx,
                    "slot_start": slot_start,
                    "slot_end": slot_end,
                    "slot_key": f"{slot_start.isoformat()}|{slot_end.isoformat()}",
                }
            )
        return slots

    # hourly default
    for idx in range(24):
        slot_start = day_start + timedelta(hours=idx)
        slot_end = slot_start + timedelta(hours=1)
        slots.append(
            {
                "slot_index": idx,
                "slot_start": slot_start,
                "slot_end": slot_end,
                "slot_key": f"{slot_start.isoformat()}|{slot_end.isoformat()}",
            }
        )
    return slots


def map_timestamp_to_slot_key(
    value,
    interval: str,
    shift_duration_hours: Optional[int] = None,
) -> Optional[str]:
    if value is None:
        return None
    slot_tz = get_slot_timezone()
    ts = value
    if timezone.is_naive(ts):
        ts = timezone.make_aware(ts, slot_tz)
    ts = timezone.localtime(ts, slot_tz)
    slot_start, slot_end = get_slot_range(ts, interval, shift_duration_hours)
    return f"{slot_start.isoformat()}|{slot_end.isoformat()}"


def compute_missing_slots_for_day(
    day_value,
    timestamps: List[timezone.datetime],
    interval: str,
    shift_duration_hours: Optional[int] = None,
    *,
    equipment_identifier: Optional[str] = None,
    log_type: Optional[str] = None,
    tolerance_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute expected/present/missing slot details for a single day and equipment.
    """
    expected_slots = build_expected_slots_for_day(day_value, interval, shift_duration_hours)
    if tolerance_minutes is None:
        tol = 0
        if equipment_identifier and log_type:
            try:
                equipment = _resolve_equipment_for_log_type(equipment_identifier, log_type)
                tol = int((equipment.tolerance_minutes or 0) if equipment else 0)
            except Exception:
                tol = 0
        tolerance_minutes = max(0, tol)

    slot_tz = get_slot_timezone()
    normalized_timestamps: List[datetime] = []
    for raw_ts in timestamps or []:
        if raw_ts is None:
            continue
        ts = raw_ts
        if timezone.is_naive(ts):
            ts = timezone.make_aware(ts, slot_tz)
        normalized_timestamps.append(timezone.localtime(ts, slot_tz))
    normalized_timestamps.sort()

    tolerance_delta = timedelta(minutes=max(0, int(tolerance_minutes or 0)))
    filled_slot_keys = set()
    used_timestamp_indexes = set()
    for slot in expected_slots:
        # Tolerance anchor is slot start (business rule):
        # for 10:00-11:00 with ±15 => valid range 09:45-10:15.
        slot_anchor = slot["slot_start"]
        window_start = slot_anchor - tolerance_delta
        window_end = slot_anchor + tolerance_delta
        for idx, ts in enumerate(normalized_timestamps):
            if idx in used_timestamp_indexes:
                continue
            in_slot_range = slot["slot_start"] <= ts < slot["slot_end"]
            in_tolerance_window = window_start <= ts <= window_end
            if in_slot_range or in_tolerance_window:
                filled_slot_keys.add(slot["slot_key"])
                used_timestamp_indexes.add(idx)
                break

    missing_slots_all = [slot for slot in expected_slots if slot["slot_key"] not in filled_slot_keys]
    now = timezone.localtime(timezone.now(), slot_tz)
    if isinstance(day_value, datetime):
        target_day = day_value.date()
    else:
        target_day = day_value
    today = now.date()
    if target_day < today:
        missing_slots = missing_slots_all
    elif target_day > today:
        missing_slots = []
    else:
        missing_slots = [slot for slot in missing_slots_all if slot["slot_end"] <= now]

    next_due = None
    for slot in missing_slots_all:
        if slot["slot_start"] >= now:
            next_due = slot["slot_start"]
            break
    if next_due is None and missing_slots_all:
        # If we are already inside a missing slot window, next due is that slot start.
        in_progress = next((s for s in missing_slots_all if s["slot_start"] <= now < s["slot_end"]), None)
        if in_progress is not None:
            next_due = in_progress["slot_start"]
        else:
            next_due = missing_slots_all[0]["slot_start"]

    return {
        "expected_slots": expected_slots,
        "expected_slot_count": len(expected_slots),
        "present_slot_count": len(filled_slot_keys),
        "used_entry_count": len(used_timestamp_indexes),
        "missing_slots": missing_slots,
        "missing_slot_count": len(missing_slots),
        "next_due": next_due,
        "has_missing": len(missing_slots) > 0,
    }


def filter_missing_slots_before_earliest_downtime(
    missing_slots: List[Dict[str, Any]],
    downtime_timestamps: List,
    interval: str,
    shift_duration_hours: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    On a day with maintenance/shutdown, only show operation gaps *before* the downtime window.

    The earliest downtime log defines the start of the maintenance slot (hourly/shift/daily).
    Any missing slot whose window ends after that start is omitted (rest of day treated as
    covered by downtime, not missing operation readings).
    """
    if not downtime_timestamps or not missing_slots:
        return missing_slots
    slot_tz = get_slot_timezone()
    earliest_local: Optional[datetime] = None
    for raw_ts in downtime_timestamps:
        if raw_ts is None:
            continue
        ts = raw_ts
        if timezone.is_naive(ts):
            ts = timezone.make_aware(ts, slot_tz)
        ts = timezone.localtime(ts, slot_tz)
        if earliest_local is None or ts < earliest_local:
            earliest_local = ts
    if earliest_local is None:
        return missing_slots
    downtime_slot_start, _ = get_slot_range(earliest_local, interval, shift_duration_hours)
    cutoff = timezone.localtime(downtime_slot_start, slot_tz)
    out: List[Dict[str, Any]] = []
    for s in missing_slots:
        se = s["slot_end"]
        if timezone.is_naive(se):
            se = timezone.make_aware(se, slot_tz)
        se = timezone.localtime(se, slot_tz)
        if se <= cutoff:
            out.append(s)
    return out


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

    equipment = _resolve_equipment_for_log_type(equipment_identifier, log_type)

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
        if log_type in ("chiller", "boiler", "briquette"):
            equipment = Equipment.objects.filter(equipment_number=equipment_identifier).first()
        elif log_type == "filter":
            equipment = _resolve_equipment_for_filter_log_identifier(equipment_identifier)
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
        elif log_type == "briquette":
            from briquette_logs.models import BriquetteLog

            last = (
                BriquetteLog.objects.filter(
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
        if log_type in ("chiller", "boiler", "briquette"):
            equipment = Equipment.objects.filter(equipment_number=equipment_identifier).first()
        elif log_type == "filter":
            equipment = _resolve_equipment_for_filter_log_identifier(equipment_identifier)
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


def format_missing_slots_equipment_label(
    equipment_number: str,
    name: Optional[str] = None,
    site_id: Optional[str] = None,
) -> str:
    """
    Human-readable row title for missing-slot UIs: equipment number plus site tag or name
    (e.g. "EN-E045 CH-001" when site_id is CH-001).
    """
    num = (equipment_number or "").strip()
    nm = (name or "").strip()
    sid_inner = (site_id or "").strip()
    second = sid_inner or nm
    if not num:
        return second
    if not second or second.casefold() == num.casefold():
        return num
    return f"{num} {second}"
