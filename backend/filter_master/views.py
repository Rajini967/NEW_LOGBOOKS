import calendar
from datetime import date, datetime, timedelta

from django.db.models.deletion import ProtectedError
from django.db.models import Count
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsManagerOrSuperAdmin
from reports.utils import create_report_entry

from .models import FilterCategory, FilterMaster, FilterAssignment, FilterSchedule, FilterDashboardConfig
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
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        """
        Categories cannot be deleted if they are referenced by any registered filter
        (FilterMaster.category uses PROTECT). Return a user-friendly error instead
        of a 500 traceback.
        """
        instance: FilterCategory = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This category cannot be deleted because it is already used by one or more filters. "
                        "Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class FilterMasterViewSet(viewsets.ModelViewSet):
    queryset = FilterMaster.objects.select_related("category", "created_by", "approved_by").all()
    serializer_class = FilterMasterSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "approve", "reject"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve a pending filter.
        """
        instance: FilterMaster = self.get_object()
        if instance.status not in ["pending", "rejected"]:
            return Response(
                {"detail": "Only pending or rejected filters can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """
        Allow deleting filters only before they are approved.
        """
        instance: FilterMaster = self.get_object()
        if instance.status == "approved":
            return Response(
                {"detail": "Approved filters cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """
        Reject a pending filter.
        """
        instance: FilterMaster = self.get_object()
        if instance.status not in ["pending"]:
            return Response(
                {"detail": "Only pending filters can be rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.status = "rejected"
        instance.approved_by = request.user
        instance.approved_at = timezone.now()
        instance.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class FilterAssignmentViewSet(viewsets.ModelViewSet):
    queryset = FilterAssignment.objects.select_related("filter", "equipment").all()
    serializer_class = FilterAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        equipment_id = self.request.query_params.get("equipment")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs


class FilterScheduleViewSet(viewsets.ModelViewSet):
    queryset = FilterSchedule.objects.select_related("assignment", "assignment__equipment").all()
    serializer_class = FilterScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "approve", "reject"]:
            return [IsAuthenticated(), IsManagerOrSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
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
            # Ensure status reflects overdue state for crossed due dates
            FilterSchedule.objects.filter(is_approved=True, next_due_date__lt=today).exclude(
                status__in=["completed", "overdue"]
            ).update(status="overdue")
            qs = qs.filter(is_approved=True, next_due_date__lt=today).exclude(status="completed")
        return qs

    @action(detail=False, methods=["get"], url_path="overdue-summary")
    def overdue_summary(self, request):
        """
        Return counts of overdue schedules grouped by schedule type.
        """
        today = date.today()
        # Ensure status reflects overdue state for crossed due dates
        FilterSchedule.objects.filter(is_approved=True, next_due_date__lt=today).exclude(
            status__in=["completed", "overdue"]
        ).update(status="overdue")
        qs = (
            FilterSchedule.objects.filter(is_approved=True, next_due_date__lt=today)
            .exclude(status="completed")
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

        if period_type == "week":
            year, week_no, _ = ref_date.isocalendar()
            period_start_date = datetime.strptime(
                f"{year}-W{week_no:02d}-1", "%G-W%V-%u"
            ).date()
            period_end_date = period_start_date + timedelta(days=6)
        else:
            _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
            period_start_date = date(ref_date.year, ref_date.month, 1)
            period_end_date = date(ref_date.year, ref_date.month, last_day)

        base_qs = FilterSchedule.objects.filter(
            last_done_date__gte=period_start_date,
            last_done_date__lte=period_end_date,
        ).exclude(last_done_date__isnull=True)

        counts_by_type = dict(
            base_qs.values("schedule_type").annotate(count=Count("id")).values_list("schedule_type", "count")
        )
        replacement_count = counts_by_type.get("replacement", 0)
        cleaning_count = counts_by_type.get("cleaning", 0)
        integrity_count = counts_by_type.get("integrity", 0)
        total_consumption = replacement_count + cleaning_count + integrity_count

        payload = {
            "period_type": period_type,
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
            if period_type == "month":
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        instance: FilterSchedule = self.get_object()
        if instance.is_approved:
            return Response({"detail": "Schedule is already approved."}, status=status.HTTP_400_BAD_REQUEST)
        if not instance.frequency_days:
            return Response({"detail": "Frequency (days) is required to approve a schedule."}, status=status.HTTP_400_BAD_REQUEST)

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
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        instance: FilterSchedule = self.get_object()
        if instance.is_approved:
            return Response({"detail": "Approved schedules cannot be rejected."}, status=status.HTTP_400_BAD_REQUEST)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

