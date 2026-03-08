"""
Dashboard summary and weekly consumption APIs for the main Dashboard page.
"""
from datetime import datetime, timedelta
from django.db.models import Sum, Q
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

    return Response({
        "active_chillers_count": active_chillers_count,
        "pending_approvals_count": pending_approvals_count,
        "approved_today_count": approved_today_count,
        "total_log_entries": total_log_entries,
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
