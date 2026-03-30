from django.db.models import Q
from django.db.models.deletion import ProtectedError, Collector
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from accounts.permissions import IsAdminOrSuperAdmin
from reports.utils import log_audit_event, log_entity_update_changes

from .models import Department, EquipmentCategory, Equipment
from .serializers import (
    DepartmentSerializer,
    EquipmentCategorySerializer,
    EquipmentSerializer,
)

CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry."


class DepartmentViewSet(viewsets.ModelViewSet):
    """CRUD for Department master."""

    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer
    queryset = Department.objects.all().order_by("name")

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="department",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "department")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="department",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()


class EquipmentCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for EquipmentCategory master."""

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentCategorySerializer
    queryset = EquipmentCategory.objects.all().order_by("name")

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        """
        Prevent deleting categories that are in use by Equipment (PROTECT FK).
        Return a clear 400 error instead of a 500 traceback.
        """
        instance: EquipmentCategory = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This equipment category cannot be deleted because it is already used by one or more equipment records. "
                        "Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="equipment_category",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "equipment_category")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="equipment_category",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()


class EquipmentViewSet(viewsets.ModelViewSet):
    """CRUD for Equipment master."""

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentSerializer
    queryset = Equipment.objects.filter(is_active=True).order_by("equipment_number")

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            "created_by",
            "approved_by",
            "secondary_approved_by",
            "corrects",
            "department",
            "category",
        ).prefetch_related("corrections")
        department_id = self.request.query_params.get("department")
        category_id = self.request.query_params.get("category")
        status_param = self.request.query_params.get("status")

        if department_id:
            qs = qs.filter(department_id=department_id)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if status_param and status_param.lower() == "approved":
            qs = qs.filter(status="approved")

        return qs

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "approve", "correct"]:
            return [IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        """
        Prevent deleting equipment that is referenced by FilterAssignment (PROTECT FK).
        Return a clear 400 error instead of a 500 traceback.
        """
        instance = self.get_object()

        # Hard block: text-based references in log tables (non-FK) must be removed first.
        # Many log modules store equipment as CharField, so DB FK constraints do not catch them.
        def _or_iexact(field_name: str, values):
            q = Q()
            for v in values:
                q |= Q(**{f"{field_name}__iexact": v})
            return q

        equipment_number = (instance.equipment_number or "").strip()
        equipment_name = (instance.name or "").strip()
        equipment_labels = {
            v
            for v in [
                equipment_number,
                equipment_name,
                f"{equipment_number} – {equipment_name}".strip(" –"),
                f"{equipment_number} - {equipment_name}".strip(" -"),
            ]
            if v
        }
        text_blockers = []
        try:
            from chiller_logs.models import ChillerLog
            count = ChillerLog.objects.filter(_or_iexact("equipment_id", equipment_labels)).count()
            if count:
                text_blockers.append({"relation": "ChillerLog", "count": count})
        except Exception:
            pass
        try:
            from boiler_logs.models import BoilerLog
            count = BoilerLog.objects.filter(_or_iexact("equipment_id", equipment_labels)).count()
            if count:
                text_blockers.append({"relation": "BoilerLog", "count": count})
        except Exception:
            pass
        try:
            from filter_logs.models import FilterLog
            count = FilterLog.objects.filter(_or_iexact("equipment_id", equipment_labels)).count()
            if count:
                text_blockers.append({"relation": "FilterLog", "count": count})
        except Exception:
            pass
        try:
            from compressor_logs.models import CompressorLog
            count = CompressorLog.objects.filter(_or_iexact("equipment_id", equipment_labels)).count()
            if count:
                text_blockers.append({"relation": "CompressorLog", "count": count})
        except Exception:
            pass
        try:
            from briquette_logs.models import BriquetteLog
            count = BriquetteLog.objects.filter(_or_iexact("equipment_id", equipment_labels)).count()
            if count:
                text_blockers.append({"relation": "BriquetteLog", "count": count})
        except Exception:
            pass
        try:
            from chemical_prep.models import ChemicalPreparation, ChemicalAssignment
            count_prep = ChemicalPreparation.objects.filter(_or_iexact("equipment_name", equipment_labels)).count()
            if count_prep:
                text_blockers.append({"relation": "ChemicalPreparation", "count": count_prep})
            count_assign = ChemicalAssignment.objects.filter(_or_iexact("equipment_name", equipment_labels)).count()
            if count_assign:
                text_blockers.append({"relation": "ChemicalAssignment", "count": count_assign})
        except Exception:
            pass

        if text_blockers:
            return Response(
                {
                    "detail": (
                        "This equipment cannot be deleted because log/assignment records still reference it. "
                        "Delete those related rows first, then delete equipment."
                    ),
                    "related_records": text_blockers,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Hard block if deleting this equipment would cascade into any dependent rows.
        collector = Collector(using=instance._state.db)
        collector.collect([instance])
        cascade_blockers = []
        for model, objs in collector.data.items():
            if model == instance.__class__:
                continue
            count = len(objs)
            if count > 0:
                cascade_blockers.append(
                    {
                        "relation": model.__name__,
                        "count": count,
                    }
                )
        if cascade_blockers:
            return Response(
                {
                    "detail": (
                        "This equipment cannot be deleted because foreign-key related records exist. "
                        "Delete those related rows first, then delete equipment."
                    ),
                    "related_records": cascade_blockers,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Safety gate: never allow implicit cascade-style deletes from Equipment.
        # User must explicitly remove dependent records first.
        related_blockers = []
        for rel in instance._meta.related_objects:
            accessor = rel.get_accessor_name()
            if not accessor:
                continue
            try:
                manager_or_obj = getattr(instance, accessor)
            except Exception:
                continue
            related_count = 0
            try:
                if hasattr(manager_or_obj, "all"):
                    related_count = manager_or_obj.all().count()
                else:
                    related_count = 1 if manager_or_obj is not None else 0
            except Exception:
                related_count = 0
            if related_count > 0:
                related_blockers.append(
                    {
                        "relation": rel.related_model.__name__,
                        "count": related_count,
                    }
                )

        if related_blockers:
            return Response(
                {
                    "detail": (
                        "This equipment cannot be deleted because related records exist. "
                        "Please delete related records first, then try again."
                    ),
                    "related_records": related_blockers,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError as e:
            # e.protected_objects contains the related objects blocking deletion
            related_names = {type(obj).__name__ for obj in (e.protected_objects or [])}
            if "FilterAssignment" in related_names:
                msg = (
                    "This equipment cannot be deleted because it is assigned to one or more filters. "
                    "Remove the filter assignments first (E Log Book → Filter → settings/register or schedules), then try again."
                )
            else:
                msg = (
                    "This equipment cannot be deleted because it is referenced by other records. "
                    "Remove those references first, or deactivate the equipment instead."
                )
            return Response(
                {"detail": msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="equipment",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "equipment")

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if (
            instance.status in ("rejected", "pending_secondary_approval")
            and instance.created_by_id
            and instance.created_by_id != request.user.id
        ):
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="equipment",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve or reject an equipment master record.

        Body: { "action": "approve" | "reject", "remarks": "..." }
        Rule: approver must be different from the user who created the row.
        Correction rows require a different approver than:
        - correction creator
        - original row creator
        - original row rejector (stored in original approved_by during reject)
        """
        equipment = self.get_object()
        action_type = (request.data.get("action") or "approve").strip().lower()
        remarks = (request.data.get("remarks") or request.data.get("comment") or "").strip()

        if action_type not in ("approve", "reject"):
            raise ValidationError({"action": ["Invalid action. Use 'approve' or 'reject'."]})

        if action_type == "reject" and not remarks:
            raise ValidationError({"remarks": ["Comment is required when rejecting."]})

        creator_id = getattr(equipment.created_by, "id", None)
        if action_type == "approve":
            if creator_id and creator_id == request.user.id:
                raise ValidationError(
                    {"detail": ["The equipment entry must be approved by a different user than the creator."]}
                )
            if equipment.status == "pending_secondary_approval":
                if equipment.approved_by_id and equipment.approved_by_id == request.user.id:
                    raise ValidationError(
                        {"detail": ["A different person must perform secondary approval. The person who rejected cannot approve the corrected entry."]}
                    )
                equipment.status = "approved"
                equipment.secondary_approved_by = request.user
                equipment.secondary_approved_at = timezone.now()
            elif equipment.status in ("pending", "draft"):
                equipment.status = "approved"
            else:
                raise ValidationError(
                    {"detail": ["Only pending, draft, or pending secondary approval entries can be approved."]}
                )
            equipment.approval_comment = remarks
            equipment.rejection_comment = ""
        elif action_type == "reject":
            if creator_id and creator_id == request.user.id:
                raise ValidationError(
                    {"detail": ["The equipment entry must be rejected by a different user than the creator."]}
                )
            if equipment.status not in ("pending", "draft", "pending_secondary_approval"):
                raise ValidationError(
                    {"detail": ["Only pending, draft, or pending secondary approval entries can be rejected."]}
                )
            previous_status = equipment.status
            equipment.status = "rejected"
            equipment.rejection_comment = remarks
            equipment.secondary_approved_by = None
            equipment.secondary_approved_at = None
            log_audit_event(
                user=request.user,
                event_type="entity_rejected",
                object_type="equipment",
                object_id=str(equipment.id),
                field_name="status",
                old_value=previous_status,
                new_value="rejected",
            )

        if action_type == "reject" or (action_type == "approve" and equipment.status == "approved"):
            equipment.approved_by = request.user
            equipment.approved_at = timezone.now()
        equipment.save(
            update_fields=[
                "status",
                "approval_comment",
                "rejection_comment",
                "approved_by",
                "approved_at",
                "secondary_approved_by",
                "secondary_approved_at",
                "updated_at",
            ]
        )

        if action_type == "approve":
            log_audit_event(
                user=request.user,
                event_type="entity_approved",
                object_type="equipment",
                object_id=str(equipment.id),
                field_name="status",
                new_value=equipment.status,
            )

        serializer = self.get_serializer(equipment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        """
        Create a correction row from a rejected equipment record.
        Source row remains rejected; new row is pending_correction_entry.
        """
        source = self.get_object()
        if source.status not in ("rejected", "pending_secondary_approval"):
            raise ValidationError({"detail": ["Only rejected or pending secondary approval entries can be corrected."]})
        if source.created_by_id and source.created_by_id != request.user.id:
            raise ValidationError({"detail": [CREATOR_ONLY_REJECTED_EDIT_MESSAGE]})

        payload = {
            "equipment_number": request.data.get("equipment_number", source.equipment_number),
            "name": request.data.get("name", source.name),
            "capacity": request.data.get("capacity", source.capacity),
            "department_id": request.data.get("department", source.department_id),
            "category_id": request.data.get("category", source.category_id),
            "site_id": request.data.get("site_id", source.site_id),
            "client_id": request.data.get("client_id", source.client_id),
            "is_active": request.data.get("is_active", source.is_active),
            "log_entry_interval": request.data.get("log_entry_interval", source.log_entry_interval),
            "shift_duration_hours": request.data.get("shift_duration_hours", source.shift_duration_hours),
            "tolerance_minutes": request.data.get("tolerance_minutes", source.tolerance_minutes),
        }

        with transaction.atomic():
            corrected = Equipment.objects.create(
                **payload,
                status="pending_secondary_approval",
                corrects=source,
                created_by=source.created_by,
                approved_by=None,
                approved_at=None,
                secondary_approved_by=None,
                secondary_approved_at=None,
                approval_comment="",
                rejection_comment="",
            )
            log_audit_event(
                user=request.user,
                event_type="entity_corrected",
                object_type="equipment",
                object_id=str(corrected.id),
                field_name="corrects_id",
                old_value=str(source.id),
                new_value=str(corrected.id),
            )

        serializer = self.get_serializer(corrected)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

