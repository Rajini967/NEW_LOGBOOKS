from __future__ import annotations

from datetime import timedelta
from typing import Dict, Tuple

from django.db.models import Count, Q, Sum
from django.utils import timezone


def get_active_chillers_count() -> int:
    from equipment.models import Equipment

    return Equipment.objects.filter(is_active=True).filter(
        Q(category__name__iexact="chiller") | Q(category__name__iexact="chillers")
    ).count()


def get_active_boilers_count() -> int:
    from equipment.models import Equipment

    return Equipment.objects.filter(is_active=True).filter(
        Q(category__name__iexact="boiler") | Q(category__name__iexact="boilers")
    ).count()


def get_active_chemicals_count() -> int:
    from equipment.models import Equipment

    return Equipment.objects.filter(is_active=True).filter(
        Q(category__name__iexact="chemical") | Q(category__name__iexact="chemicals")
    ).count()


def get_active_filters_count() -> int:
    from equipment.models import Equipment

    return Equipment.objects.filter(is_active=True).filter(
        Q(category__name__iexact="filter") | Q(category__name__iexact="filters")
    ).count()


def get_today_utilities_metrics(today) -> Dict[str, float]:
    from reports.models import ManualBoilerConsumption, ManualChillerConsumption

    chiller_agg = ManualChillerConsumption.objects.filter(date=today).aggregate(
        power_kwh=Sum("power_kwh"),
        water_ct1_l=Sum("water_ct1_l"),
        water_ct2_l=Sum("water_ct2_l"),
        water_ct3_l=Sum("water_ct3_l"),
    )
    boiler_agg = ManualBoilerConsumption.objects.filter(date=today).aggregate(
        power_kwh=Sum("power_kwh"),
        water_l=Sum("water_l"),
        diesel_l=Sum("diesel_l"),
        furnace_oil_l=Sum("furnace_oil_l"),
        brigade_kg=Sum("brigade_kg"),
    )

    power_today_kwh = float(chiller_agg["power_kwh"] or 0) + float(boiler_agg["power_kwh"] or 0)
    water_today_liters = (
        float(chiller_agg["water_ct1_l"] or 0)
        + float(chiller_agg["water_ct2_l"] or 0)
        + float(chiller_agg["water_ct3_l"] or 0)
        + float(boiler_agg["water_l"] or 0)
    )
    fuel_today_liters = (
        float(boiler_agg["diesel_l"] or 0)
        + float(boiler_agg["furnace_oil_l"] or 0)
        + float(boiler_agg["brigade_kg"] or 0)
    )
    diesel_today_liters = float(boiler_agg["diesel_l"] or 0)

    return {
        "power_today_kwh": round(power_today_kwh, 2),
        "water_today_liters": round(water_today_liters, 2),
        "fuel_today_liters": round(fuel_today_liters, 2),
        "diesel_today_liters": round(diesel_today_liters, 2),
    }


def get_pending_approvals_count(pending_statuses: Tuple[str, ...]) -> int:
    from boiler_logs.models import BoilerLog
    from chemical_prep.models import ChemicalPreparation
    from chiller_logs.models import ChillerLog
    from filter_logs.models import FilterLog

    return (
        ChillerLog.objects.filter(status__in=pending_statuses).count()
        + BoilerLog.objects.filter(status__in=pending_statuses).count()
        + ChemicalPreparation.objects.filter(status__in=pending_statuses).count()
        + FilterLog.objects.filter(status__in=pending_statuses).count()
    )


def get_hvac_pending_count(pending_statuses: Tuple[str, ...]) -> int:
    from air_validation.models import HVACValidation

    return HVACValidation.objects.filter(status__in=pending_statuses).count()


def get_total_log_entries() -> int:
    from boiler_logs.models import BoilerLog
    from chemical_prep.models import ChemicalPreparation
    from chiller_logs.models import ChillerLog
    from filter_logs.models import FilterLog

    return (
        ChillerLog.objects.count()
        + BoilerLog.objects.count()
        + FilterLog.objects.count()
        + ChemicalPreparation.objects.count()
    )


