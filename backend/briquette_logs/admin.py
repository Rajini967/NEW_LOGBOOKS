from django.contrib import admin
from .models import BriquetteLog


@admin.register(BriquetteLog)
class BriquetteLogAdmin(admin.ModelAdmin):
    list_display = ("equipment_id", "status", "activity_type", "timestamp", "operator_name")
    list_filter = ("status", "activity_type")
    search_fields = ("equipment_id", "operator_name")
