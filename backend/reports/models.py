"""
Report Model - Centralized storage for all approved reports
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
import uuid


class Report(models.Model):
    """Centralized report model that stores references to all approved entries."""
    
    REPORT_TYPE_CHOICES = [
        ('utility', 'E Log Book'),
        ('chemical', 'Chemical Prep'),
        ('validation', 'HVAC Validation'),
        ('filter_register', 'Filter Register'),
        ('air_velocity', 'Air Velocity Test'),
        ('filter_integrity', 'Filter Integrity Test'),
        ('recovery', 'Recovery Test'),
        ('differential_pressure', 'Differential Pressure Test'),
        ('nvpc', 'NVPC Test'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Report type and source reference
    report_type = models.CharField(max_length=50, choices=REPORT_TYPE_CHOICES)
    source_id = models.UUIDField(help_text="ID of the original log/test entry")
    source_table = models.CharField(max_length=100, help_text="Name of the source table")
    
    # Report metadata
    title = models.CharField(max_length=255)
    site = models.CharField(max_length=255)
    
    # Creator information
    created_by = models.CharField(max_length=255)
    created_at = models.DateTimeField()
    
    # Approval information
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_reports'
    )
    approved_at = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True, null=True)
    
    # Timestamps
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'reports'
        ordering = ['-approved_at']
        verbose_name = 'Report'
        verbose_name_plural = 'Reports'
        indexes = [
            models.Index(fields=['report_type', 'approved_at']),
            models.Index(fields=['source_id', 'source_table']),
        ]
    
    def __str__(self):
        return f"{self.get_report_type_display()} - {self.title}"


class AuditEvent(models.Model):
    """
    Generic audit event for configuration and limit changes.
    """

    EVENT_TYPE_CHOICES = [
        ("limit_update", "Limit Update"),
        ("config_update", "Configuration Update"),
        ("log_update", "Log Update"),
        ("log_correction", "Log Correction"),
        ("log_created", "Log Created"),
        ("log_deleted", "Log Deleted"),
        ("log_approved", "Log Approved"),
        ("log_rejected", "Log Rejected"),
        ("entity_created", "Entity Created"),
        ("entity_updated", "Entity Updated"),
        ("entity_deleted", "Entity Deleted"),
        ("entity_approved", "Entity Approved"),
        ("entity_rejected", "Entity Rejected"),
        ("consumption_updated", "Consumption Updated"),
        # User lifecycle (21 CFR Part 11)
        ("user_created", "User Created"),
        ("password_changed", "Password Changed"),
        ("user_locked", "User Locked"),
        ("user_unlocked", "User Unlocked"),
        ("missing_slots_snapshot", "Missing Slots"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    event_type = models.CharField(max_length=64, choices=EVENT_TYPE_CHOICES)
    object_type = models.CharField(max_length=100)
    object_id = models.CharField(max_length=100, blank=True, null=True)
    field_name = models.CharField(max_length=100)
    old_value = models.TextField(blank=True, null=True)
    new_value = models.TextField(blank=True, null=True)
    extra = models.JSONField(blank=True, null=True)

    class Meta:
        db_table = "audit_events"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["-timestamp"]),
            models.Index(fields=["event_type", "-timestamp"]),
            models.Index(fields=["object_type", "-timestamp"]),
            models.Index(fields=["object_id", "-timestamp"]),
            models.Index(fields=["user", "-timestamp"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.event_type} on {self.object_type}:{self.object_id or ''}"


class MissingSlotsSnapshot(models.Model):
    """
    Persisted snapshot of missing-slot report payloads for audit traceability.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    log_type = models.CharField(max_length=32, db_index=True)
    date_from = models.DateField(db_index=True)
    date_to = models.DateField(db_index=True)
    day_count = models.PositiveIntegerField(default=1)
    total_missing_slots = models.PositiveIntegerField(default=0)
    payload = models.JSONField()
    filters = models.JSONField(blank=True, null=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="missing_slots_snapshots",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "missing_slots_snapshots"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["log_type", "date_from", "date_to"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.log_type} missing slots {self.date_from}..{self.date_to}"


class ManualChillerConsumption(models.Model):
    """Manual daily consumption entry for a chiller (overrides log-aggregated values when present)."""
    equipment_id = models.CharField(max_length=100, db_index=True)
    date = models.DateField(db_index=True)
    power_kwh = models.FloatField(default=0, blank=True)
    water_ct1_l = models.FloatField(default=0, blank=True)
    water_ct2_l = models.FloatField(default=0, blank=True)
    water_ct3_l = models.FloatField(default=0, blank=True)
    actual_electricity_cost_rs = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Snapshot at save: power_kwh × electricity_rate_rs_per_kwh from effective chiller limit (Rs)",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "manual_chiller_consumption"
        unique_together = [("equipment_id", "date")]
        ordering = ["equipment_id", "-date"]

    def __str__(self):
        return f"Chiller {self.equipment_id} {self.date}"


class ManualBoilerConsumption(models.Model):
    """Manual daily consumption entry for a boiler."""
    equipment_id = models.CharField(max_length=100, db_index=True)
    date = models.DateField(db_index=True)
    power_kwh = models.FloatField(default=0, blank=True)
    water_l = models.FloatField(default=0, blank=True)
    diesel_l = models.FloatField(default=0, blank=True)
    furnace_oil_l = models.FloatField(default=0, blank=True)
    brigade_kg = models.FloatField(default=0, blank=True)
    steam_kg_hr = models.FloatField(default=0, blank=True)
    actual_electricity_cost_rs = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Snapshot at save: power_kwh × electricity_rate_rs_per_kwh from effective boiler limit (Rs)",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "manual_boiler_consumption"
        unique_together = [("equipment_id", "date")]
        ordering = ["equipment_id", "-date"]

    def __str__(self):
        return f"Boiler {self.equipment_id} {self.date}"


class ManualChemicalConsumption(models.Model):
    """Manual daily chemical consumption per equipment and chemical."""
    equipment_name = models.CharField(max_length=255, db_index=True, blank=True, default="")
    chemical_name = models.CharField(max_length=255, db_index=True, blank=True, default="")
    date = models.DateField(db_index=True)
    quantity_kg = models.FloatField(default=0, blank=True)
    price_rs = models.FloatField(default=0, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "manual_chemical_consumption"
        unique_together = [("equipment_name", "chemical_name", "date")]
        ordering = ["-date"]

    def __str__(self):
        return f"Chemical {self.equipment_name}/{self.chemical_name} {self.date}"
