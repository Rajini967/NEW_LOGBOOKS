from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
import uuid


class BriquetteLog(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("pending_secondary_approval", "Pending secondary approval"),
    ]

    ACTIVITY_TYPE_CHOICES = [
        ("operation", "Operation"),
        ("maintenance", "Maintenance"),
        ("shutdown", "Shutdown"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_id = models.CharField(max_length=100, db_index=True)
    site_id = models.CharField(max_length=100, blank=True, null=True)

    activity_type = models.CharField(max_length=16, choices=ACTIVITY_TYPE_CHOICES, default="operation")
    activity_from_date = models.DateField(blank=True, null=True)
    activity_to_date = models.DateField(blank=True, null=True)
    activity_from_time = models.TimeField(blank=True, null=True)
    activity_to_time = models.TimeField(blank=True, null=True)

    # Hourly/operation parameters from sheet
    time_slot = models.CharField(max_length=20, blank=True, null=True)
    steam_pressure = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True)
    furnace_pressure_mmwc = models.FloatField(blank=True, null=True)
    id_fan_op_percent = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True)
    pa_damper_position_1 = models.FloatField(blank=True, null=True)
    pa_damper_position_2 = models.FloatField(blank=True, null=True)
    metering_screw_percent = models.FloatField(blank=True, null=True)
    steam_reading_ton = models.FloatField(blank=True, null=True)
    steam_flow_kg_hr = models.FloatField(blank=True, null=True)
    stack_temp = models.FloatField(blank=True, null=True)
    furnace_temp = models.FloatField(blank=True, null=True)
    hot_air_temp = models.CharField(max_length=20, blank=True, null=True)
    feed_pump_1_2 = models.CharField(max_length=20, blank=True, null=True)
    operator_sign_date = models.CharField(max_length=255, blank=True, null=True)
    verified_sign_date = models.CharField(max_length=255, blank=True, null=True)

    # Water parameters block
    feed_water_ph = models.FloatField(blank=True, null=True)
    feed_water_hardness_ppm = models.FloatField(blank=True, null=True)
    feed_water_tds_ppm = models.FloatField(blank=True, null=True)
    boiler_water_ph = models.FloatField(blank=True, null=True)
    boiler_water_hardness_ppm = models.FloatField(blank=True, null=True)
    boiler_water_tds_ppm = models.FloatField(blank=True, null=True)

    total_steam_in_1_day = models.CharField(max_length=50, blank=True, null=True)
    total_steam_flow_ratio = models.CharField(max_length=50, blank=True, null=True)

    remarks = models.TextField(blank=True, null=True)
    comment = models.TextField(blank=True, null=True)

    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="briquette_logs",
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="draft")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_briquette_logs",
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    secondary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="secondary_approved_briquette_logs",
    )
    secondary_approved_at = models.DateTimeField(blank=True, null=True)
    corrects = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corrections",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "briquette_logs"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"Briquette {self.equipment_id} - {self.timestamp}"
