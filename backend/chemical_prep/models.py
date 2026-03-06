from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
import uuid


class Chemical(models.Model):
    """Chemical master (location, formula, name)."""

    LOCATION_CHOICES = [
        ("water_system", "Water system"),
        ("cooling_towers", "Cooling towers"),
        ("boiler", "Boiler"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.CharField(max_length=32, choices=LOCATION_CHOICES)
    formula = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    category = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Optional category such as major/minor or process group.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chemicals"
        ordering = ["location", "name"]
        verbose_name = "Chemical"
        verbose_name_plural = "Chemicals"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.formula} - {self.name}"


class ChemicalStock(models.Model):
    """Stock and pricing information for chemicals."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chemical = models.ForeignKey(
        Chemical,
        on_delete=models.PROTECT,
        related_name="stock_entries",
    )
    available_qty_kg = models.FloatField(
        validators=[MinValueValidator(0)],
        help_text="Available quantity in kilograms.",
        default=0,
    )
    unit = models.CharField(
        max_length=16,
        default="kg",
        help_text="Display unit for stock quantity (e.g. kg).",
    )
    price_per_unit = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Price per unit (e.g. per kg).",
    )
    site = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Optional site identifier for multi-site setups.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chemical_stock"
        verbose_name = "Chemical Stock"
        verbose_name_plural = "Chemical Stock"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.chemical} - {self.available_qty_kg} {self.unit}"


class ChemicalAssignment(models.Model):
    """Assignment of chemicals to specific equipment with category."""

    CATEGORY_CHOICES = [
        ("major", "Major"),
        ("minor", "Minor"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chemical = models.ForeignKey(
        Chemical,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    equipment_name = models.CharField(
        max_length=255,
        help_text="Equipment name or tag this chemical is assigned to.",
    )
    category = models.CharField(
        max_length=10,
        choices=CATEGORY_CHOICES,
        help_text="Chemical category for this assignment (e.g. major / minor).",
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chemical_assignments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chemical_assignments"
        verbose_name = "Chemical Assignment"
        verbose_name_plural = "Chemical Assignments"
        ordering = ["equipment_name", "chemical__name"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.equipment_name} -> {self.chemical} ({self.category})"


class ChemicalPreparation(models.Model):
    """Chemical preparation log model."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("pending_secondary_approval", "Pending secondary approval"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Chemical preparation fields
    equipment_name = models.CharField(max_length=255, blank=True, null=True)
    chemical = models.ForeignKey(
        Chemical,
        on_delete=models.SET_NULL,
        related_name="preparations",
        blank=True,
        null=True,
    )
    chemical_name = models.CharField(max_length=255, blank=True, null=True)
    chemical_category = models.CharField(
        max_length=10,
        choices=[
            ("major", "Major"),
            ("minor", "Minor"),
        ],
        blank=True,
        null=True,
    )
    chemical_percent = models.FloatField(
        validators=[MinValueValidator(0)], blank=True, null=True
    )
    chemical_concentration = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Chemical concentration (%)",
    )
    solution_concentration = models.FloatField(
        validators=[MinValueValidator(0)], blank=True, null=True
    )
    water_qty = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Water quantity (L)",
    )
    chemical_qty = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Chemical quantity (G)",
    )
    batch_no = models.CharField(max_length=100, blank=True, null=True)
    done_by = models.CharField(max_length=255, blank=True, null=True)

    remarks = models.TextField(
        blank=True, null=True, help_text="Operator remarks from entry form"
    )
    comment = models.TextField(
        blank=True, null=True, help_text="Separate comment field for list view"
    )
    checked_by = models.CharField(max_length=255, blank=True, null=True)
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="chemical_preparations",
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="draft"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_chemical_preparations",
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    secondary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="secondary_approved_chemical_preparations",
    )
    secondary_approved_at = models.DateTimeField(blank=True, null=True)
    corrects = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corrections",
        help_text="If this is a correction, points to the original preparation entry.",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chemical_preparations"
        ordering = ["-timestamp"]
        verbose_name = "Chemical Preparation"
        verbose_name_plural = "Chemical Preparations"

    def __str__(self):
        return (
            f"Chemical Preparation - {self.equipment_name} - {self.chemical_name} - {self.timestamp}"
        )
