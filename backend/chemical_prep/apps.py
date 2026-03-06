from django.apps import AppConfig
from django.db import connection
from django.db.models.signals import post_migrate


class ChemicalPrepConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "chemical_prep"

    def ready(self) -> None:  # pragma: no cover - signal wiring
        from .models import Chemical, ChemicalStock

        def seed_chemicals_and_stock(sender, **kwargs):
            """
            Seed default chemicals and sample stock for initial setup.

            This is safe to run multiple times; it only creates missing entries.
            """

            table_names = connection.introspection.table_names()
            if Chemical._meta.db_table not in table_names:
                return

            chemicals_spec = [
                # Water system
                ("water_system", "NaOCl", "Sodium Hypochlorite"),
                ("water_system", "NaOH", "Sodium Hydroxide"),
                ("water_system", "SMBS", "Sodium Metabisulfite"),
                ("water_system", "NaClO₂", "Sodium Chlorite"),
                ("water_system", "NaCl", "Sodium Chloride"),
                ("water_system", "HCl", "Hydrochloric Acid"),
                ("water_system", "Citric acid", "Citric Acid"),
                ("water_system", "Nitric acid", "Nitric Acid"),
                ("water_system", "H2O2", "Hydrogen Peroxide"),
                ("water_system", "Minncare", "Minncare Disinfectant Solution"),
                ("water_system", "Antiscalant Grade", "Antiscalant Chemical"),
                ("water_system", "Antifoulant", "Antifoulant Chemical"),
                # Cooling towers
                ("cooling_towers", "Indochem CG 75", "Indochem CG 75"),
                ("cooling_towers", "Indochem CG 90", "Indochem CG 90"),
                ("cooling_towers", "Pennetreat 3110", "Pennetreat 3110"),
                ("cooling_towers", "Pennetreat 3007", "Pennetreat 3007"),
                ("cooling_towers", "Pennetreat 3009", "Pennetreat 3009"),
                # Boiler
                ("boiler", "Oxygen Scavenger", "Oxygen Scavenger"),
                ("boiler", "pH booster", "pH Booster"),
                ("boiler", "Antiscalant", "Antiscalant"),
            ]

            formula_to_stock = {
                "SMBS": (100.0, 150.0),
                "NaOH": (50.0, 120.0),
                "NaCl": (30.0, 100.0),
            }

            for location, formula, name in chemicals_spec:
                chemical, _ = Chemical.objects.get_or_create(
                    location=location,
                    formula=formula,
                    defaults={"name": name},
                )
                stock_info = formula_to_stock.get(formula)
                if not stock_info:
                    continue
                qty, price = stock_info
                ChemicalStock.objects.get_or_create(
                    chemical=chemical,
                    site="default",
                    defaults={
                        "available_qty_kg": qty,
                        "price_per_unit": price,
                    },
                )

        post_migrate.connect(seed_chemicals_and_stock, sender=self)
