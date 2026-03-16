from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
import uuid


class BoilerLog(models.Model):
    """Boiler monitoring log model."""
    
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
    
    # Boiler specific readings
    feed_water_temp = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Feed water temperature (°C)")
    oil_temp = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Oil temperature (°C)")
    steam_temp = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam temperature (°C)")
    steam_pressure = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam pressure (bar)")
    steam_flow_lph = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam flow (LPH)")

    # Section 1: Hourly Parameters (physical format)
    fo_hsd_ng_day_tank_level = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="FO/HSD/NG day tank level (Ltr)")
    feed_water_tank_level = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Feed water tank level (KL)")
    fo_pre_heater_temp = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="FO pre heater temp 60-70°C")
    burner_oil_pressure = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Burner oil pressure 18-25 kg/cm²")
    burner_heater_temp = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Burner heater temp 120±10°C")
    boiler_steam_pressure = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Boiler steam pressure NLT 5 kg/cm²")
    stack_temperature = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Stack temperature 180-250°C")
    steam_pressure_after_prv = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam pressure after PRV NLT 5 kg/cm²")

    # Section 2: Shift Parameters
    feed_water_hardness_ppm = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Feed water hardness NMT 5 PPM")
    feed_water_tds_ppm = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Feed water TDS NMT 700 PPM")
    fo_hsd_ng_consumption = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="FO/HSD/NG consumption ending of shift (Ltr)")
    mobrey_functioning = models.CharField(max_length=10, blank=True, null=True, help_text="Mobrey functioning Yes/No")
    manual_blowdown_time = models.CharField(max_length=20, blank=True, null=True, help_text="Manual blow down time e.g. 14:30")

    # Daily consumption for limit validation
    daily_power_consumption_kwh = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily power consumption (kWh)")
    daily_water_consumption_liters = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily water consumption (L)")
    daily_chemical_consumption_kg = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily chemical consumption (kg)")
    # Oil consumption by type (for limits and efficiency)
    daily_diesel_consumption_liters = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily diesel consumption (L)")
    daily_furnace_oil_consumption_liters = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily furnace oil consumption (L)")
    daily_brigade_consumption_kg = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily brigade consumption (kg)")
    steam_consumption_kg_hr = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam consumption (kg/hr); if null, steam_flow_lph used as proxy")

    remarks = models.TextField(blank=True, null=True, help_text="Operator remarks from entry form")
    comment = models.TextField(blank=True, null=True, help_text="Separate comment field for list view")
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='boiler_logs'
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_boiler_logs'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    secondary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='secondary_approved_boiler_logs'
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
        db_table = 'boiler_logs'
        ordering = ['-timestamp']
        verbose_name = 'Boiler Log'
        verbose_name_plural = 'Boiler Logs'

    def __str__(self):
        return f"Boiler {self.equipment_id} - {self.timestamp}"


class BoilerEquipmentLimit(models.Model):
    """Daily consumption limits per boiler equipment (power, water, chemical)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_id = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Boiler equipment identifier",
    )
    client_id = models.CharField(max_length=100, db_index=True, blank=True, null=True)
    effective_from = models.DateField(
        blank=True,
        null=True,
        help_text="Date from which this limit applies. Leave blank to apply to all dates.",
    )
    daily_power_limit_kw = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Daily power consumption limit (kW)",
    )
    daily_water_limit_liters = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Daily water consumption limit (liters)",
    )
    daily_chemical_limit_kg = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Daily chemical consumption limit (kg)",
    )
    # Oil limits by type
    daily_diesel_limit_liters = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily diesel consumption limit (L)")
    daily_furnace_oil_limit_liters = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily furnace oil consumption limit (L)")
    daily_brigade_limit_kg = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Daily brigade consumption limit (kg)")
    daily_steam_limit_kg_hr = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Steam consumption limit (kg/hr)")
    # Rates for cost calculation (Rs per unit)
    electricity_rate_rs_per_kwh = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Electricity rate (Rs/kWh)")
    diesel_rate_rs_per_liter = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Diesel rate (Rs/L)")
    furnace_oil_rate_rs_per_liter = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Furnace oil rate (Rs/L)")
    brigade_rate_rs_per_kg = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Brigade rate (Rs/kg)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'boiler_equipment_limits'
        ordering = ['equipment_id']
        verbose_name = 'Boiler Equipment Limit'
        verbose_name_plural = 'Boiler Equipment Limits'

    def __str__(self):
        return f"Limits for {self.equipment_id}"


class BoilerDashboardConfig(models.Model):
    """
    Optional singleton config for boiler dashboard: projected power and oil cost.
    Used for "actual vs projected" and "actual vs projected opex cost" on the dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projected_power_kwh_month = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Projected power consumption per month (kWh) for comparison",
    )
    projected_oil_cost_rs_month = models.FloatField(
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text="Projected oil cost per month (Rs) for comparison",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'boiler_dashboard_configs'
        verbose_name = 'Boiler Dashboard Config'
        verbose_name_plural = 'Boiler Dashboard Configs'

    def __str__(self):
        return "Boiler dashboard config"
