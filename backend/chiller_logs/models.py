from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.validators import MinValueValidator
import uuid


class ChillerLog(models.Model):
    """Chiller monitoring log model."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('pending_secondary_approval', 'Pending secondary approval'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_id = models.CharField(max_length=100, db_index=True)
    site_id = models.CharField(max_length=100, blank=True, null=True)

    ACTIVITY_TYPE_CHOICES = [
        ("operation", "Operation"),
        ("maintenance", "Maintenance"),
        ("shutdown", "Shutdown"),
    ]
    activity_type = models.CharField(
        max_length=16,
        choices=ACTIVITY_TYPE_CHOICES,
        default="operation",
        help_text="Activity status for this log entry (drives reading applicability).",
    )
    activity_from_date = models.DateField(blank=True, null=True)
    activity_to_date = models.DateField(blank=True, null=True)
    activity_from_time = models.TimeField(blank=True, null=True)
    activity_to_time = models.TimeField(blank=True, null=True)
    
    # Detailed readings from physical sheet
    # Evaporator section
    evap_water_inlet_pressure = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Evap water inlet pressure (e.g. NLT 2.5 kg/cm²)"
    )
    evap_water_outlet_pressure = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Evap water outlet pressure"
    )
    evap_entering_water_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Evap entering water temperature (NMT 18 °C)"
    )
    evap_leaving_water_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Evap leaving water temperature (e.g. 13 °C)"
    )
    evap_approach_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Evap approach temperature (NMT 4 °C)"
    )

    # Condenser section
    cond_water_inlet_pressure = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cond water inlet pressure (e.g. NLT 1.5 kg/cm²)"
    )
    cond_water_outlet_pressure = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cond water outlet pressure (e.g. NLT 1.0 kg/cm²)"
    )
    cond_entering_water_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cond entering water temperature (NMT 35 °C)"
    )
    cond_leaving_water_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cond leaving water temperature (NMT 40 °C)"
    )
    cond_approach_temp = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cond approach temperature"
    )

    # Compressor / electrical section
    chiller_control_signal = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Chiller control signal (%)"
    )
    avg_motor_current = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Average motor current (A)"
    )
    compressor_running_time_min = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Compressor running time (minutes)"
    )
    starter_energy_kwh = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Starter energy consumption (kWh)"
    )

    # Footer section - equipment status and chemicals (from physical log sheet)
    cooling_tower_pump_status = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Cooling tower-1 1/2 status (On/Off)"
    )
    chilled_water_pump_status = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Chilled water pump 1/2 status (On/Off)"
    )
    cooling_tower_fan_status = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Cooling tower fan 1/2/3 status (On/Off)"
    )
    cooling_tower_blowoff_valve_status = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Cooling tower blow off valve status (Open/Close)"
    )
    cooling_tower_blowdown_time_min = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower blow down time (minutes)"
    )
    # Daily water consumption per cooling tower (liters) - for limit validation
    daily_water_consumption_ct1_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 1 daily water consumption (liters)"
    )
    daily_water_consumption_ct2_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 2 daily water consumption (liters)"
    )
    daily_water_consumption_ct3_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 3 daily water consumption (liters)"
    )
    operator_sign = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Operator Sign & Date"
    )
    
    remarks = models.TextField(blank=True, null=True, help_text="Operator remarks from entry form")
    comment = models.TextField(blank=True, null=True, help_text="Separate comment field for list view")
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='chiller_logs'
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_chiller_logs'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    secondary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='secondary_approved_chiller_logs'
    )
    secondary_approved_at = models.DateTimeField(blank=True, null=True)
    corrects = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='corrections',
        help_text="If this is a correction, points to the original log entry.",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chiller_logs'
        ordering = ['-timestamp']
        verbose_name = 'Chiller Log'
        verbose_name_plural = 'Chiller Logs'

    def __str__(self):
        return f"Chiller {self.equipment_id} - {self.timestamp}"


class ChillerEquipmentStatusAudit(models.Model):
    """Audit trail for pump/fan status changes on chiller logs."""

    FIELD_CHOICES = [
        ('cooling_tower_pump_status', 'Cooling Tower-1 1/2'),
        ('chilled_water_pump_status', 'Chilled Water Pump 1/2'),
        ('cooling_tower_fan_status', 'Cooling Tower Fan 1/2/3'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chiller_log = models.ForeignKey(
        ChillerLog,
        on_delete=models.CASCADE,
        related_name='equipment_status_audits',
    )
    field_name = models.CharField(max_length=64, choices=FIELD_CHOICES)
    old_value = models.CharField(max_length=100, blank=True, null=True)
    new_value = models.CharField(max_length=100)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='chiller_equipment_status_changes',
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chiller_equipment_status_audits'
        ordering = ['-changed_at']
        verbose_name = 'Chiller Equipment Status Audit'
        verbose_name_plural = 'Chiller Equipment Status Audits'

    def __str__(self):
        return f"{self.get_field_name_display()} change on log {self.chiller_log_id}"


class ChillerEquipmentLimit(models.Model):
    """
    Daily consumption limits per chiller equipment (power, water CT-1/2/3, chemical CT-1/2/3).
    Used to validate chiller log entries; null means no limit.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_id = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Chiller equipment identifier (e.g. equipment_number)"
    )
    client_id = models.CharField(max_length=100, db_index=True, blank=True, null=True)
    effective_from = models.DateField(
        blank=True,
        null=True,
        help_text="Date from which this limit applies. Leave blank to apply to all dates."
    )
    # Power category - daily limit in kW
    daily_power_limit_kw = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Daily power consumption limit (kW)"
    )
    electricity_rate_rs_per_kwh = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Electricity rate (Rs/kWh) for cost calculation",
    )
    # Water category - daily limits in liters per cooling tower
    daily_water_ct1_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 1 daily water consumption limit (liters)"
    )
    daily_water_ct2_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 2 daily water consumption limit (liters)"
    )
    daily_water_ct3_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Cooling tower 3 daily water consumption limit (liters)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chiller_equipment_limits"
        ordering = ["equipment_id"]
        verbose_name = "Chiller Equipment Limit"
        verbose_name_plural = "Chiller Equipment Limits"
        constraints = [
            models.UniqueConstraint(
                fields=["equipment_id", "effective_from"],
                name="uniq_chiller_limit_equipment_effective_from",
            ),
            models.UniqueConstraint(
                fields=["equipment_id"],
                condition=Q(effective_from__isnull=True),
                name="uniq_chiller_limit_equipment_default",
            ),
        ]

    def __str__(self):
        return f"Limits for {self.equipment_id}"


class ChillerDashboardConfig(models.Model):
    """
    Optional singleton config for chiller dashboard: projected power and electricity rate.
    Used for "actual vs projected" and "actual vs projected opex cost" on the dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projected_power_kwh_month = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Projected power consumption per month (kWh) for comparison",
    )
    electricity_rate_rs_per_kwh = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Electricity rate (Rs per kWh) for cost calculation",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chiller_dashboard_config"
        verbose_name = "Chiller Dashboard Config"
        verbose_name_plural = "Chiller Dashboard Config"

    def __str__(self):
        return "Chiller dashboard config"
