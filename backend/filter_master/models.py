import uuid
from datetime import date

from django.conf import settings
from django.db import models

from equipment.models import Equipment


class FilterCategory(models.Model):
    """Filter category master."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    description = models.TextField(blank=True, null=True)
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
        help_text="System-generated filter identifier, e.g. FMT-0001.",
    )
    category = models.ForeignKey(
        FilterCategory,
        on_delete=models.PROTECT,
        related_name="filters",
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
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(
        FilterAssignment,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    schedule_type = models.CharField(max_length=32, choices=SCHEDULE_TYPE_CHOICES)
    frequency_days = models.PositiveIntegerField(blank=True, null=True)
    next_due_date = models.DateField(blank=True, null=True)
    last_done_date = models.DateField(blank=True, null=True)
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

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.assignment} - {self.schedule_type}"

    def mark_overdue_if_needed(self, today: date | None = None) -> None:
        """Update status to overdue when next_due_date is in the past."""
        if not self.next_due_date:
            return
        if today is None:
            today = date.today()
        if self.status == "completed":
            return
        if self.next_due_date < today and self.status != "overdue":
            self.status = "overdue"

