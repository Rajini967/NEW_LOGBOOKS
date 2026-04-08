from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0015_remove_manualchillerconsumption_chemical_kg_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="manualboilerconsumption",
            name="chemical_kg",
        ),
    ]
