from django.contrib import admin
from .models import BoilerLog, BoilerEquipmentLimit, BoilerDashboardConfig


@admin.register(BoilerLog)
class BoilerLogAdmin(admin.ModelAdmin):
    list_display = ['equipment_id', 'feed_water_temp', 'steam_temp', 'steam_pressure', 'operator_name', 'status', 'timestamp']
    list_filter = ['status', 'timestamp']
    search_fields = ['equipment_id', 'operator_name', 'site_id']
    readonly_fields = ['id', 'operator', 'operator_name', 'approved_by', 'approved_at', 'timestamp', 'created_at', 'updated_at']
    date_hierarchy = 'timestamp'


@admin.register(BoilerEquipmentLimit)
class BoilerEquipmentLimitAdmin(admin.ModelAdmin):
    list_display = ['equipment_id', 'daily_power_limit_kw', 'daily_water_limit_liters', 'daily_chemical_limit_kg']
    search_fields = ['equipment_id']


@admin.register(BoilerDashboardConfig)
class BoilerDashboardConfigAdmin(admin.ModelAdmin):
    list_display = ['id', 'projected_power_kwh_month', 'projected_oil_cost_rs_month']
