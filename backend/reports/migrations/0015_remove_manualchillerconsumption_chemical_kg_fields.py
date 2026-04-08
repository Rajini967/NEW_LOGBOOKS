from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0014_remove_manualchillerconsumption_cost_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="manualchillerconsumption",
            name="chemical_ct1_kg",
        ),
        migrations.RemoveField(
            model_name="manualchillerconsumption",
            name="chemical_ct2_kg",
        ),
        migrations.RemoveField(
            model_name="manualchillerconsumption",
            name="chemical_ct3_kg",
        ),
    ]
