"""
Dashboard summary and weekly consumption APIs for the main Dashboard page.
"""
from datetime import datetime, timedelta
from django.db.models import Sum, Q, Count
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Report


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    GET /api/reports/dashboard_summary/
    Returns counts for Quick Stats: active chillers, pending approvals, approved today,
    active alerts (filter overdue), compliance score.
    """
    today = timezone.now().date()

    # Active chillers: Equipment with category name Chiller/Chillers, is_active=True
    try:
        from equipment.models import Equipment
        active_chillers_count = Equipment.objects.filter(
            is_active=True
        ).filter(
            Q(category__name__iexact="chiller") | Q(category__name__iexact="chillers")
        ).count()
    except Exception:
        active_chillers_count = 0

    now = timezone.now()

    # Pending approvals: sum of pending/draft/pending_secondary_approval across log types
    pending_statuses = ("pending", "draft", "pending_secondary_approval")
    try:
        from chiller_logs.models import ChillerLog
        chiller_pending = ChillerLog.objects.filter(status__in=pending_statuses).count()
    except Exception:
        chiller_pending = 0
    try:
        from boiler_logs.models import BoilerLog
        boiler_pending = BoilerLog.objects.filter(status__in=pending_statuses).count()
    except Exception:
        boiler_pending = 0
    try:
        from chemical_prep.models import ChemicalPreparation
        chemical_pending = ChemicalPreparation.objects.filter(status__in=pending_statuses).count()
    except Exception:
        chemical_pending = 0
    try:
        from filter_logs.models import FilterLog
        filter_pending = FilterLog.objects.filter(status__in=pending_statuses).count()
    except Exception:
        filter_pending = 0
    pending_approvals_count = chiller_pending + boiler_pending + chemical_pending + filter_pending

    # HVAC Validations: pending validations count (draft/pending/pending_secondary_approval)
    try:
        from air_validation.models import HVACValidation
        hvac_validations_pending_count = HVACValidation.objects.filter(
            status__in=pending_statuses
        ).count()
    except Exception:
        hvac_validations_pending_count = 0

    # E Log Book: total count of chiller, boiler, filter, chemical logbook entries only
    total_log_entries = (
        ChillerLog.objects.count()
        + BoilerLog.objects.count()
        + FilterLog.objects.count()
        + ChemicalPreparation.objects.count()
    )

    # Approved today: Report rows approved today
    approved_today_count = Report.objects.filter(approved_at__date=today).count()

    # Active alerts: filter schedule overdue (same logic as filter_master overdue-summary)
    try:
        from filter_master.models import FilterSchedule
        FilterSchedule.objects.filter(
            is_approved=True, next_due_date__lt=today
        ).exclude(status__in=["completed", "overdue"]).update(status="overdue")
        overdue_qs = FilterSchedule.objects.filter(
            is_approved=True, next_due_date__lt=today
        ).exclude(status="completed")
        active_alerts = overdue_qs.count()
    except Exception:
        active_alerts = 0

    # Compliance score: 100 * approved_today / (approved_today + pending) when denominator > 0
    total = approved_today_count + pending_approvals_count
    if total > 0:
        compliance_score = round(100 * approved_today_count / total)
    else:
        compliance_score = None

    # Avg Pressure (bar): average of recent pressure readings over last 24 hours.
    # Uses available pressure fields from chiller/boiler/compressor logs.
    cutoff_24h = now - timedelta(hours=24)
    pressure_sum = 0.0
    pressure_count = 0

    try:
        chiller_agg = ChillerLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
            chiller_water_inlet_pressure__isnull=True
        ).exclude(chiller_water_inlet_pressure=0).aggregate(
            s=Sum("chiller_water_inlet_pressure"),
            c=Count("chiller_water_inlet_pressure"),
        )
        pressure_sum += float(chiller_agg["s"] or 0)
        pressure_count += int(chiller_agg["c"] or 0)
    except Exception:
        pass

    try:
        boiler_agg = BoilerLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
            steam_pressure__isnull=True
        ).exclude(steam_pressure=0).aggregate(
            s=Sum("steam_pressure"),
            c=Count("steam_pressure"),
        )
        pressure_sum += float(boiler_agg["s"] or 0)
        pressure_count += int(boiler_agg["c"] or 0)
    except Exception:
        pass

    try:
        from compressor_logs.models import CompressorLog
        comp_agg = CompressorLog.objects.filter(timestamp__gte=cutoff_24h).exclude(
            compressor_pressure__isnull=True
        ).exclude(compressor_pressure=0).aggregate(
            s=Sum("compressor_pressure"),
            c=Count("compressor_pressure"),
        )
        pressure_sum += float(comp_agg["s"] or 0)
        pressure_count += int(comp_agg["c"] or 0)
    except Exception:
        pass

    avg_pressure_bar = round(pressure_sum / pressure_count, 1) if pressure_count > 0 else None

    return Response({
        "active_chillers_count": active_chillers_count,
        "avg_pressure_bar": avg_pressure_bar,
        "pending_approvals_count": pending_approvals_count,
        "approved_today_count": approved_today_count,
        "total_log_entries": total_log_entries,
        "hvac_validations_pending_count": hvac_validations_pending_count,
        "active_alerts": active_alerts,
        "compliance_score": compliance_score,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def weekly_consumption(request):
    """
    GET /api/reports/weekly_consumption/?date=YYYY-MM-DD
    Returns last 7 days (ending on date, or today) with chemical_kg, steam_kg, fuel_liters per day.
    """
    date_str = request.query_params.get("date")
    if date_str:
        try:
            end_date = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "date must be YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        end_date = timezone.now().date()
    start_date = end_date - timedelta(days=6)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    result = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        result.append({
            "date": d.isoformat(),
            "day_label": day_names[d.weekday()],
            "chemical_kg": 0.0,
            "steam_kg": 0.0,
            "fuel_liters": 0.0,
        })

    # Chemical: ChemicalPreparation, approved, sum chemical_qty/1000 by date
    try:
        from chemical_prep.models import ChemicalPreparation
        for item in result:
            d = datetime.strptime(item["date"], "%Y-%m-%d").date()
            total_g = ChemicalPreparation.objects.filter(
                status="approved",
                timestamp__date=d,
            ).exclude(chemical_qty__isnull=True).exclude(chemical_qty=0).aggregate(
                s=Sum("chemical_qty")
            )["s"] or 0
            item["chemical_kg"] = round(float(total_g) / 1000.0, 2)
    except Exception:
        pass

    # Steam & Fuel: BoilerLog by date
    try:
        from boiler_logs.models import BoilerLog
        for item in result:
            d = datetime.strptime(item["date"], "%Y-%m-%d").date()
            steam = BoilerLog.objects.filter(timestamp__date=d).aggregate(
                s=Sum("steam_consumption_kg_hr")
            )["s"] or 0
            item["steam_kg"] = round(float(steam), 2)
            fuel = BoilerLog.objects.filter(timestamp__date=d).aggregate(
                diesel=Sum("daily_diesel_consumption_liters"),
                furnace=Sum("daily_furnace_oil_consumption_liters"),
            )
            total_fuel = (fuel["diesel"] or 0) + (fuel["furnace"] or 0)
            item["fuel_liters"] = round(float(total_fuel), 2)
    except Exception:
        pass

    return Response(result)


def _normalize_activity_status(status):
    """Map log status to frontend: pending | approved | rejected."""
    if not status:
        return "pending"
    s = (status or "").lower()
    if s in ("approved",):
        return "approved"
    if s in ("rejected",):
        return "rejected"
    return "pending"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recent_activity(request):
    """
    GET /api/reports/recent_activity/?limit=20
    Returns a unified list of recent log/validation activities (chiller, boiler, filter,
    chemical, HVAC) with id, type, action, operator, timestamp, status.
    """
    try:
        limit = min(int(request.query_params.get("limit", 20)), 50)
    except (TypeError, ValueError):
        limit = 20

    activities = []

    # ChillerLog
    try:
        from chiller_logs.models import ChillerLog
        for log in ChillerLog.objects.order_by("-timestamp")[:limit]:
            activities.append({
                "timestamp": log.timestamp,
                "payload": {
                    "id": str(log.id),
                    "type": "utility",
                    "action": f"Chiller log – {log.equipment_id or 'N/A'}",
                    "operator": log.operator_name or "Unknown",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "status": _normalize_activity_status(log.status),
                },
            })
    except Exception:
        pass

    # BoilerLog
    try:
        from boiler_logs.models import BoilerLog
        for log in BoilerLog.objects.order_by("-timestamp")[:limit]:
            activities.append({
                "timestamp": log.timestamp,
                "payload": {
                    "id": str(log.id),
                    "type": "utility",
                    "action": f"Boiler log – {log.equipment_id or 'N/A'}",
                    "operator": log.operator_name or "Unknown",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "status": _normalize_activity_status(log.status),
                },
            })
    except Exception:
        pass

    # FilterLog
    try:
        from filter_logs.models import FilterLog
        for log in FilterLog.objects.order_by("-timestamp")[:limit]:
            activities.append({
                "timestamp": log.timestamp,
                "payload": {
                    "id": str(log.id),
                    "type": "utility",
                    "action": f"Filter log – {log.equipment_id or 'N/A'}",
                    "operator": log.operator_name or "Unknown",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "status": _normalize_activity_status(log.status),
                },
            })
    except Exception:
        pass

    # ChemicalPreparation
    try:
        from chemical_prep.models import ChemicalPreparation
        for log in ChemicalPreparation.objects.order_by("-timestamp")[:limit]:
            activities.append({
                "timestamp": log.timestamp,
                "payload": {
                    "id": str(log.id),
                    "type": "chemical",
                    "action": f"Chemical prep – {log.equipment_name or 'N/A'}",
                    "operator": log.operator_name or "Unknown",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "status": _normalize_activity_status(log.status),
                },
            })
    except Exception:
        pass

    # HVACValidation
    try:
        from air_validation.models import HVACValidation
        for log in HVACValidation.objects.order_by("-timestamp")[:limit]:
            activities.append({
                "timestamp": log.timestamp,
                "payload": {
                    "id": str(log.id),
                    "type": "validation",
                    "action": f"HVAC – {log.room_name or 'N/A'}",
                    "operator": log.operator_name or "Unknown",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "status": _normalize_activity_status(log.status),
                },
            })
    except Exception:
        pass

    # Sort by timestamp desc and take top `limit`
    activities.sort(key=lambda x: x["timestamp"] or timezone.now(), reverse=True)
    result = [a["payload"] for a in activities[:limit]]
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def equipment_status(request):
    """
    GET /api/reports/equipment_status/
    Returns active equipment in chiller/boiler/compressor categories with latest
    log readings (t1, t2, p1, p2) and derived status (running if log in last 24h, else idle).
    """
    from equipment.models import Equipment
    from django.db.models import Q

    # Active equipment in chiller, boiler, compressor categories (case-insensitive)
    qs = Equipment.objects.filter(is_active=True).filter(
        Q(category__name__iexact="chiller")
        | Q(category__name__iexact="chillers")
        | Q(category__name__iexact="boiler")
        | Q(category__name__iexact="compressor")
    ).select_related("category").order_by("equipment_number")

    # Build lookup: equipment_id (as used in logs) -> type. Logs may store UUID or equipment_number.
    eq_id_to_type = {}
    eq_id_to_equipment = {}
    for eq in qs:
        eq_id_to_type[str(eq.id)] = "chiller" if eq.category.name.lower() in ("chiller", "chillers") else eq.category.name.lower().replace("chillers", "chiller")
        eq_id_to_equipment[str(eq.id)] = eq
        eq_id_to_type[eq.equipment_number] = eq_id_to_type[str(eq.id)]
        eq_id_to_equipment[eq.equipment_number] = eq

    result = []
    result_ids = set()
    now = timezone.now()
    cutoff_24h = now - timedelta(hours=24)

    # Latest chiller log per equipment_id
    try:
        from chiller_logs.models import ChillerLog
        from django.db.models import Max
        latest_ts = ChillerLog.objects.values("equipment_id").annotate(ts=Max("timestamp"))
        for row in latest_ts:
            eid = row["equipment_id"]
            eq = eq_id_to_equipment.get(eid)
            if not eq or str(eq.id) in result_ids:
                continue
            log = ChillerLog.objects.filter(equipment_id=eid).order_by("-timestamp").first()
            if not log:
                continue
            status = "running" if (log.timestamp and log.timestamp >= cutoff_24h) else "idle"
            result_ids.add(str(eq.id))
            result.append({
                "id": str(eq.id),
                "name": eq.name,
                "equipment_number": eq.equipment_number,
                "type": eq_id_to_type.get(eid, "chiller"),
                "status": status,
                "t1": log.chiller_supply_temp,
                "t2": log.chiller_return_temp,
                "p1": getattr(log, "chiller_water_inlet_pressure", None),
                "p2": getattr(log, "evap_water_inlet_pressure", None) or getattr(log, "chiller_water_inlet_pressure", None),
            })
    except Exception:
        pass

    try:
        from boiler_logs.models import BoilerLog
        for eq in qs:
            if str(eq.id) in result_ids:
                continue
            if eq_id_to_type.get(str(eq.id)) != "boiler" and eq_id_to_type.get(eq.equipment_number) != "boiler":
                continue
            log = BoilerLog.objects.filter(
                Q(equipment_id=str(eq.id)) | Q(equipment_id=eq.equipment_number)
            ).order_by("-timestamp").first()
            if not log:
                result.append({
                    "id": str(eq.id),
                    "name": eq.name,
                    "equipment_number": eq.equipment_number,
                    "type": "boiler",
                    "status": "idle",
                    "t1": None, "t2": None, "p1": None, "p2": None,
                })
            else:
                status = "running" if (log.timestamp and log.timestamp >= cutoff_24h) else "idle"
                result.append({
                    "id": str(eq.id),
                    "name": eq.name,
                    "equipment_number": eq.equipment_number,
                    "type": "boiler",
                    "status": status,
                    "t1": log.feed_water_temp,
                    "t2": log.steam_temp,
                    "p1": log.steam_pressure,
                    "p2": getattr(log, "boiler_steam_pressure", None) or getattr(log, "steam_pressure_after_prv", None),
                })
            result_ids.add(str(eq.id))
    except Exception:
        pass

    try:
        from compressor_logs.models import CompressorLog
        for eq in qs:
            if str(eq.id) in result_ids:
                continue
            if eq_id_to_type.get(str(eq.id)) != "compressor" and eq_id_to_type.get(eq.equipment_number) != "compressor":
                continue
            log = CompressorLog.objects.filter(
                Q(equipment_id=str(eq.id)) | Q(equipment_id=eq.equipment_number)
            ).order_by("-timestamp").first()
            if not log:
                result.append({
                    "id": str(eq.id),
                    "name": eq.name,
                    "equipment_number": eq.equipment_number,
                    "type": "compressor",
                    "status": "idle",
                    "t1": None, "t2": None, "p1": None, "p2": None,
                })
            else:
                status = "running" if (log.timestamp and log.timestamp >= cutoff_24h) else "idle"
                p2_val = getattr(log, "compressor_flow", None)
                if p2_val is None:
                    p2_val = log.compressor_pressure
                result.append({
                    "id": str(eq.id),
                    "name": eq.name,
                    "equipment_number": eq.equipment_number,
                    "type": "compressor",
                    "status": status,
                    "t1": log.compressor_supply_temp,
                    "t2": log.compressor_return_temp,
                    "p1": log.compressor_pressure,
                    "p2": p2_val,
                })
            result_ids.add(str(eq.id))
    except Exception:
        pass

    # Add any equipment not yet in result (no log of matching type)
    for eq in qs:
        if str(eq.id) in result_ids:
            continue
        cat_lower = eq.category.name.lower() if eq.category else ""
        eq_type = "chiller" if cat_lower in ("chiller", "chillers") else (cat_lower if cat_lower in ("boiler", "compressor") else "chiller")
        result.append({
            "id": str(eq.id),
            "name": eq.name,
            "equipment_number": eq.equipment_number,
            "type": eq_type,
            "status": "idle",
            "t1": None, "t2": None, "p1": None, "p2": None,
        })

    return Response(result)
