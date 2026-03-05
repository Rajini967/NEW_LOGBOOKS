import uuid

from django.core.validators import RegexValidator
from django.db import models


class Department(models.Model):
    """Department master."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "departments"
        ordering = ["name"]
        verbose_name = "Department"
        verbose_name_plural = "Departments"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.name


class EquipmentCategory(models.Model):
    """Equipment category master."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "equipment_categories"
        ordering = ["name"]
        verbose_name = "Equipment Category"
        verbose_name_plural = "Equipment Categories"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.name


capacity_validator = RegexValidator(
    regex=r"^\d+(\.\d+)?(\s*\w.*)?$",
    message='Capacity must start with a number, e.g. "1000 TR" or "5 TPH".',
)


class Equipment(models.Model):
    """Equipment master."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_number = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique equipment identifier used in log entries.",
    )
    name = models.CharField(max_length=255)
    capacity = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        validators=[capacity_validator],
        help_text='Enter numeric value followed by optional unit, e.g. "1000 TR".',
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="equipment",
    )
    category = models.ForeignKey(
        EquipmentCategory,
        on_delete=models.PROTECT,
        related_name="equipment",
    )
    site_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Optional site identifier, for alignment with other logs.",
    )
    client_id = models.CharField(max_length=100, db_index=True, default="svu-enterprises")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "equipment"
        ordering = ["equipment_number"]
        verbose_name = "Equipment"
        verbose_name_plural = "Equipment"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.equipment_number} - {self.name}"

