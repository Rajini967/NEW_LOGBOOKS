from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from datetime import datetime, timedelta, date
import calendar
from django.db import models
from django.db.models import Q
from django.utils import timezone
from core.log_slot_utils import (
    get_interval_for_equipment,
    get_slot_range,
    compute_slot_status,
    compute_missing_slots_for_day,
    get_slot_day_bounds,
    get_slot_timezone,
)
from equipment.models import EquipmentCategory
from .models import Chemical, ChemicalStock, ChemicalPreparation, ChemicalAssignment, ChemicalDashboardConfig
from .serializers import (
    ChemicalSerializer,
    ChemicalStockSerializer,
    ChemicalAssignmentSerializer,
    ChemicalPreparationSerializer,
)
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrAdmin
from reports.utils import log_limit_change, log_audit_event, save_missing_slots_snapshot
from reports.approval_workflow import (
    ensure_not_operator,
    ensure_secondary_approver_diff,
    ensure_status_allowed,
    normalize_approval_action,
    require_rejection_comment,
)
from collections import defaultdict

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."


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
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
        if self.action == "create":
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
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

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsSuperAdminOrAdmin])
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
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
        if self.action == "approve":
            return [IsAuthenticated(), IsSuperAdminOrAdmin()]
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

    def _chemical_scope_filter(self, chemical_id=None, chemical_name=None):
        if chemical_id:
            return Q(chemical_id=chemical_id)
        chemical_name = (chemical_name or "").strip()
        if chemical_name:
            return Q(chemical__isnull=True) & Q(chemical_name__iexact=chemical_name)
        return Q(chemical__isnull=True) & (Q(chemical_name__isnull=True) | Q(chemical_name=""))
    
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
            chemical_obj = validated.get("chemical")
            chemical_filter = self._chemical_scope_filter(
                chemical_id=(str(chemical_obj.id) if chemical_obj else None),
                chemical_name=validated.get("chemical_name"),
            )
            interval, shift_hours = get_interval_for_equipment(equipment_name or "", "chemical")
            slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
            if base_qs.filter(chemical_filter, timestamp__gte=slot_start, timestamp__lt=slot_end).exists():
                raise ValidationError(
                    {"detail": ["An entry for this equipment and chemical already exists for this time slot."]}
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
            extra={
                "equipment_name": str(log.equipment_name or ""),
                "log_timestamp": timezone.localtime(log.timestamp).isoformat() if log.timestamp else "",
                "log_date": str(log.timestamp.date()) if log.timestamp else "",
            },
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
            extra={
                "equipment_name": str(instance.equipment_name or ""),
                "log_timestamp": timezone.localtime(instance.timestamp).isoformat() if instance.timestamp else "",
                "log_date": str(instance.timestamp.date()) if instance.timestamp else "",
            },
        )
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        """
        Record chemical preparation field changes in the audit trail on update.
        """
        instance = self.get_object()
        if (
            instance.status in ("rejected", "pending_secondary_approval")
            and instance.operator_id
            and instance.operator_id != request.user.id
        ):
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        incoming_timestamp = request.data.get("timestamp")
        if incoming_timestamp:
            try:
                parsed_timestamp = datetime.fromisoformat(str(incoming_timestamp).replace("Z", "+00:00"))
                if timezone.is_naive(parsed_timestamp):
                    parsed_timestamp = timezone.make_aware(parsed_timestamp, timezone.get_current_timezone())
            except ValueError:
                parsed_timestamp = instance.timestamp
        else:
            parsed_timestamp = instance.timestamp
        next_equipment_name = request.data.get("equipment_name") or instance.equipment_name
        next_chemical_id = request.data.get("chemical")
        next_chemical_name = request.data.get("chemical_name")
        if next_chemical_id in (None, ""):
            next_chemical_id = str(instance.chemical_id) if instance.chemical_id else None
        if next_chemical_name in (None, ""):
            next_chemical_name = instance.chemical_name
        interval, shift_hours = get_interval_for_equipment(next_equipment_name or "", "chemical")
        slot_start, slot_end = get_slot_range(parsed_timestamp, interval, shift_hours)
        duplicate_exists = (
            ChemicalPreparation.objects.filter(
                equipment_name=next_equipment_name,
            )
            .filter(
                self._chemical_scope_filter(
                    chemical_id=next_chemical_id,
                    chemical_name=next_chemical_name,
                ),
                timestamp__gte=slot_start,
                timestamp__lt=slot_end,
            )
            .exclude(pk=instance.pk)
            .exists()
        )
        if duplicate_exists:
            raise ValidationError({"detail": ["An entry for this equipment and chemical already exists for this time slot."]})
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
            log_audit_event(
                user=request.user,
                event_type="log_corrected",
                object_type="chemical_log",
                object_id=str(updated.id),
                field_name="status",
                old_value="rejected",
                new_value="pending_secondary_approval",
            )

        return response

    @action(detail=False, methods=['get'], url_path='missing-slots')
    def missing_slots(self, request):
        date_str = (request.query_params.get("date") or "").strip()
        date_from_str = (request.query_params.get("date_from") or "").strip()
        date_to_str = (request.query_params.get("date_to") or "").strip()
        equipment_name_filter = (request.query_params.get("equipment_name") or "").strip()
        range_mode = bool(date_from_str or date_to_str)

        if range_mode and date_str:
            return Response(
                {"error": "Use either date or date_from/date_to, not both."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def parse_day(raw: str, field_name: str):
            try:
                return datetime.strptime(raw[:10], "%Y-%m-%d").date()
            except ValueError:
                raise ValidationError({"error": f"{field_name} must be YYYY-MM-DD"})

        if range_mode:
            if not (date_from_str and date_to_str):
                return Response(
                    {"error": "Both date_from and date_to are required for range mode."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                day_from = parse_day(date_from_str, "date_from")
                day_to = parse_day(date_to_str, "date_to")
            except ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            if day_from > day_to:
                return Response(
                    {"error": "date_from cannot be after date_to."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (day_to - day_from).days > 366:
                return Response(
                    {"error": "Date range too large. Maximum span is 366 days."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            days = [day_from + timedelta(days=i) for i in range((day_to - day_from).days + 1)]
        else:
            if date_str:
                try:
                    day = parse_day(date_str, "date")
                except ValidationError as exc:
                    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            else:
                day = timezone.localdate()
            days = [day]

        slot_tz = get_slot_timezone()
        first_day_start, _ = get_slot_day_bounds(days[0])
        _, last_day_end = get_slot_day_bounds(days[-1])
        range_qs = ChemicalPreparation.objects.filter(timestamp__gte=first_day_start, timestamp__lt=last_day_end)
        if equipment_name_filter:
            range_qs = range_qs.filter(equipment_name=equipment_name_filter)

        timestamps_by_day_equipment = defaultdict(lambda: defaultdict(list))
        daily_last_reading = {}
        active_qs = range_qs.exclude(activity_type__in=["maintenance", "shutdown"])
        for row in active_qs.values("equipment_name", "timestamp"):
            equipment_name = (row.get("equipment_name") or "").strip()
            ts = row.get("timestamp")
            if not equipment_name or ts is None:
                continue
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            timestamps_by_day_equipment[day_key][equipment_name].append(ts)
            prev = daily_last_reading.get((day_key, equipment_name))
            if prev is None or ts > prev:
                daily_last_reading[(day_key, equipment_name)] = ts

        suppressed_by_day = defaultdict(set)
        suppressed_qs = range_qs.filter(
            activity_type__in=["maintenance", "shutdown"],
            status__in=["draft", "pending", "pending_secondary_approval"],
        )
        for row in suppressed_qs.values("equipment_name", "timestamp"):
            equipment_name = (row.get("equipment_name") or "").strip()
            ts = row.get("timestamp")
            if not equipment_name or ts is None:
                continue
            day_key = timezone.localtime(ts, slot_tz).date().isoformat()
            suppressed_by_day[day_key].add(equipment_name)

        equipment_names = set()
        historical_names = set(
            ChemicalPreparation.objects.exclude(equipment_name__isnull=True)
            .exclude(equipment_name="")
            .values_list("equipment_name", flat=True)
            .distinct()
        )
        equipment_names.update(historical_names)
        for day_eq_map in timestamps_by_day_equipment.values():
            equipment_names.update(day_eq_map.keys())
        if equipment_name_filter:
            equipment_names = {equipment_name_filter}

        global_last_reading = {}
        last_qs = ChemicalPreparation.objects.exclude(equipment_name__isnull=True).exclude(equipment_name="")
        if equipment_name_filter:
            last_qs = last_qs.filter(equipment_name=equipment_name_filter)
        for row in last_qs.values("equipment_name", "timestamp").order_by("equipment_name", "-timestamp"):
            equipment_name = row.get("equipment_name")
            if equipment_name and equipment_name not in global_last_reading:
                global_last_reading[equipment_name] = row.get("timestamp")

        def build_day_payload(day_value):
            day_key = day_value.isoformat()
            equipments_payload = []
            total_expected_slots = 0
            total_present_slots = 0
            total_missing_slots = 0
            suppressed_for_day = suppressed_by_day.get(day_key, set())

            for equipment_name in sorted(equipment_names):
                if not equipment_name_filter and equipment_name in suppressed_for_day:
                    continue
                interval, shift_hours = get_interval_for_equipment(equipment_name, "chemical")
                stats = compute_missing_slots_for_day(
                    day_value=day_value,
                    timestamps=timestamps_by_day_equipment.get(day_key, {}).get(equipment_name, []),
                    interval=interval,
                    shift_duration_hours=shift_hours,
                    equipment_identifier=equipment_name,
                    log_type="chemical",
                )
                expected_count = stats["expected_slot_count"]
                present_count = stats["present_slot_count"]
                missing_count = stats["missing_slot_count"]
                total_expected_slots += expected_count
                total_present_slots += present_count
                total_missing_slots += missing_count
                missing_ranges = [
                    {
                        "slot_start": timezone.localtime(slot["slot_start"], slot_tz).isoformat(),
                        "slot_end": timezone.localtime(slot["slot_end"], slot_tz).isoformat(),
                        "label": (
                            f'{timezone.localtime(slot["slot_start"], slot_tz).strftime("%H:%M")}'
                            f' - {timezone.localtime(slot["slot_end"], slot_tz).strftime("%H:%M")}'
                        ),
                    }
                    for slot in stats["missing_slots"]
                ]
                _, day_end = get_slot_day_bounds(day_value)
                global_last = global_last_reading.get(equipment_name)
                last_reading_ts = daily_last_reading.get((day_key, equipment_name))
                if last_reading_ts is None and global_last is not None and global_last < day_end:
                    last_reading_ts = global_last
                equipments_payload.append(
                    {
                        "equipment_id": equipment_name.split(" – ")[0].strip() if " – " in equipment_name else equipment_name,
                        "equipment_name": equipment_name,
                        "interval": interval,
                        "shift_duration_hours": shift_hours,
                        "expected_slot_count": expected_count,
                        "present_slot_count": present_count,
                        "missing_slot_count": missing_count,
                        "next_due": (
                            timezone.localtime(stats["next_due"]).isoformat()
                            if stats["next_due"] is not None
                            else None
                        ),
                        "last_reading_timestamp": (
                            timezone.localtime(last_reading_ts).isoformat()
                            if last_reading_ts is not None
                            else None
                        ),
                        "missing_slots": missing_ranges,
                    }
                )

            return {
                "date": day_key,
                "log_type": "chemical",
                "total_expected_slots": total_expected_slots,
                "total_present_slots": total_present_slots,
                "total_missing_slots": total_missing_slots,
                "equipment_count": len(equipments_payload),
                "affected_equipment_count": len([e for e in equipments_payload if e["missing_slot_count"] > 0]),
                "equipments": equipments_payload,
            }

        day_payloads = [build_day_payload(day_item) for day_item in days]
        if not range_mode:
            payload = day_payloads[0]
            save_missing_slots_snapshot(
                user=request.user,
                log_type="chemical",
                date_from=days[0],
                date_to=days[0],
                payload=payload,
                filters={"equipment_name": equipment_name_filter or ""},
            )
            return Response(payload)

        payload = {
            "log_type": "chemical",
            "date_from": days[0].isoformat(),
            "date_to": days[-1].isoformat(),
            "day_count": len(day_payloads),
            "days": day_payloads,
            "total_expected_slots": sum(day_payload["total_expected_slots"] for day_payload in day_payloads),
            "total_present_slots": sum(day_payload["total_present_slots"] for day_payload in day_payloads),
            "total_missing_slots": sum(day_payload["total_missing_slots"] for day_payload in day_payloads),
            "affected_day_count": sum(1 for day_payload in day_payloads if day_payload["total_missing_slots"] > 0),
        }
        save_missing_slots_snapshot(
            user=request.user,
            log_type="chemical",
            date_from=days[0],
            date_to=days[-1],
            payload=payload,
            filters={"equipment_name": equipment_name_filter or ""},
        )
        return Response(payload)

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
        if original.operator_id and original.operator_id != request.user.id:
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})

        data = request.data.copy()

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        timestamp = validated.pop('timestamp', None)

        payload = {
            **validated,
            'corrects': original,
            'operator': original.operator,
            'operator_name': original.operator_name or (original.operator.email if original.operator else request.user.email),
            'equipment_name': original.equipment_name,
            'chemical_name': original.chemical_name,
            'status': 'pending_secondary_approval',
        }
        if timestamp is not None:
            payload['timestamp'] = timestamp

        check_ts = payload.get('timestamp') or timezone.now()
        interval, shift_hours = get_interval_for_equipment(original.equipment_name or '', 'chemical')
        slot_start, slot_end = get_slot_range(check_ts, interval, shift_hours)
        slot_qs = ChemicalPreparation.objects.filter(
            equipment_name=original.equipment_name,
            timestamp__gte=slot_start,
            timestamp__lt=slot_end,
        ).filter(
            self._chemical_scope_filter(
                chemical_id=(str(payload.get("chemical").id) if payload.get("chemical") else None),
                chemical_name=payload.get("chemical_name"),
            )
        )
        chain_root_id = original.corrects_id or original.pk
        conflict_exists = (
            slot_qs
            .exclude(pk=original.pk)
            .exclude(pk=chain_root_id)
            .exclude(corrects_id=original.pk)
            .exclude(corrects_id=chain_root_id)
            .exists()
        )
        if conflict_exists:
            raise ValidationError(
                {'detail': ['An entry for this equipment and chemical already exists for this time slot.']}
            )

        new_prep = ChemicalPreparation.objects.create(**payload)
        log_audit_event(
            user=request.user,
            event_type="log_corrected",
            object_type="chemical_log",
            object_id=str(new_prep.id),
            field_name="corrects_id",
            old_value=str(original.id),
            new_value=str(new_prep.id),
        )

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
        action_type = normalize_approval_action(request.data.get('action'))
        remarks = (request.data.get('remarks') or '').strip()
        require_rejection_comment(action_type, remarks)
        
        if action_type == 'approve':
            # Primary/secondary approver must be different from the operator (Log Book Done By)
            ensure_not_operator(prep.operator_id, request.user.id, "approved")
            if prep.status == 'pending_secondary_approval':
                # Secondary approval must be done by a different person than who rejected
                ensure_secondary_approver_diff(prep.approved_by_id, request.user.id)
                prep.status = 'approved'
                prep.secondary_approved_by = request.user
                from django.utils import timezone
                prep.secondary_approved_at = timezone.now()
            elif prep.status in ('pending', 'draft'):
                prep.status = 'approved'
            else:
                ensure_status_allowed(prep.status, ('pending', 'draft', 'pending_secondary_approval'), 'approve')
        elif action_type == 'reject':
            # Rejector must be different from the operator (Log Book Done By)
            ensure_not_operator(prep.operator_id, request.user.id, "rejected")
            ensure_status_allowed(prep.status, ('pending', 'draft', 'pending_secondary_approval'), 'reject')
            previous_status = prep.status
            prep.status = 'rejected'
            prep.secondary_approved_by = None
            prep.secondary_approved_at = None
            log_audit_event(
                user=request.user,
                event_type="log_rejected",
                object_type="chemical_log",
                object_id=str(prep.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
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
