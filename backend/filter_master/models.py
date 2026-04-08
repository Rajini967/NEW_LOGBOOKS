import uuid
from datetime import date, timedelta

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from equipment.models import Equipment


MICRON_SIZE_CHOICES = [
    ("0.2", "0.2 µ"),
    ("0.45", "0.45 µ"),
    ("1", "1 µ"),
    ("3", "3 µ"),
    ("5", "5 µ"),
    ("10", "10 µ"),
    ("20", "20 µ"),
    ("100", "100 µ"),
]


class FilterCategory(models.Model):
    """Dedicated filter categories (legacy UI)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    description = models.TextField(blank=True, null=True)
    micron_costs = models.JSONField(blank=True, null=True, default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "filter_categories"
        ordering = ["name"]
        verbose_name = "Filter Category"
        verbose_name_plural = "Filter Categories"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.name


class FilterMaster(models.Model):
    """Registered filter master."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("inactive", "Inactive"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filter_id = models.CharField(
        max_length=32,
        unique=True,
        editable=False,
        blank=True,
        null=True,
        help_text="System-generated filter identifier (e.g. FMT-0001), assigned upon approval.",
    )
    category = models.ForeignKey(
        FilterCategory,
        on_delete=models.PROTECT,
        related_name="filters",
        blank=True,
        null=True,
    )
    make = models.CharField(max_length=255)
    model = models.CharField(max_length=255)
    serial_number = models.CharField(max_length=255, blank=True, null=True)
    size_l = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    size_w = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    size_h = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    micron_size = models.CharField(max_length=10, choices=MICRON_SIZE_CHOICES)
    certificate_file = models.FileField(
        upload_to="filter_certificates/",
        blank=True,
        null=True,
    )
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default="pending",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_filters",
        blank=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_filters",
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "filter_master"
        ordering = ["-created_at"]
        verbose_name = "Filter Master"
        verbose_name_plural = "Filter Masters"
        constraints = [
            models.UniqueConstraint(
                fields=["serial_number"],
                condition=Q(serial_number__isnull=False) & ~Q(serial_number=""),
                name="uniq_filter_master_serial_number_non_empty",
            )
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.filter_id} - {self.make} {self.model}"


class FilterAssignment(models.Model):
    """Filter assignment to equipment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filter = models.ForeignKey(
        FilterMaster,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.PROTECT,
        related_name="filter_assignments",
    )
    area_category = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Area category such as Production, Utility, AHU Room, etc.",
    )
    tag_info = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Optional tag information for integration with log books.",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="filter_assignments_made",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "filter_assignments"
        ordering = ["-assigned_at"]
        verbose_name = "Filter Assignment"
        verbose_name_plural = "Filter Assignments"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.filter.filter_id} -> {self.equipment.equipment_number}"


class FilterSchedule(models.Model):
    """Schedule for filter maintenance (replacement, cleaning, integrity)."""

    SCHEDULE_TYPE_CHOICES = [
        ("replacement", "Replacement"),
        ("cleaning", "Cleaning"),
        ("integrity", "Integrity"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("overdue", "Overdue"),
        ("completed", "Completed"),
        ("rejected", "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(
        FilterAssignment,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    schedule_type = models.CharField(max_length=32, choices=SCHEDULE_TYPE_CHOICES)
    frequency_days = models.PositiveIntegerField(blank=True, null=True)
    tolerance_days = models.IntegerField(
        blank=True,
        null=True,
        help_text="Days added to nominal due before marking overdue: positive = grace after due date, negative = overdue effective earlier.",
    )
    next_due_date = models.DateField(blank=True, null=True)
    last_done_date = models.DateField(blank=True, null=True)
    is_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_filter_schedules",
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default="active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "filter_schedules"
        ordering = ["next_due_date"]
        verbose_name = "Filter Schedule"
        verbose_name_plural = "Filter Schedules"

    @classmethod
    def past_grace_end_before(cls, queryset, today: date):
        """Filter rows whose grace end (due + tolerance) is strictly before ``today`` (PostgreSQL)."""
        tbl = cls._meta.db_table
        return queryset.extra(
            where=[
                f'({tbl}.next_due_date + COALESCE({tbl}.tolerance_days, 0) * interval \'1 day\')::date < %s'
            ],
            params=[today],
        )

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.assignment} - {self.schedule_type}"

    def grace_end_date(self) -> date | None:
        """Nominal due plus tolerance (when overdue starts)."""
        if not self.next_due_date:
            return None
        tol = int(self.tolerance_days or 0)
        return self.next_due_date + timedelta(days=tol)

    def mark_overdue_if_needed(self, today: date | None = None) -> None:
        """Update status to overdue when grace end date is in the past."""
        end = self.grace_end_date()
        if not end:
            return
        if today is None:
            today = date.today()
        if self.status == "completed":
            return
        if end < today and self.status != "overdue":
            self.status = "overdue"


class FilterDashboardConfig(models.Model):
    """
    Optional singleton config for filters dashboard: projected counts and cost per month.
    Used for "actual vs projected" consumption (activities) and cost on the dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projected_replacement_count_month = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Projected number of filter replacements per month for comparison",
    )
    projected_cleaning_count_month = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Projected number of filter cleanings per month for comparison",
    )
    projected_integrity_count_month = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Projected number of filter integrity activities per month for comparison",
    )
    projected_cost_rs_month = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Projected filter-related cost per month (Rs) for comparison",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "filter_dashboard_config"
        verbose_name = "Filter Dashboard Config"
        verbose_name_plural = "Filter Dashboard Config"

    def __str__(self):
        return "Filter Dashboard Config"

