from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0017_manualchillerconsumption_actual_electricity_cost_rs"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualboilerconsumption",
            name="actual_electricity_cost_rs",
            field=models.FloatField(
                blank=True,
                null=True,
                help_text="Snapshot at save: power_kwh × electricity_rate_rs_per_kwh from effective boiler limit (Rs)",
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
    ]
