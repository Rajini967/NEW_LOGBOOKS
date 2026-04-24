import calendar
from datetime import date, datetime, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import (
    CanApproveFilterRegister,
    CanApproveFilterSchedule,
    CanDeleteEquipmentMaster,
    CanManageFilterConfiguration,
    IsSuperAdmin,
)
from reports.utils import create_report_entry, log_audit_event, log_entity_update_changes
from core.equipment_scope import filter_queryset_by_equipment_scope

from .models import FilterCategory, FilterMaster, FilterAssignment, FilterSchedule, FilterDashboardConfig
from filter_logs.models import FilterLog
from .serializers import (
    FilterCategorySerializer,
    FilterMasterSerializer,
    FilterAssignmentSerializer,
    FilterScheduleSerializer,
)


class FilterCategoryViewSet(viewsets.ModelViewSet):
    queryset = FilterCategory.objects.all()
    serializer_class = FilterCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAuthenticated(), CanDeleteEquipmentMaster()]
        if self.action in ["create", "update", "partial_update"]:
            return [IsAuthenticated(), CanManageFilterConfiguration()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="filter_category",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "filter_category")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="filter_category",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()


class FilterMasterViewSet(viewsets.ModelViewSet):
    queryset = FilterMaster.objects.select_related("category", "created_by", "approved_by").all()
    serializer_class = FilterMasterSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["approve", "reject"]:
            return [IsAuthenticated(), CanApproveFilterRegister()]
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        if self.action in ["create", "update", "partial_update"]:
            return [IsAuthenticated(), CanManageFilterConfiguration()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        """
        Create a new filter in pending status.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="filter_master",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "filter_master")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="filter_master",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve a pending filter.
        """
        instance: FilterMaster = self.get_object()

        # Business rule: the user who registered the filter (created_by)
        # cannot be the same user who approves it.
        if instance.created_by_id and instance.created_by_id == request.user.id:
            return Response(
                {
                    "detail": (
                        "Filter must be approved by a different user than the one who "
                        "registered it (Done By)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if instance.status not in ["pending", "rejected"]:
            return Response(
                {"detail": "Only pending or rejected filters can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prev_filter_status = instance.status

        # Generate a filter_id on first approval if missing
        if not instance.filter_id:
            serializer_for_id = self.get_serializer(instance)
            for _ in range(5):
                candidate = serializer_for_id._generate_filter_id()
                if not FilterMaster.objects.filter(filter_id=candidate).exists():
                    instance.filter_id = candidate
                    break
            else:
                return Response(
                    {"detail": "Unable to generate a unique filter ID. Please try again."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        instance.status = "approved"
        instance.approved_by = request.user
        instance.approved_at = timezone.now()
        instance.save(update_fields=["filter_id", "status", "approved_by", "approved_at", "updated_at"])

        create_report_entry(
            report_type="filter_register",
            source_id=str(instance.id),
            source_table="filter_master",
            title=f"Filter Register: {instance.filter_id}",
            site=instance.client_id or "N/A",
            created_by=getattr(instance.created_by, "email", None)
            or getattr(instance.created_by, "name", None)
            or "System",
            created_at=instance.created_at,
            approved_by=request.user,
            remarks=None,
        )

        log_audit_event(
            user=request.user,
            event_type="entity_approved",
            object_type="filter_master",
            object_id=str(instance.id),
            field_name="status",
            old_value=prev_filter_status,
            new_value="approved",
            extra={"filter_id": instance.filter_id} if instance.filter_id else {},
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """Allow deleting filter rows (super admin only via permissions)."""
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """
        Reject a pending filter.
        """
        instance: FilterMaster = self.get_object()

        # Same separation-of-duties rule as approve: registrar cannot reject their own entry.
        if instance.created_by_id and instance.created_by_id == request.user.id:
            return Response(
                {
                    "detail": (
                        "Filter must be rejected by a different user than the one who "
                        "registered it (Done By)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if instance.status not in ["pending"]:
            return Response(
                {"detail": "Only pending filters can be rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prev_filter_status = instance.status

        instance.status = "rejected"
        instance.approved_by = request.user
        instance.approved_at = timezone.now()
        instance.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        log_audit_event(
            user=request.user,
            event_type="entity_rejected",
            object_type="filter_master",
            object_id=str(instance.id),
            field_name="status",
            old_value=prev_filter_status,
            new_value="rejected",
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class FilterAssignmentViewSet(viewsets.ModelViewSet):
    queryset = FilterAssignment.objects.select_related("filter", "filter__category", "equipment").all()
    serializer_class = FilterAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), CanManageFilterConfiguration()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get("equipment")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return filter_queryset_by_equipment_scope(
            qs,
            self.request.user,
            equipment_field="equipment_id",
            use_equipment_uuid_fk=True,
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="filter_assignment",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "filter_assignment")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="filter_assignment",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()


class FilterScheduleViewSet(viewsets.ModelViewSet):
    queryset = FilterSchedule.objects.select_related(
        "assignment",
        "assignment__equipment",
        "assignment__assigned_by",
    ).all()
    serializer_class = FilterScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["approve", "reject"]:
            return [IsAuthenticated(), CanApproveFilterSchedule()]
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        if self.action in ["create", "update", "partial_update"]:
            return [IsAuthenticated(), CanManageFilterConfiguration()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = filter_queryset_by_equipment_scope(
            qs,
            self.request.user,
            equipment_field="assignment__equipment_id",
            use_equipment_uuid_fk=True,
        )
        equipment_id = self.request.query_params.get("equipment")
        if equipment_id:
            qs = qs.filter(assignment__equipment_id=equipment_id)
        approval_param = self.request.query_params.get("approval")
        if approval_param == "pending":
            qs = qs.filter(is_approved=False)
        elif approval_param == "approved":
            qs = qs.filter(is_approved=True)
        overdue_param = self.request.query_params.get("overdue")
        if overdue_param == "true":
            today = date.today()
            to_mark = FilterSchedule.past_grace_end_before(
                FilterSchedule.objects.filter(is_approved=True)
                .exclude(next_due_date__isnull=True)
                .exclude(status__in=["completed", "overdue"]),
                today,
            )
            to_mark.update(status="overdue")
            qs = FilterSchedule.past_grace_end_before(
                qs.filter(is_approved=True).exclude(next_due_date__isnull=True).exclude(status="completed"),
                today,
            )
        return qs

    @action(detail=False, methods=["get"], url_path="overdue-summary")
    def overdue_summary(self, request):
        """
        Return counts of overdue schedules grouped by schedule type.
        """
        today = date.today()
        to_mark = FilterSchedule.past_grace_end_before(
            FilterSchedule.objects.filter(is_approved=True)
            .exclude(next_due_date__isnull=True)
            .exclude(status__in=["completed", "overdue"]),
            today,
        )
        to_mark.update(status="overdue")
        qs = (
            FilterSchedule.past_grace_end_before(
                FilterSchedule.objects.filter(is_approved=True)
                .exclude(next_due_date__isnull=True)
                .exclude(status="completed"),
                today,
            )
            .values("schedule_type")
            .annotate(count=Count("id"))
        )
        summary = {row["schedule_type"]: row["count"] for row in qs}
        return Response(summary)

    @action(detail=False, methods=["get"], url_path="dashboard_summary")
    def dashboard_summary(self, request):
        """
        GET ?period_type=week|month&date=YYYY-MM-DD
        Returns counts of filter maintenance done in period (replacement, cleaning, integrity),
        total_consumption (sum of counts), total_cost_rs (0), and optional projected values.
        """
        period_type = (request.query_params.get("period_type") or "month").lower()
        if period_type not in ("week", "month"):
            return Response(
                {"error": "period_type must be week or month"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        date_from_str = (request.query_params.get("date_from") or "").strip()
        date_to_str = (request.query_params.get("date_to") or "").strip()
        has_custom_range = bool(date_from_str and date_to_str)
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
        if has_custom_range:
            try:
                period_start_date = datetime.strptime(date_from_str[:10], "%Y-%m-%d").date()
                period_end_date = datetime.strptime(date_to_str[:10], "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "date_from/date_to must be YYYY-MM-DD"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if period_start_date > period_end_date:
                return Response(
                    {"error": "date_from must be <= date_to"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if period_end_date > timezone.localdate():
                return Response(
                    {"error": "future date is not allowed"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if has_custom_range:
            pass
        elif period_type == "week":
            year, week_no, _ = ref_date.isocalendar()
            period_start_date = datetime.strptime(
                f"{year}-W{week_no:02d}-1", "%G-W%V-%u"
            ).date()
            period_end_date = period_start_date + timedelta(days=6)
        else:
            _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
            period_start_date = date(ref_date.year, ref_date.month, 1)
            period_end_date = date(ref_date.year, ref_date.month, last_day)

        equipment_id = (request.query_params.get("equipment_id") or "").strip() or None
        # Resolve filter IDs for equipment (log entries use filter id e.g. FMT-0001)
        if equipment_id:
            filter_ids = list(
                FilterAssignment.objects.filter(equipment_id=equipment_id)
                .values_list("filter__filter_id", flat=True)
            )
        else:
            filter_ids = list(
                FilterAssignment.objects.values_list("filter__filter_id", flat=True).distinct()
            )
        filter_ids = [f for f in filter_ids if f]

        # Counts from approved filter log entries (maintenance done in period).
        # NOTE: current FilterLog stores filter identifier in `filter_no` (FMT-xxxx),
        # while `equipment_id` is equipment UUID/identifier. Keep legacy support where
        # older rows may have filter id in equipment_id.
        replacement_count = 0
        cleaning_count = 0
        integrity_count = 0
        if filter_ids:
            base_logs_qs = FilterLog.objects.filter(
                status="approved",
            ).filter(
                Q(filter_no__in=filter_ids) | Q(equipment_id__in=filter_ids)
            )
            replacement_count = base_logs_qs.filter(
                installed_date__gte=period_start_date,
                installed_date__lte=period_end_date,
            ).count()
            cleaning_count = base_logs_qs.filter(
                cleaning_done_date__isnull=False,
                cleaning_done_date__gte=period_start_date,
                cleaning_done_date__lte=period_end_date,
            ).count()
            integrity_count = base_logs_qs.filter(
                integrity_done_date__isnull=False,
                integrity_done_date__gte=period_start_date,
                integrity_done_date__lte=period_end_date,
            ).count()
        total_consumption = replacement_count + cleaning_count + integrity_count

        payload = {
            "period_type": "custom" if has_custom_range else period_type,
            "period_start": period_start_date.isoformat(),
            "period_end": period_end_date.isoformat(),
            "replacement_count": replacement_count,
            "cleaning_count": cleaning_count,
            "integrity_count": integrity_count,
            "total_consumption": total_consumption,
            "total_cost_rs": 0,
        }

        config = FilterDashboardConfig.objects.first()
        if config:
            if has_custom_range:
                days_span = max(1, (period_end_date - period_start_date).days + 1)
                scale = days_span / 30.0
                payload["projected_replacement_count"] = round((config.projected_replacement_count_month or 0) * scale)
                payload["projected_cleaning_count"] = round((config.projected_cleaning_count_month or 0) * scale)
                payload["projected_integrity_count"] = round((config.projected_integrity_count_month or 0) * scale)
                payload["projected_cost_rs"] = (
                    round((config.projected_cost_rs_month or 0) * scale, 2)
                    if config.projected_cost_rs_month is not None
                    else None
                )
            elif period_type == "month":
                payload["projected_replacement_count"] = config.projected_replacement_count_month
                payload["projected_cleaning_count"] = config.projected_cleaning_count_month
                payload["projected_integrity_count"] = config.projected_integrity_count_month
                payload["projected_cost_rs"] = round(config.projected_cost_rs_month, 2) if config.projected_cost_rs_month is not None else None
            else:
                _, month_days = calendar.monthrange(ref_date.year, ref_date.month)
                scale = 7.0 / month_days
                if config.projected_replacement_count_month is not None:
                    payload["projected_replacement_count"] = round(config.projected_replacement_count_month * scale)
                if config.projected_cleaning_count_month is not None:
                    payload["projected_cleaning_count"] = round(config.projected_cleaning_count_month * scale)
                if config.projected_integrity_count_month is not None:
                    payload["projected_integrity_count"] = round(config.projected_integrity_count_month * scale)
                if config.projected_cost_rs_month is not None:
                    payload["projected_cost_rs"] = round(config.projected_cost_rs_month * scale, 2)
            proj_rep = payload.get("projected_replacement_count") or 0
            proj_clean = payload.get("projected_cleaning_count") or 0
            proj_int = payload.get("projected_integrity_count") or 0
            payload["projected_consumption"] = proj_rep + proj_clean + proj_int

        return Response(payload)

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type="filter_schedule",
            object_id=str(instance.id),
            field_name="created",
        )

    def perform_update(self, serializer):
        log_entity_update_changes(serializer, self.request, "filter_schedule")

    def perform_destroy(self, instance):
        log_audit_event(
            user=self.request.user,
            event_type="entity_deleted",
            object_type="filter_schedule",
            object_id=str(instance.id),
            field_name="deleted",
        )
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        instance: FilterSchedule = self.get_object()
        prev_schedule_status = instance.status
        if instance.is_approved:
            return Response({"detail": "Schedule is already approved."}, status=status.HTTP_400_BAD_REQUEST)
        if not instance.frequency_days:
            return Response({"detail": "Frequency (days) is required to approve a schedule."}, status=status.HTTP_400_BAD_REQUEST)

        assignment = instance.assignment
        if assignment.assigned_by_id and assignment.assigned_by_id == request.user.id:
            return Response(
                {
                    "detail": (
                        "This schedule must be approved by a different user than the one who "
                        "assigned the filter to this equipment."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.is_approved = True
        instance.approved_by = request.user
        instance.approved_at = timezone.now()
        instance.next_due_date = instance.approved_at.date() + timedelta(days=int(instance.frequency_days))
        instance.status = "active"
        instance.save(
            update_fields=[
                "is_approved",
                "approved_by",
                "approved_at",
                "next_due_date",
                "status",
                "updated_at",
            ]
        )
        log_audit_event(
            user=request.user,
            event_type="entity_approved",
            object_type="filter_schedule",
            object_id=str(instance.id),
            field_name="status",
            old_value=prev_schedule_status,
            new_value="approved",
        )
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        instance: FilterSchedule = self.get_object()
        prev_schedule_status = instance.status
        if instance.is_approved:
            return Response({"detail": "Approved schedules cannot be rejected."}, status=status.HTTP_400_BAD_REQUEST)

        assignment = instance.assignment
        if assignment.assigned_by_id and assignment.assigned_by_id == request.user.id:
            return Response(
                {
                    "detail": (
                        "This schedule must be rejected by a different user than the one who "
                        "assigned the filter to this equipment."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_audit_event(
            user=request.user,
            event_type="entity_rejected",
            object_type="filter_schedule",
            object_id=str(instance.id),
            field_name="status",
            old_value=prev_schedule_status,
            new_value="rejected",
        )
        instance.status = "rejected"
        instance.is_approved = False
        instance.approved_by = request.user
        instance.approved_at = timezone.now()
        instance.save(
            update_fields=[
                "status",
                "is_approved",
                "approved_by",
                "approved_at",
                "updated_at",
            ]
        )
        return Response(self.get_serializer(instance).data, status=status.HTTP_200_OK)

