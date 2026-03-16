from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from datetime import datetime, timedelta, date
import calendar
from django.db import models
from django.utils import timezone
from core.log_slot_utils import get_interval_for_equipment, get_slot_range, compute_slot_status
from equipment.models import EquipmentCategory
from .models import Chemical, ChemicalStock, ChemicalPreparation, ChemicalAssignment, ChemicalDashboardConfig
from .serializers import (
    ChemicalSerializer,
    ChemicalStockSerializer,
    ChemicalAssignmentSerializer,
    ChemicalPreparationSerializer,
)
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrManager
from reports.utils import log_limit_change, log_audit_event
from collections import defaultdict


def _resolve_chemical_for_cost(chemical_name):
    """
    Resolve Chemical from display name (e.g. 'NaOH - Sodium Hydroxide') for cost lookup.
    Tries exact name match, then 'formula - name' split to match formula and name.
    """
    if not chemical_name or not str(chemical_name).strip():
        return None
    name = str(chemical_name).strip()
    chem = Chemical.objects.filter(name=name, is_active=True).first()
    if chem:
        return chem
    if " – " in name or " - " in name:
        sep = " – " if " – " in name else " - "
        parts = name.split(sep, 1)
        if len(parts) == 2:
            formula, rest = parts[0].strip(), parts[1].strip()
            chem = Chemical.objects.filter(
                formula__iexact=formula, name__icontains=rest, is_active=True
            ).first()
            if chem:
                return chem
            chem = Chemical.objects.filter(name__icontains=rest, is_active=True).first()
            if chem:
                return chem
    return None


def _chemical_totals_for_queryset(qs):
    """Given a queryset of ChemicalPreparation, return (total_consumption_kg, total_cost_rs)."""
    groups = defaultdict(lambda: {"qty_g": 0.0, "chemical_id": None, "chemical_name": ""})
    for prep in qs.select_related("chemical").only(
        "chemical_id", "chemical_name", "chemical_qty"
    ):
        if prep.chemical_id:
            key = ("id", str(prep.chemical_id))
            display_name = prep.chemical.name if prep.chemical else (prep.chemical_name or "—")
        else:
            name_key = (prep.chemical_name or "").strip() or "—"
            key = ("name", name_key)
            display_name = name_key
        groups[key]["qty_g"] += float(prep.chemical_qty or 0)
        groups[key]["chemical_id"] = str(prep.chemical_id) if prep.chemical_id else None
        groups[key]["chemical_name"] = display_name
    total_consumption_kg = 0.0
    total_cost_rs = 0.0
    for (_kt, _kv), data in groups.items():
        consumption_kg = round(data["qty_g"] / 1000.0, 4)
        total_consumption_kg += consumption_kg
        cid = data["chemical_id"]
        if cid:
            stock = (
                ChemicalStock.objects.filter(chemical_id=cid)
                .order_by("-updated_at")
                .first()
            )
            if stock and stock.price_per_unit is not None:
                total_cost_rs += round(consumption_kg * float(stock.price_per_unit), 2)
        else:
            chem = _resolve_chemical_for_cost(data["chemical_name"])
            if chem:
                stock = (
                    ChemicalStock.objects.filter(chemical=chem)
                    .order_by("-updated_at")
                    .first()
                )
                if stock and stock.price_per_unit is not None:
                    total_cost_rs += round(consumption_kg * float(stock.price_per_unit), 2)
    return (round(total_consumption_kg, 2), round(total_cost_rs, 2))


