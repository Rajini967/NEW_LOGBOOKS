import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0016_remove_manualboilerconsumption_chemical_kg"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualchillerconsumption",
            name="actual_electricity_cost_rs",
            field=models.FloatField(
                blank=True,
                help_text="Snapshot at save: power_kwh × electricity_rate_rs_per_kwh from effective chiller limit (Rs)",
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
    ]
