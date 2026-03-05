from django.apps import AppConfig
from django.db import connection
from django.db.models.signals import post_migrate


class EquipmentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "equipment"

    def ready(self) -> None:  # pragma: no cover - signal wiring
        from .models import Department, EquipmentCategory

        def seed_defaults(sender, **kwargs):
            """
            Seed default departments and equipment categories.

            Guarded so it only runs after the equipment tables actually exist,
            to avoid errors during the very first migrate.
            """
            table_names = connection.introspection.table_names()
            if (
                Department._meta.db_table not in table_names
                or EquipmentCategory._meta.db_table not in table_names
            ):
                return

            # Default Departments
            default_departments = [
                "Engineering",
                "Production",
                "Quality",
                "Warehouse",
            ]
            for name in default_departments:
                Department.objects.get_or_create(name=name)

            # Default Equipment Categories
            default_categories = [
                "Chillers",
                "Boilers",
                "Cooling Towers",
                "Water System",
                "HVAC",
                "Air Compressor",
                "Nitrogen Air",
            ]
            for name in default_categories:
                EquipmentCategory.objects.get_or_create(name=name)

        post_migrate.connect(seed_defaults, sender=self)