def _projected_totals_from_stock(equipment_name=None):
    """
    Derive projected consumption (kg) and projected cost (Rs)
    from current chemical stock, optionally filtered by equipment.

    Business rule:
    - For each ChemicalStock entry, use available_qty_kg as projected quantity.
    - Projected cost = available_qty_kg * price_per_unit (when price is set).
    - When equipment_name is provided, restrict to chemicals assigned to that equipment.
    """
    stock_qs = ChemicalStock.objects.select_related("chemical")
    if equipment_name:
        chem_ids = ChemicalAssignment.objects.filter(
            equipment_name__iexact=equipment_name
        ).values_list("chemical_id", flat=True)
        stock_qs = stock_qs.filter(chemical_id__in=list(chem_ids))

    total_qty_kg = 0.0
    total_cost_rs = 0.0
    for stock in stock_qs:
        qty_kg = float(stock.available_qty_kg or 0.0)
        total_qty_kg += qty_kg
        if stock.price_per_unit is not None:
            total_cost_rs += qty_kg * float(stock.price_per_unit)

    return round(total_qty_kg, 2), round(total_cost_rs, 2)


def get_available_stock_for_chemical(chemical_id):
    """
    Compute available stock for a chemical: initial stock (from ChemicalStock) minus
    total consumed from all ChemicalPreparation entries (approved, pending, draft).
    Returns (available_qty_kg, unit, price_per_unit from latest stock).
    """
    try:
        chemical = Chemical.objects.get(id=chemical_id)
    except (Chemical.DoesNotExist, ValueError, TypeError):
        return (0.0, "kg", None)

    initial = (
        ChemicalStock.objects.filter(chemical_id=chemical_id).aggregate(
            total=models.Sum("available_qty_kg")
        )["total"]
        or 0.0
    )
    consumed_g = (
        ChemicalPreparation.objects.filter(
            chemical_id=chemical_id,
            status__in=["approved", "pending", "draft"],
        )
        .exclude(chemical_qty__isnull=True)
        .aggregate(total=models.Sum("chemical_qty"))["total"]
        or 0.0
    )
    consumed_kg = float(consumed_g) / 1000.0
    available_kg = max(0.0, float(initial) - consumed_kg)

    latest_stock = (
        ChemicalStock.objects.filter(chemical_id=chemical_id)
        .order_by("-updated_at")
        .first()
    )
    unit = (latest_stock.unit if latest_stock else "kg") or "kg"
    price = latest_stock.price_per_unit if latest_stock else None

    return (round(available_kg, 2), unit, price)


class ChemicalViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for chemical master data."""

    permission_classes = [IsAuthenticated]
    serializer_class = ChemicalSerializer
    queryset = Chemical.objects.filter(is_active=True).order_by("location", "name")


def _normalize_location(value):
    """Map user input to Chemical.LOCATION_CHOICES value."""
    if not value or not str(value).strip():
        return None
    v = str(value).strip().lower()
    if v in ("water_system", "water system", "water"):
        return "water_system"
    if v in ("cooling_towers", "cooling towers", "cooling"):
        return "cooling_towers"
    if v in ("boiler", "boilers"):
        return "boiler"
    return None


def _location_from_equipment_category(category_name):
    """
    Map EquipmentCategory name to Chemical.LOCATION_CHOICES value.
    Returns one of water_system, cooling_towers, boiler; defaults to water_system if no match.
    """
    if not category_name or not str(category_name).strip():
        return "water_system"
    v = str(category_name).strip().lower()
    if v in ("boiler", "boilers"):
        return "boiler"
    if v in ("cooling_towers", "cooling towers", "cooling"):
        return "cooling_towers"
    if v in ("water_system", "water system", "water"):
        return "water_system"
    return "water_system"


class ChemicalStockViewSet(viewsets.ModelViewSet):
    """Chemical stock and pricing. List/retrieve for all; create via create_entry; update/destroy for admin."""

    serializer_class = ChemicalStockSerializer
    queryset = ChemicalStock.objects.select_related("chemical").all()

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsSuperAdminOrManager()]
        if self.action == "create":
            return [IsAuthenticated(), IsSuperAdminOrManager()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        """Force use of create_entry action; standard create not used."""
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed("POST", detail="Use POST /chemical-stock/create_entry/ to create entries.")

    def get_queryset(self):
        qs = super().get_queryset()
        chemical_id = self.request.query_params.get("chemical")
        if chemical_id:
            qs = qs.filter(chemical_id=chemical_id)
        location = self.request.query_params.get("location")
        if location:
            qs = qs.filter(chemical__location=location)
        return qs

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        """
        GET ?chemical=<uuid>
        Returns computed available stock for the chemical: initial stock minus all logged consumption.
        """
        chemical_id = (request.query_params.get("chemical") or "").strip() or None
        if not chemical_id:
            return Response(
                {"error": "chemical query parameter (UUID) is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        available_kg, unit, price_per_unit = get_available_stock_for_chemical(chemical_id)
        return Response({
            "available_qty_kg": available_kg,
            "unit": unit,
            "price_per_unit": price_per_unit,
        })

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsSuperAdminOrManager])
    def create_entry(self, request):
        """
        Create a new chemical stock entry from manual fields.
        Accepts: category_id (equipment category id) or location, chemical_name, chemical_formula, stock, price, site.
        When category_id is provided, it is resolved to Chemical location via equipment category name.
        Creates or reuses Chemical master, then creates ChemicalStock.
        """
        category_id = (request.data.get("category_id") or "").strip() or None
        location_raw = (request.data.get("location") or "").strip()
        chemical_name = (request.data.get("chemical_name") or "").strip()
        chemical_formula = (request.data.get("chemical_formula") or "").strip()
        stock_raw = request.data.get("stock")
        price_raw = request.data.get("price")
        site = (request.data.get("site") or "").strip() or None

        if not chemical_name:
            raise ValidationError({"chemical_name": "Chemical name is required."})

        if category_id:
            try:
                cat = EquipmentCategory.objects.get(id=category_id)
                location = _location_from_equipment_category(cat.name)
            except (EquipmentCategory.DoesNotExist, ValueError, TypeError):
                raise ValidationError({"category_id": "Invalid equipment category."})
        else:
            location = _normalize_location(location_raw)
            if not location:
                raise ValidationError({
                    "location": "Category or location is required. Provide category_id or location (Water system, Cooling towers, Boiler)."
                })

        try:
            stock = float(stock_raw) if stock_raw is not None and str(stock_raw).strip() != "" else 0.0
        except (TypeError, ValueError):
            stock = 0.0
        if stock < 0:
            raise ValidationError({"stock": "Stock must be >= 0."})

        try:
            price = float(price_raw) if price_raw is not None and str(price_raw).strip() != "" else None
        except (TypeError, ValueError):
            price = None
        if price is not None and price < 0:
            raise ValidationError({"price": "Price must be >= 0."})

        chemical, _ = Chemical.objects.get_or_create(
            location=location,
            formula=chemical_formula or "",
            name=chemical_name,
            defaults={"is_active": True},
        )
        stock_entry = ChemicalStock.objects.create(
            chemical=chemical,
            available_qty_kg=stock,
            unit="kg",
            price_per_unit=price,
            site=site,
        )
        serializer = self.get_serializer(stock_entry)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ChemicalAssignmentViewSet(viewsets.ModelViewSet):
    """Manage assignments of chemicals to equipment. Create/update/delete only admin/super_admin."""

    serializer_class = ChemicalAssignmentSerializer
    queryset = ChemicalAssignment.objects.select_related(
        "chemical", "created_by", "approved_by", "rejected_by"
    ).all()

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsSuperAdminOrManager()]
        if self.action == "approve":
            return [IsAuthenticated(), IsSuperAdminOrManager()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        chemical_id = self.request.query_params.get("chemical")
        if chemical_id:
            qs = qs.filter(chemical_id=chemical_id)
        equipment_name = self.request.query_params.get("equipment_name")
        if equipment_name:
            qs = qs.filter(equipment_name__icontains=equipment_name)
        return qs

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve or reject an assignment. Creator (done by) cannot approve/reject."""
        assignment = self.get_object()
        action_type = (request.data.get("action") or "approve").lower()
        remarks = (request.data.get("remarks") or "").strip()

        if assignment.created_by_id and assignment.created_by_id == request.user.id:
            return Response(
                {"error": "The assignment must be approved or rejected by a different user than the creator (Created by)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action_type == "reject":
            if not remarks:
                raise ValidationError({"remarks": ["Comment is required when rejecting."]})
            if assignment.status not in ("pending",):
                return Response(
                    {"error": "Only pending assignments can be rejected."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            assignment.status = "rejected"
            assignment.rejected_by = request.user
            assignment.rejected_at = timezone.now()
            assignment.rejection_comment = remarks
            assignment.approved_by = None
            assignment.approved_at = None
            assignment.save(update_fields=["status", "rejected_by", "rejected_at", "rejection_comment", "approved_by", "approved_at"])
        elif action_type == "approve":
            if assignment.status != "pending":
                return Response(
                    {"error": "Only pending assignments can be approved."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            assignment.status = "approved"
            assignment.approved_by = request.user
            assignment.approved_at = timezone.now()
            assignment.rejected_by = None
            assignment.rejected_at = None
            assignment.rejection_comment = None
            assignment.save(update_fields=["status", "approved_by", "approved_at", "rejected_by", "rejected_at", "rejection_comment"])
        else:
            return Response(
                {"error": 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(assignment)
        return Response(serializer.data)


class ChemicalPreparationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing chemical preparations."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChemicalPreparationSerializer
    queryset = ChemicalPreparation.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action != "list":
            return qs
        equipment_name = self.request.query_params.get("equipment_name")
        if equipment_name:
            qs = qs.filter(equipment_name__iexact=equipment_name)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(timestamp__gte=dt)
            except (ValueError, TypeError):
                pass
        if date_to:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(timestamp__lte=dt)
            except (ValueError, TypeError):
                pass
        return qs.order_by("-timestamp")

    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """
        Set operator when creating a preparation and enforce stock availability.

        Business rule: when a chemical preparation is logged with a chemical and
        chemical quantity, ensure there is enough ChemicalStock available.
        """
        validated = dict(serializer.validated_data)
        equipment_name = validated.get("equipment_name")
        timestamp = validated.get("timestamp") or timezone.now()
        if equipment_name is not None:
            base_qs = ChemicalPreparation.objects.filter(equipment_name=equipment_name)
            last_log = base_qs.order_by('-timestamp').first()
            last_time = last_log.timestamp if last_log is not None else None
            slot_info = compute_slot_status(equipment_name or "", "chemical", timestamp, last_time=last_time)
            slot_start = slot_info["slot_start"]
            slot_end = slot_info["slot_end"]
            tolerance_end = slot_info["tolerance_end"]
            status = slot_info["status"]

            if status == "interval":
                if base_qs.filter(timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
                    raise ValidationError(
                        {"detail": ["An entry for this equipment already exists for this time slot."]}
                    )
            elif status == "tolerance" and tolerance_end is not None:
                if base_qs.filter(timestamp__gte=slot_end, timestamp__lte=tolerance_end).exists():
                    raise ValidationError(
                        {"detail": ["An entry for this equipment already exists for this time slot."]}
                    )
        chemical = validated.get("chemical")
        chemical_name = validated.get("chemical_name")
        requested_qty_g = validated.get("chemical_qty")

        # If chemical FK is not provided but name is, try to resolve from master
        if chemical is None and chemical_name:
            chemical = Chemical.objects.filter(
                name=chemical_name, is_active=True
            ).first()

        if chemical is not None and requested_qty_g is not None:
            # chemical_qty is stored in grams; convert to kilograms for stock check
            requested_qty_kg = requested_qty_g / 1000.0
            total_available = (
                ChemicalStock.objects.filter(chemical=chemical)
                .aggregate(total=models.Sum("available_qty_kg"))
                .get("total")
                or 0.0
            )
            if requested_qty_kg > total_available:
                raise ValidationError(
                    {
                        "chemical_qty": [
                            f"Not enough stock available for {chemical.name}; "
                            f"available: {total_available:.3f} kg, "
                            f"requested: {requested_qty_kg:.3f} kg."
                        ]
                    }
                )

        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
        )
        log_audit_event(
            user=self.request.user,
            event_type="log_created",
            object_type="chemical_log",
            object_id=str(log.id),
            field_name="created",
            new_value=timezone.localtime(log.timestamp).isoformat() if log.timestamp else None,
        )

    def perform_destroy(self, instance):
        """Record log_deleted in audit trail before deleting."""
        log_audit_event(
            user=self.request.user,
            event_type="log_deleted",
            object_type="chemical_log",
            object_id=str(instance.id),
            field_name="deleted",
            new_value=timezone.localtime(timezone.now()).isoformat(),
        )
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        """
        Record chemical preparation field changes in the audit trail on update.
        """
        instance = self.get_object()
        tracked_fields = [
            'equipment_name',
            'chemical_name',
            'chemical_category',
            'chemical_percent',
            'chemical_concentration',
            'solution_concentration',
            'water_qty',
            'chemical_qty',
            'batch_no',
            'done_by',
            'remarks',
            'comment',
            'checked_by',
            'timestamp',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        updated = self.get_object()
        user = request.user
        from django.utils import timezone

        extra_base = {
            "equipment_name": updated.equipment_name,
            "chemical_name": updated.chemical_name,
            "timestamp": timezone.localtime(updated.timestamp).isoformat() if updated.timestamp else None,
        }

        for field in tracked_fields:
            before = old_values.get(field)
            after = getattr(updated, field)
            if before == after:
                continue
            extra = dict(extra_base)
            extra["field_label"] = field
            log_limit_change(
                user=user,
                object_type="chemical_log",
                key=str(updated.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_update",
            )

        # When a rejected entry is corrected (updated), move to pending secondary approval
        if instance.status == 'rejected':
            updated.status = 'pending_secondary_approval'
            updated.save(update_fields=['status'])

        return response

    def partial_update(self, request, *args, **kwargs):
        """
        Record chemical preparation field changes in the audit trail on partial update.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="equipment_names")
    def equipment_names(self, request):
        """
        GET Returns distinct equipment names for dashboard dropdown: from approved
        chemical assignments and from approved preparations. Only approved equipments are shown.
        """
        # Equipment from approved chemical assignments only (so dropdown shows only approved equipment)
        from_assignments = set(
            ChemicalAssignment.objects.filter(is_active=True, status="approved")
            .exclude(equipment_name__isnull=True)
            .exclude(equipment_name="")
            .values_list("equipment_name", flat=True)
            .distinct()
        )
        # Equipment from approved preparations (in case logs exist without assignment)
        from_preparations = set(
            ChemicalPreparation.objects.filter(status="approved")
            .exclude(equipment_name__isnull=True)
            .exclude(equipment_name="")
            .values_list("equipment_name", flat=True)
            .distinct()
        )
        names = sorted(from_assignments | from_preparations)
        return Response({"equipment_names": names})

    @action(detail=False, methods=["get"], url_path="dashboard_summary")
    def dashboard_summary(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_name=...
        Returns by_chemical (consumption kg, cost Rs), totals, optional projected.
        """
        period_type = (request.query_params.get("period_type") or "month").lower()
        if period_type not in ("day", "month", "year"):
            return Response(
                {"error": "period_type must be day, month, or year"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        date_str = request.query_params.get("date")
        if not date_str:
            return Response(
                {"error": "date is required (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ref_date = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "date must be YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        equipment_name = (request.query_params.get("equipment_name") or "").strip() or None

        if period_type == "day":
            period_start = timezone.make_aware(
                datetime.combine(ref_date, datetime.min.time())
            )
            period_end = timezone.make_aware(
                datetime.combine(
                    ref_date,
                    datetime.max.time().replace(microsecond=999999),
                )
            )
            days_in_period = 1
        elif period_type == "month":
            _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
            period_start = timezone.make_aware(
                datetime(ref_date.year, ref_date.month, 1)
            )
            period_end = timezone.make_aware(
                datetime(
                    ref_date.year,
                    ref_date.month,
                    last_day,
                    23,
                    59,
                    59,
                    999999,
                )
            )
            days_in_period = last_day
        else:
            period_start = timezone.make_aware(datetime(ref_date.year, 1, 1))
            period_end = timezone.make_aware(
                datetime(
                    ref_date.year,
                    12,
                    31,
                    23,
                    59,
                    59,
                    999999,
                )
            )
            days_in_period = 366 if calendar.isleap(ref_date.year) else 365

        qs = ChemicalPreparation.objects.filter(
            timestamp__gte=period_start,
            timestamp__lte=period_end,
            status__in=["approved", "pending", "draft"],
        ).exclude(chemical_qty__isnull=True).exclude(chemical_qty=0)
        if equipment_name:
            qs = qs.filter(equipment_name__iexact=equipment_name)

        groups = defaultdict(lambda: {"qty_g": 0.0, "chemical_id": None, "chemical_name": ""})

        for prep in qs.select_related("chemical").only(
            "chemical_id", "chemical_name", "chemical_qty"
        ):
            if prep.chemical_id:
                key = ("id", str(prep.chemical_id))
                display_name = prep.chemical.name if prep.chemical else (prep.chemical_name or "—")
            else:
                name_key = (prep.chemical_name or "").strip() or "—"
                key = ("name", name_key)
                display_name = name_key
            groups[key]["qty_g"] += float(prep.chemical_qty or 0)
            groups[key]["chemical_id"] = str(prep.chemical_id) if prep.chemical_id else None
            groups[key]["chemical_name"] = display_name

        by_chemical = []
        total_consumption_kg = 0.0
        total_cost_rs = 0.0

        for (_key_type, key_val), data in groups.items():
            consumption_kg = round(data["qty_g"] / 1000.0, 4)
            total_consumption_kg += consumption_kg
            cost_rs = None
            cid = data["chemical_id"]
            if cid:
                stock = (
                    ChemicalStock.objects.filter(chemical_id=cid)
                    .order_by("-updated_at")
                    .first()
                )
                if stock and stock.price_per_unit is not None:
                    cost_rs = round(consumption_kg * float(stock.price_per_unit), 2)
                    total_cost_rs += cost_rs
            else:
                chem = _resolve_chemical_for_cost(data["chemical_name"])
                if chem:
                    stock = (
                        ChemicalStock.objects.filter(chemical=chem)
                        .order_by("-updated_at")
                        .first()
                    )
                    if stock and stock.price_per_unit is not None:
                        cost_rs = round(consumption_kg * float(stock.price_per_unit), 2)
                        total_cost_rs += cost_rs

            by_chemical.append({
                "chemical_id": data["chemical_id"],
                "chemical_name": data["chemical_name"] or "—",
                "consumption_kg": consumption_kg,
                "cost_rs": cost_rs,
            })

        by_chemical.sort(key=lambda x: (-(x["consumption_kg"] or 0), x["chemical_name"]))

        payload = {
            "period_type": period_type,
            "period_start": period_start.date().isoformat(),
            "period_end": period_end.date().isoformat(),
            "days_in_period": days_in_period,
            "by_chemical": by_chemical,
            "total_consumption_kg": round(total_consumption_kg, 2),
            "total_cost_rs": round(total_cost_rs, 2),
        }

        projected_qty_kg, projected_cost_rs = _projected_totals_from_stock(
            equipment_name=equipment_name
        )
        if projected_qty_kg:
            payload["projected_consumption_kg"] = projected_qty_kg
        if projected_cost_rs:
            payload["projected_cost_rs"] = projected_cost_rs

        return Response(payload)

    @action(detail=False, methods=["get"], url_path="dashboard_series")
    def dashboard_series(self, request):
        """
        GET ?period_type=day|month|year&date=YYYY-MM-DD&equipment_name=...&days=1
        Returns time series for charts: actual vs projected consumption and cost.
        """
        period_type = (request.query_params.get("period_type") or "day").lower()
        if period_type not in ("day", "month", "year"):
            return Response(
                {"error": "period_type must be day, month, or year"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        date_str = request.query_params.get("date")
        if not date_str:
            return Response(
                {"error": "date is required (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ref_date = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "date must be YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        equipment_name = (request.query_params.get("equipment_name") or "").strip() or None
        days_param = request.query_params.get("days")
        series_days = int(days_param) if days_param and str(days_param).isdigit() else 1
        series_days = max(1, min(31, series_days))

        proj_total_qty_kg, proj_total_cost_rs = _projected_totals_from_stock(
            equipment_name=equipment_name
        )

        series = []
        try:
            if period_type == "day":
                for i in range(series_days - 1, -1, -1):
                    d = ref_date - timedelta(days=i)
                    day_start = timezone.make_aware(datetime.combine(d, datetime.min.time()))
                    day_end = timezone.make_aware(
                        datetime.combine(d, datetime.max.time().replace(microsecond=999999))
                    )
                    qs = (
                        ChemicalPreparation.objects.filter(
                            timestamp__gte=day_start,
                            timestamp__lte=day_end,
                            status__in=["approved", "pending", "draft"],
                        )
                        .exclude(chemical_qty__isnull=True)
                        .exclude(chemical_qty=0)
                    )
                    if equipment_name:
                        qs = qs.filter(equipment_name__iexact=equipment_name)
                    actual_kg, actual_rs = _chemical_totals_for_queryset(qs)
                    series.append({
                        "date": d.isoformat(),
                        "label": d.strftime("%d %b"),
                        "actual_consumption_kg": actual_kg,
                    "projected_consumption_kg": proj_total_qty_kg,
                        "actual_cost_rs": actual_rs,
                    "projected_cost_rs": proj_total_cost_rs,
                    })
            elif period_type == "month":
                # Only the selected month (one point)
                _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
                start_d = date(ref_date.year, ref_date.month, 1)
                end_d = date(ref_date.year, ref_date.month, last_day)
                month_start = timezone.make_aware(datetime.combine(start_d, datetime.min.time()))
                month_end = timezone.make_aware(
                    datetime.combine(
                        end_d,
                        datetime.max.time().replace(microsecond=999999),
                    )
                )
                qs = (
                    ChemicalPreparation.objects.filter(
                        timestamp__gte=month_start,
                        timestamp__lte=month_end,
                        status__in=["approved", "pending", "draft"],
                    )
                    .exclude(chemical_qty__isnull=True)
                    .exclude(chemical_qty=0)
                )
                if equipment_name:
                    qs = qs.filter(equipment_name__iexact=equipment_name)
                actual_kg, actual_rs = _chemical_totals_for_queryset(qs)
                series.append({
                    "date": start_d.isoformat(),
                    "label": start_d.strftime("%b %Y"),
                    "actual_consumption_kg": actual_kg,
                    "projected_consumption_kg": proj_total_qty_kg,
                    "actual_cost_rs": actual_rs,
                    "projected_cost_rs": proj_total_cost_rs,
                })
            else:
                year_start = timezone.make_aware(datetime(ref_date.year, 1, 1))
                year_end = timezone.make_aware(
                    datetime(ref_date.year, 12, 31, 23, 59, 59, 999999)
                )
                qs = (
                    ChemicalPreparation.objects.filter(
                        timestamp__gte=year_start,
                        timestamp__lte=year_end,
                        status__in=["approved", "pending", "draft"],
                    )
                    .exclude(chemical_qty__isnull=True)
                    .exclude(chemical_qty=0)
                )
                if equipment_name:
                    qs = qs.filter(equipment_name__iexact=equipment_name)
                actual_kg, actual_rs = _chemical_totals_for_queryset(qs)
                series.append({
                    "date": date(ref_date.year, 1, 1).isoformat(),
                    "label": str(ref_date.year),
                    "actual_consumption_kg": actual_kg,
                    "projected_consumption_kg": proj_total_qty_kg,
                    "actual_cost_rs": actual_rs,
                    "projected_cost_rs": proj_total_cost_rs,
                })
        except Exception:
            series = []
        return Response({"series": series})

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """
        Create a new chemical preparation entry as a correction of a rejected or pending-secondary-approval entry.
        """
        original = self.get_object()
        if original.status not in ('rejected', 'pending_secondary_approval'):
            return Response(
                {'error': 'Only rejected or pending secondary approval entries can be corrected as new entries.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        timestamp = validated.pop('timestamp', None)

        payload = {
            **validated,
            'corrects': original,
            'operator': request.user,
            'operator_name': request.user.name or request.user.email,
            'equipment_name': original.equipment_name,
            'chemical_name': original.chemical_name,
            'status': 'pending_secondary_approval',
        }
        if timestamp is not None:
            payload['timestamp'] = timestamp

        new_prep = ChemicalPreparation.objects.create(**payload)

        tracked_fields = [
            'equipment_name',
            'chemical_name',
            'chemical_category',
            'chemical_percent',
            'chemical_concentration',
            'solution_concentration',
            'water_qty',
            'chemical_qty',
            'batch_no',
            'done_by',
            'remarks',
            'comment',
            'checked_by',
            'status',
            'timestamp',
        ]
        extra_base = {
            "equipment_name": original.equipment_name,
            "chemical_name": original.chemical_name,
            "original_id": str(original.id),
            "correction_id": str(new_prep.id),
        }
        for field in tracked_fields:
            before = getattr(original, field)
            after = getattr(new_prep, field)
            if before == after:
                continue
            extra = dict(extra_base)
            extra["field_label"] = field
            log_limit_change(
                user=request.user,
                object_type="chemical_log",
                key=str(new_prep.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_correction",
            )

        serializer = self.get_serializer(new_prep)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a chemical preparation. Handles primary, secondary approval (after correction), and reject."""
        prep = self.get_object()
        action_type = request.data.get('action', 'approve')
        remarks = (request.data.get('remarks') or '').strip()
        
        if action_type == 'reject' and not remarks:
            raise ValidationError({'remarks': ['Comment is required when rejecting.']})
        
        if action_type == 'approve':
            # Primary/secondary approver must be different from the operator (Log Book Done By)
            if prep.operator_id and prep.operator_id == request.user.id:
                return Response(
                    {'error': 'The log book entry must be approved by a different user than the operator (Log Book Done By).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if prep.status == 'pending_secondary_approval':
                # Secondary approval must be done by a different person than who rejected
                if prep.approved_by_id and prep.approved_by_id == request.user.id:
                    return Response(
                        {'error': 'A different person must perform secondary approval. The person who rejected cannot approve the corrected entry.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                prep.status = 'approved'
                prep.secondary_approved_by = request.user
                from django.utils import timezone
                prep.secondary_approved_at = timezone.now()
            elif prep.status in ('pending', 'draft'):
                prep.status = 'approved'
            else:
                return Response(
                    {'error': 'Only pending, draft, or pending secondary approval entries can be approved.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif action_type == 'reject':
            # Rejector must be different from the operator (Log Book Done By)
            if prep.operator_id and prep.operator_id == request.user.id:
                return Response(
                    {'error': 'The log book entry must be rejected by a different user than the operator (Log Book Done By).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if prep.status not in ('pending', 'draft', 'pending_secondary_approval'):
                return Response(
                    {'error': 'Only pending, draft, or pending secondary approval entries can be rejected.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            prep.status = 'rejected'
            prep.secondary_approved_by = None
            prep.secondary_approved_at = None
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from django.utils import timezone
        if action_type == 'reject' or (action_type == 'approve' and prep.status == 'approved'):
            prep.approved_by = request.user
            prep.approved_at = timezone.now()
        if remarks:
            prep.comment = remarks
        prep.save()
        
        if action_type == 'approve' and prep.status == 'approved':
            from reports.utils import create_report_entry
            title = f"{prep.chemical_name or 'Chemical Preparation'} - {prep.equipment_name or 'N/A'}"
            create_report_entry(
                report_type='chemical',
                source_id=str(prep.id),
                source_table='chemical_preparations',
                title=title,
                site=prep.equipment_name or 'N/A',
                created_by=prep.checked_by or prep.operator_name or 'Unknown',
                created_at=prep.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(prep)
        return Response(serializer.data)