def get_active_filter_alerts(today) -> int:
    from filter_master.models import FilterSchedule

    FilterSchedule.objects.filter(
        is_approved=True, next_due_date__lt=today
    ).exclude(status__in=["completed", "overdue"]).update(status="overdue")
    overdue_qs = FilterSchedule.objects.filter(
        is_approved=True, next_due_date__lt=today
    ).exclude(status="completed")
    return overdue_qs.count()


def get_average_pressure_bar(now) -> float | None:
    from boiler_logs.models import BoilerLog
    from chiller_logs.models import ChillerLog
    from compressor_logs.models import CompressorLog

    cutoff_24h = now - timedelta(hours=24)
    pressure_sum = 0.0
    pressure_count = 0

    chiller_agg = ChillerLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
        evap_water_inlet_pressure__isnull=True
    ).exclude(evap_water_inlet_pressure=0).aggregate(
        s=Sum("evap_water_inlet_pressure"),
        c=Count("evap_water_inlet_pressure"),
    )
    pressure_sum += float(chiller_agg["s"] or 0)
    pressure_count += int(chiller_agg["c"] or 0)

    boiler_agg = BoilerLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
        steam_pressure__isnull=True
    ).exclude(steam_pressure=0).aggregate(
        s=Sum("steam_pressure"),
        c=Count("steam_pressure"),
    )
    pressure_sum += float(boiler_agg["s"] or 0)
    pressure_count += int(boiler_agg["c"] or 0)

    compressor_agg = CompressorLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
        compressor_pressure__isnull=True
    ).exclude(compressor_pressure=0).aggregate(
        s=Sum("compressor_pressure"),
        c=Count("compressor_pressure"),
    )
    pressure_sum += float(compressor_agg["s"] or 0)
    pressure_count += int(compressor_agg["c"] or 0)

    return round(pressure_sum / pressure_count, 1) if pressure_count > 0 else None


def get_dashboard_metrics() -> Dict[str, int | float | None]:
    """
    Dashboard query orchestration with explicit per-metric fallbacks.
    """
    today = timezone.now().date()
    now = timezone.now()
    pending_statuses = ("pending", "draft", "pending_secondary_approval")

    metrics: Dict[str, int | float | None] = {
        "active_chillers_count": 0,
        "active_boilers_count": 0,
        "active_chemicals_count": 0,
        "active_filters_count": 0,
        "pending_approvals_count": 0,
        "hvac_validations_pending_count": 0,
        "total_log_entries": 0,
        "active_alerts": 0,
        "avg_pressure_bar": None,
        "power_today_kwh": 0.0,
        "water_today_liters": 0.0,
        "fuel_today_liters": 0.0,
        "diesel_today_liters": 0.0,
    }

    query_steps = (
        ("active_chillers_count", lambda: get_active_chillers_count()),
        ("active_boilers_count", lambda: get_active_boilers_count()),
        ("active_chemicals_count", lambda: get_active_chemicals_count()),
        ("active_filters_count", lambda: get_active_filters_count()),
        ("pending_approvals_count", lambda: get_pending_approvals_count(pending_statuses)),
        ("hvac_validations_pending_count", lambda: get_hvac_pending_count(pending_statuses)),
        ("total_log_entries", get_total_log_entries),
        ("active_alerts", lambda: get_active_filter_alerts(today)),
        ("avg_pressure_bar", lambda: get_average_pressure_bar(now)),
    )
    for key, fn in query_steps:
        try:
            metrics[key] = fn()
        except Exception:
            # Keep per-metric fallback explicit; endpoint still returns partial dashboard data.
            continue

    try:
        metrics.update(get_today_utilities_metrics(today))
    except Exception:
        pass

    return metrics
