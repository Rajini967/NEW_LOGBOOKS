from django.apps import AppConfig
from django.db import connection
from django.db.models.signals import post_migrate


class FilterMasterConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "filter_master"

    def ready(self) -> None:  # pragma: no cover - signal wiring
        from .models import FilterCategory

        def seed_defaults(sender, **kwargs):
            """
            Seed default filter categories.

            Guarded so it only runs after the filter category table actually exists,
            to avoid errors during the very first migrate.
            """

            table_names = connection.introspection.table_names()
            if FilterCategory._meta.db_table not in table_names:
                return

            default_categories = [
                "HVAC",
                "Water System",
                "Compressed Air",
                "Nitrogen Air",
                "Utilities",
            ]
            for name in default_categories:
                FilterCategory.objects.get_or_create(name=name)

        post_migrate.connect(seed_defaults, sender=self)

