from django.contrib import admin
from .models import FilterDashboardConfig


@admin.register(FilterDashboardConfig)
class FilterDashboardConfigAdmin(admin.ModelAdmin):
    list_display = [
        'projected_replacement_count_month',
        'projected_cleaning_count_month',
        'projected_integrity_count_month',
        'projected_cost_rs_month',
        'updated_at',
    ]
