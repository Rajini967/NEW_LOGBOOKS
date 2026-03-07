from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from accounts.models import SessionSetting
from core.log_slot_utils import get_slot_range
from .models import Chemical, ChemicalStock, ChemicalPreparation, ChemicalAssignment
from .serializers import (
    ChemicalSerializer,
    ChemicalStockSerializer,
    ChemicalAssignmentSerializer,
    ChemicalPreparationSerializer,
)
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdminOrManager
from reports.utils import log_limit_change


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
    if v == "boiler":
        return "boiler"
    return None


class ChemicalStockViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for chemical stock and pricing. Admin can create entries via create_entry."""

    permission_classes = [IsAuthenticated]
    serializer_class = ChemicalStockSerializer
    queryset = ChemicalStock.objects.select_related("chemical").all()

    def get_queryset(self):
        qs = super().get_queryset()
        chemical_id = self.request.query_params.get("chemical")
        if chemical_id:
            qs = qs.filter(chemical_id=chemical_id)
        location = self.request.query_params.get("location")
        if location:
            qs = qs.filter(chemical__location=location)
        return qs

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsSuperAdminOrManager])
    def create_entry(self, request):
        """
        Create a new chemical stock entry from manual fields.
        Accepts: location, chemical_name, chemical_formula, stock, price, site.
        Creates or reuses Chemical master, then creates ChemicalStock.
        """
        location_raw = (request.data.get("location") or "").strip()
        chemical_name = (request.data.get("chemical_name") or "").strip()
        chemical_formula = (request.data.get("chemical_formula") or "").strip()
        stock_raw = request.data.get("stock")
        price_raw = request.data.get("price")
        site = (request.data.get("site") or "").strip() or None

        if not chemical_name:
            raise ValidationError({"chemical_name": "Chemical name is required."})

        location = _normalize_location(location_raw)
        if not location:
            raise ValidationError({
                "location": "Location must be one of: Water system, Cooling towers, Boiler."
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
    queryset = ChemicalAssignment.objects.select_related("chemical", "created_by").all()

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
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


class ChemicalPreparationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing chemical preparations."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChemicalPreparationSerializer
    queryset = ChemicalPreparation.objects.all()
    
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
            setting = SessionSetting.get_solo()
            interval = getattr(setting, "log_entry_interval", None) or "hourly"
            shift_hours = getattr(setting, "shift_duration_hours", None) or 8
            slot_start, slot_end = get_slot_range(timestamp, interval, shift_hours)
            if ChemicalPreparation.objects.filter(
                equipment_name=equipment_name,
                timestamp__gte=slot_start,
                timestamp__lt=slot_end,
            ).exists():
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

        serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
        )

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
                report_type='utility',
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
