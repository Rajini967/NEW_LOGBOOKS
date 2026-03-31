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

from .models import Report, ManualChillerConsumption, ManualBoilerConsumption, ManualChemicalConsumption
from .utils import log_audit_event
from .dashboard_queries import get_dashboard_metrics
from chiller_logs.views import _get_limit_for_date
from boiler_logs.views import _get_boiler_limit_for_date

# Max date range for daily_consumption (days)
DAILY_CONSUMPTION_MAX_DAYS = 31


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    GET /api/reports/dashboard_summary/
    Returns counts for Quick Stats: active chillers, pending approvals, approved today,
    active alerts (filter overdue), compliance score.
    """
    today = timezone.now().date()
    metrics = get_dashboard_metrics()

    # Approved today: Report rows approved today
    approved_today_count = Report.objects.filter(approved_at__date=today).count()

    # Compliance score: 100 * approved_today / (approved_today + pending) when denominator > 0
    total = approved_today_count + int(metrics["pending_approvals_count"] or 0)
    if total > 0:
        compliance_score = round(100 * approved_today_count / total)
    else:
        compliance_score = None

    return Response({
        "active_chillers_count": metrics["active_chillers_count"],
        "active_boilers_count": metrics["active_boilers_count"],
        "active_chemicals_count": metrics["active_chemicals_count"],
        "active_filters_count": metrics["active_filters_count"],
        "power_today_kwh": metrics["power_today_kwh"],
        "water_today_liters": metrics["water_today_liters"],
        "fuel_today_liters": metrics["fuel_today_liters"],
        "diesel_today_liters": metrics["diesel_today_liters"],
        "avg_pressure_bar": metrics["avg_pressure_bar"],
        "pending_approvals_count": metrics["pending_approvals_count"],
        "approved_today_count": approved_today_count,
        "total_log_entries": metrics["total_log_entries"],
        "hvac_validations_pending_count": metrics["hvac_validations_pending_count"],
        "active_alerts": metrics["active_alerts"],
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


def _parse_daily_consumption_dates(request):
    """Parse date_from, date_to from request. Returns (start_date, end_date) or (None, None, error_response)."""
    today = timezone.now().date()
    date_from_str = (request.query_params.get("date_from") or (getattr(request, "data", None) or {}).get("date_from") or "").strip() or None
    date_to_str = (request.query_params.get("date_to") or (getattr(request, "data", None) or {}).get("date_to") or "").strip() or None
    if date_from_str and date_to_str:
        try:
            start_date = datetime.strptime(date_from_str[:10], "%Y-%m-%d").date()
            end_date = datetime.strptime(date_to_str[:10], "%Y-%m-%d").date()
            return start_date, end_date, None
        except ValueError:
            return None, None, Response(
                {"error": "date_from and date_to must be YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    end_date = today
    start_date = end_date - timedelta(days=6)
    return start_date, end_date, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def daily_consumption(request):
    """
    GET: Returns daily consumption (manual overrides log-aggregated). One row per date in range when equipment_id given.
    POST: Create/update manual daily consumption. Body: type, date, equipment_id? (chiller/boiler), and numeric fields.
    """
    today = timezone.now().date()

    if request.method == "POST":
        data = request.data or {}
        type_param = (data.get("type") or "").strip().lower()
        date_str = (data.get("date") or "").strip()[:10]
        if not date_str:
            return Response({"error": "date is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "date must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)

        if type_param == "chiller":
            equipment_id = (data.get("equipment_id") or "").strip()
            if not equipment_id:
                return Response({"error": "equipment_id is required for chiller"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                power_kwh = float(data.get("power_kwh") or 0)
                water_ct1_l = float(data.get("water_ct1_l") or 0)
                water_ct2_l = float(data.get("water_ct2_l") or 0)
                water_ct3_l = float(data.get("water_ct3_l") or 0)
                chemical_ct1_kg = float(data.get("chemical_ct1_kg") or 0)
                chemical_ct2_kg = float(data.get("chemical_ct2_kg") or 0)
                chemical_ct3_kg = float(data.get("chemical_ct3_kg") or 0)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Consumption values must be numeric"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            limit = _get_limit_for_date(equipment_id, entry_date)
            warnings = []
            if limit is not None:
                if limit.daily_power_limit_kw is not None and power_kwh > limit.daily_power_limit_kw:
                    warnings.append(f"Daily power consumption exceeds limit ({limit.daily_power_limit_kw} kWh).")
                if limit.daily_water_ct1_liters is not None and water_ct1_l > limit.daily_water_ct1_liters:
                    warnings.append(f"Cooling Tower 1 – Water exceeds limit ({limit.daily_water_ct1_liters} L).")
                if limit.daily_water_ct2_liters is not None and water_ct2_l > limit.daily_water_ct2_liters:
                    warnings.append(f"Cooling Tower 2 – Water exceeds limit ({limit.daily_water_ct2_liters} L).")
                if limit.daily_water_ct3_liters is not None and water_ct3_l > limit.daily_water_ct3_liters:
                    warnings.append(f"Cooling Tower 3 – Water exceeds limit ({limit.daily_water_ct3_liters} L).")
                if limit.daily_chemical_ct1_kg is not None and chemical_ct1_kg > limit.daily_chemical_ct1_kg:
                    warnings.append(f"Cooling Tower 1 – Chemical exceeds limit ({limit.daily_chemical_ct1_kg} kg).")
                if limit.daily_chemical_ct2_kg is not None and chemical_ct2_kg > limit.daily_chemical_ct2_kg:
                    warnings.append(f"Cooling Tower 2 – Chemical exceeds limit ({limit.daily_chemical_ct2_kg} kg).")
                if limit.daily_chemical_ct3_kg is not None and chemical_ct3_kg > limit.daily_chemical_ct3_kg:
                    warnings.append(f"Cooling Tower 3 – Chemical exceeds limit ({limit.daily_chemical_ct3_kg} kg).")
            obj, created = ManualChillerConsumption.objects.update_or_create(
                equipment_id=equipment_id,
                date=entry_date,
                defaults={
                    "power_kwh": power_kwh,
                    "water_ct1_l": water_ct1_l,
                    "water_ct2_l": water_ct2_l,
                    "water_ct3_l": water_ct3_l,
                    "chemical_ct1_kg": chemical_ct1_kg,
                    "chemical_ct2_kg": chemical_ct2_kg,
                    "chemical_ct3_kg": chemical_ct3_kg,
                },
            )
            log_audit_event(
                user=request.user,
                event_type="consumption_updated",
                object_type="chiller_consumption",
                object_id=f"{obj.equipment_id}_{obj.date.isoformat()}",
                field_name="updated" if not created else "created",
            )
            payload = {
                "message": "Chiller consumption saved",
                "date": obj.date.isoformat(),
                "equipment_id": obj.equipment_id,
                "power_kwh": obj.power_kwh,
                "water_ct1_l": obj.water_ct1_l,
                "water_ct2_l": obj.water_ct2_l,
                "water_ct3_l": obj.water_ct3_l,
                "chemical_ct1_kg": obj.chemical_ct1_kg,
                "chemical_ct2_kg": obj.chemical_ct2_kg,
                "chemical_ct3_kg": obj.chemical_ct3_kg,
            }
            if warnings:
                payload["warnings"] = warnings
            return Response(payload)
        if type_param == "boiler":
            equipment_id = (data.get("equipment_id") or "").strip()
            if not equipment_id:
                return Response({"error": "equipment_id is required for boiler"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                power_kwh = float(data.get("power_kwh") or 0)
                water_l = float(data.get("water_l") or 0)
                chemical_kg = float(data.get("chemical_kg") or 0)
                diesel_l = float(data.get("diesel_l") or 0)
                furnace_oil_l = float(data.get("furnace_oil_l") or 0)
                brigade_kg = float(data.get("brigade_kg") or 0)
                steam_kg_hr = float(data.get("steam_kg_hr") or 0)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Consumption values must be numeric"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            limit = _get_boiler_limit_for_date(equipment_id, entry_date)
            warnings = []
            if limit is not None:
                if limit.daily_power_limit_kw is not None and power_kwh > limit.daily_power_limit_kw:
                    warnings.append(f"Daily power consumption exceeds limit ({limit.daily_power_limit_kw} kWh).")
                if limit.daily_water_limit_liters is not None and water_l > limit.daily_water_limit_liters:
                    warnings.append(f"Water exceeds limit ({limit.daily_water_limit_liters} L).")
                if limit.daily_chemical_limit_kg is not None and chemical_kg > limit.daily_chemical_limit_kg:
                    warnings.append(f"Chemical exceeds limit ({limit.daily_chemical_limit_kg} kg).")
                if limit.daily_diesel_limit_liters is not None and diesel_l > limit.daily_diesel_limit_liters:
                    warnings.append(f"Diesel exceeds limit ({limit.daily_diesel_limit_liters} L).")
                if limit.daily_furnace_oil_limit_liters is not None and furnace_oil_l > limit.daily_furnace_oil_limit_liters:
                    warnings.append(f"Furnace oil exceeds limit ({limit.daily_furnace_oil_limit_liters} L).")
                if limit.daily_brigade_limit_kg is not None and brigade_kg > limit.daily_brigade_limit_kg:
                    warnings.append(f"Brigade exceeds limit ({limit.daily_brigade_limit_kg} kg).")
                if limit.daily_steam_limit_kg_hr is not None and steam_kg_hr > limit.daily_steam_limit_kg_hr:
                    warnings.append(f"Steam exceeds limit ({limit.daily_steam_limit_kg_hr} kg/hr).")
            obj, created = ManualBoilerConsumption.objects.update_or_create(
                equipment_id=equipment_id,
                date=entry_date,
                defaults={
                    "power_kwh": power_kwh,
                    "water_l": water_l,
                    "chemical_kg": chemical_kg,
                    "diesel_l": diesel_l,
                    "furnace_oil_l": furnace_oil_l,
                    "brigade_kg": brigade_kg,
                    "steam_kg_hr": steam_kg_hr,
                },
            )
            log_audit_event(
                user=request.user,
                event_type="consumption_updated",
                object_type="boiler_consumption",
                object_id=f"{obj.equipment_id}_{obj.date.isoformat()}",
                field_name="updated" if not created else "created",
            )
            payload = {
                "message": "Boiler consumption saved",
                "date": obj.date.isoformat(),
                "equipment_id": obj.equipment_id,
                "power_kwh": obj.power_kwh,
                "water_l": obj.water_l,
                "chemical_kg": obj.chemical_kg,
                "diesel_l": obj.diesel_l,
                "furnace_oil_l": obj.furnace_oil_l,
                "brigade_kg": obj.brigade_kg,
                "steam_kg_hr": obj.steam_kg_hr,
            }
            if warnings:
                payload["warnings"] = warnings
            return Response(payload)
        if type_param == "chemical":
            obj, created = ManualChemicalConsumption.objects.update_or_create(
                date=entry_date,
                defaults={"chemical_kg": float(data.get("chemical_kg") or 0)},
            )
            log_audit_event(
                user=request.user,
                event_type="consumption_updated",
                object_type="chemical_consumption",
                object_id=obj.date.isoformat(),
                field_name="updated" if not created else "created",
            )
            return Response({"date": obj.date.isoformat(), "chemical_kg": obj.chemical_kg})
        return Response({"error": "type must be chiller, boiler, or chemical"}, status=status.HTTP_400_BAD_REQUEST)

    # GET
    start_date, end_date, err = _parse_daily_consumption_dates(request)
    if err is not None:
        return err
    equipment_id = (request.query_params.get("equipment_id") or "").strip() or None
    type_param = (request.query_params.get("type") or "").strip().lower() or None

    if start_date > end_date:
        return Response(
            {"error": "date_from must be before or equal to date_to"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if (end_date - start_date).days >= DAILY_CONSUMPTION_MAX_DAYS:
        return Response(
            {"error": f"Date range must not exceed {DAILY_CONSUMPTION_MAX_DAYS} days"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    all_dates = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]
    result = {}

    # Chiller: merge manual over log-aggregated, one row per date for selected equipment
    if type_param is None or type_param == "chiller":
        try:
            from chiller_logs.models import ChillerLog

            manual_by_date = {}
            if equipment_id:
                for m in ManualChillerConsumption.objects.filter(
                    equipment_id=equipment_id,
                    date__gte=start_date,
                    date__lte=end_date,
                ):
                    manual_by_date[m.date] = m

            log_qs = ChillerLog.objects.filter(
                status="approved",
                timestamp__date__gte=start_date,
                timestamp__date__lte=end_date,
            )
            if equipment_id:
                log_qs = log_qs.filter(equipment_id=equipment_id)
            log_rows = list(
                log_qs.values("equipment_id", "timestamp__date")
                .annotate(
                    power_kwh=Sum("starter_energy_kwh"),
                    water_ct1_l=Sum("daily_water_consumption_ct1_liters"),
                    water_ct2_l=Sum("daily_water_consumption_ct2_liters"),
                    water_ct3_l=Sum("daily_water_consumption_ct3_liters"),
                )
            )
            log_by_date = {(row["equipment_id"], row["timestamp__date"]): row for row in log_rows}

            chiller_list = []
            for d in all_dates:
                eid = equipment_id
                if eid and d in manual_by_date:
                    m = manual_by_date[d]
                    chiller_list.append({
                        "date": d.isoformat(),
                        "equipment_id": m.equipment_id,
                        "equipment_number": m.equipment_id,
                        "power_kwh": round(m.power_kwh, 2),
                        "water_ct1_l": round(m.water_ct1_l, 2),
                        "water_ct2_l": round(m.water_ct2_l, 2),
                        "water_ct3_l": round(m.water_ct3_l, 2),
                        "chemical_ct1_kg": round(m.chemical_ct1_kg, 2),
                        "chemical_ct2_kg": round(m.chemical_ct2_kg, 2),
                        "chemical_ct3_kg": round(m.chemical_ct3_kg, 2),
                    })
                elif eid and (eid, d) in log_by_date:
                    row = log_by_date[(eid, d)]
                    chiller_list.append({
                        "date": d.isoformat(),
                        "equipment_id": row["equipment_id"],
                        "equipment_number": row["equipment_id"],
                        "power_kwh": round(float(row["power_kwh"] or 0), 2),
                        "water_ct1_l": round(float(row["water_ct1_l"] or 0), 2),
                        "water_ct2_l": round(float(row["water_ct2_l"] or 0), 2),
                        "water_ct3_l": round(float(row["water_ct3_l"] or 0), 2),
                        "chemical_ct1_kg": 0,
                        "chemical_ct2_kg": 0,
                        "chemical_ct3_kg": 0,
                    })
                elif eid:
                    chiller_list.append({
                        "date": d.isoformat(),
                        "equipment_id": eid,
                        "equipment_number": eid,
                        "power_kwh": 0,
                        "water_ct1_l": 0,
                        "water_ct2_l": 0,
                        "water_ct3_l": 0,
                        "chemical_ct1_kg": 0,
                        "chemical_ct2_kg": 0,
                        "chemical_ct3_kg": 0,
                    })
            if not equipment_id:
                chiller_list = []
                for row in log_rows:
                    d = row["timestamp__date"]
                    eid = row["equipment_id"]
                    chiller_list.append({
                        "date": d.isoformat(),
                        "equipment_id": eid,
                        "equipment_number": eid,
                        "power_kwh": round(float(row["power_kwh"] or 0), 2),
                        "water_ct1_l": round(float(row["water_ct1_l"] or 0), 2),
                        "water_ct2_l": round(float(row["water_ct2_l"] or 0), 2),
                        "water_ct3_l": round(float(row["water_ct3_l"] or 0), 2),
                        "chemical_ct1_kg": 0,
                        "chemical_ct2_kg": 0,
                        "chemical_ct3_kg": 0,
                    })
                chiller_by_key = {(r["equipment_id"], r["date"]): r for r in chiller_list}
                for m in ManualChillerConsumption.objects.filter(date__gte=start_date, date__lte=end_date):
                    chiller_by_key[(m.equipment_id, m.date.isoformat())] = {
                        "date": m.date.isoformat(),
                        "equipment_id": m.equipment_id,
                        "equipment_number": m.equipment_id,
                        "power_kwh": round(m.power_kwh, 2),
                        "water_ct1_l": round(m.water_ct1_l, 2),
                        "water_ct2_l": round(m.water_ct2_l, 2),
                        "water_ct3_l": round(m.water_ct3_l, 2),
                        "chemical_ct1_kg": round(m.chemical_ct1_kg, 2),
                        "chemical_ct2_kg": round(m.chemical_ct2_kg, 2),
                        "chemical_ct3_kg": round(m.chemical_ct3_kg, 2),
                    }
                chiller_list = list(chiller_by_key.values())
                chiller_list.sort(key=lambda r: (r["equipment_id"], r["date"]))
            result["chiller"] = chiller_list
        except Exception:
            result["chiller"] = []

    # Boiler: merge manual over log-aggregated, one row per date for selected equipment
    if type_param is None or type_param == "boiler":
        try:
            from boiler_logs.models import BoilerLog

            manual_by_date = {}
            if equipment_id:
                for m in ManualBoilerConsumption.objects.filter(
                    equipment_id=equipment_id,
                    date__gte=start_date,
                    date__lte=end_date,
                ):
                    manual_by_date[m.date] = m

            log_qs = BoilerLog.objects.filter(
                timestamp__date__gte=start_date,
                timestamp__date__lte=end_date,
            )
            if equipment_id:
                log_qs = log_qs.filter(equipment_id=equipment_id)
            log_rows = list(
                log_qs.values("equipment_id", "timestamp__date")
                .annotate(
                    power_kwh=Sum("daily_power_consumption_kwh"),
                    water_l=Sum("daily_water_consumption_liters"),
                    chemical_kg=Sum("daily_chemical_consumption_kg"),
                    diesel_l=Sum("daily_diesel_consumption_liters"),
                    furnace_oil_l=Sum("daily_furnace_oil_consumption_liters"),
                    brigade_kg=Sum("daily_brigade_consumption_kg"),
                    steam_kg_hr=Sum("steam_consumption_kg_hr"),
                )
            )
            log_by_date = {(row["equipment_id"], row["timestamp__date"]): row for row in log_rows}

            boiler_list = []
            for d in all_dates:
                eid = equipment_id
                if eid and d in manual_by_date:
                    m = manual_by_date[d]
                    boiler_list.append({
                        "date": d.isoformat(),
                        "equipment_id": m.equipment_id,
                        "equipment_number": m.equipment_id,
                        "power_kwh": round(m.power_kwh, 2),
                        "water_l": round(m.water_l, 2),
                        "chemical_kg": round(m.chemical_kg, 2),
                        "diesel_l": round(m.diesel_l, 2),
                        "furnace_oil_l": round(m.furnace_oil_l, 2),
                        "brigade_kg": round(m.brigade_kg, 2),
                        "steam_kg_hr": round(m.steam_kg_hr, 2),
                    })
                elif eid and (eid, d) in log_by_date:
                    row = log_by_date[(eid, d)]
                    boiler_list.append({
                        "date": d.isoformat(),
                        "equipment_id": row["equipment_id"],
                        "equipment_number": row["equipment_id"],
                        "power_kwh": round(float(row["power_kwh"] or 0), 2),
                        "water_l": round(float(row["water_l"] or 0), 2),
                        "chemical_kg": round(float(row["chemical_kg"] or 0), 2),
                        "diesel_l": round(float(row["diesel_l"] or 0), 2),
                        "furnace_oil_l": round(float(row["furnace_oil_l"] or 0), 2),
                        "brigade_kg": round(float(row["brigade_kg"] or 0), 2),
                        "steam_kg_hr": round(float(row["steam_kg_hr"] or 0), 2),
                    })
                elif eid:
                    boiler_list.append({
                        "date": d.isoformat(),
                        "equipment_id": eid,
                        "equipment_number": eid,
                        "power_kwh": 0,
                        "water_l": 0,
                        "chemical_kg": 0,
                        "diesel_l": 0,
                        "furnace_oil_l": 0,
                        "brigade_kg": 0,
                        "steam_kg_hr": 0,
                    })
            if not equipment_id:
                boiler_list = []
                for row in log_rows:
                    d = row["timestamp__date"]
                    boiler_list.append({
                        "date": d.isoformat(),
                        "equipment_id": row["equipment_id"],
                        "equipment_number": row["equipment_id"],
                        "power_kwh": round(float(row["power_kwh"] or 0), 2),
                        "water_l": round(float(row["water_l"] or 0), 2),
                        "chemical_kg": round(float(row["chemical_kg"] or 0), 2),
                        "diesel_l": round(float(row["diesel_l"] or 0), 2),
                        "furnace_oil_l": round(float(row["furnace_oil_l"] or 0), 2),
                        "brigade_kg": round(float(row["brigade_kg"] or 0), 2),
                        "steam_kg_hr": round(float(row["steam_kg_hr"] or 0), 2),
                    })
                boiler_by_key = {(r["equipment_id"], r["date"]): r for r in boiler_list}
                for m in ManualBoilerConsumption.objects.filter(date__gte=start_date, date__lte=end_date):
                    boiler_by_key[(m.equipment_id, m.date.isoformat())] = {
                        "date": m.date.isoformat(),
                        "equipment_id": m.equipment_id,
                        "equipment_number": m.equipment_id,
                        "power_kwh": round(m.power_kwh, 2),
                        "water_l": round(m.water_l, 2),
                        "chemical_kg": round(m.chemical_kg, 2),
                        "diesel_l": round(m.diesel_l, 2),
                        "furnace_oil_l": round(m.furnace_oil_l, 2),
                        "brigade_kg": round(m.brigade_kg, 2),
                        "steam_kg_hr": round(m.steam_kg_hr, 2),
                    }
                boiler_list = list(boiler_by_key.values())
                boiler_list.sort(key=lambda r: (r["equipment_id"], r["date"]))
            result["boiler"] = boiler_list
        except Exception:
            result["boiler"] = []

    # Chemical: merge manual with log-aggregated, one row per date
    if type_param is None or type_param == "chemical":
        try:
            from chemical_prep.models import ChemicalPreparation

            manual_by_date = {m.date: m for m in ManualChemicalConsumption.objects.filter(
                date__gte=start_date,
                date__lte=end_date,
            )}

            log_qs = (
                ChemicalPreparation.objects.filter(
                    status="approved",
                    timestamp__date__gte=start_date,
                    timestamp__date__lte=end_date,
                )
                .exclude(chemical_qty__isnull=True)
                .exclude(chemical_qty=0)
                .values("timestamp__date")
                .annotate(total_g=Sum("chemical_qty"))
            )
            log_by_date = {row["timestamp__date"]: row for row in log_qs}

            chemical_list = []
            for d in all_dates:
                if d in manual_by_date:
                    m = manual_by_date[d]
                    chemical_list.append({"date": d.isoformat(), "chemical_kg": round(m.chemical_kg, 2)})
                elif d in log_by_date:
                    row = log_by_date[d]
                    chemical_list.append({
                        "date": d.isoformat(),
                        "chemical_kg": round(float(row["total_g"] or 0) / 1000.0, 2),
                    })
                else:
                    chemical_list.append({"date": d.isoformat(), "chemical_kg": 0})
            result["chemical"] = chemical_list
        except Exception:
            result["chemical"] = []

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
                "t1": log.evap_entering_water_temp,
                "t2": log.evap_leaving_water_temp,
                "p1": getattr(log, "evap_water_inlet_pressure", None),
                "p2": getattr(log, "evap_water_outlet_pressure", None),
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
