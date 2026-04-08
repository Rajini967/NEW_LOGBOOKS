from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0019_manualchemicalconsumption_equipment_chemical_price"),
    ]

    operations = [
        migrations.RenameField(
            model_name="manualchemicalconsumption",
            old_name="chemical_kg",
            new_name="quantity_kg",
        ),
    ]
