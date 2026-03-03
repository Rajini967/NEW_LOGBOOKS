"""
Report Model - Centralized storage for all approved reports
"""
from django.db import models
from django.conf import settings
import uuid


class Report(models.Model):
    """Centralized report model that stores references to all approved entries."""
    
    REPORT_TYPE_CHOICES = [
        ('utility', 'E Log Book'),
        ('chemical', 'Chemical Prep'),
        ('validation', 'HVAC Validation'),
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

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.event_type} on {self.object_type}:{self.object_id or ''}"
