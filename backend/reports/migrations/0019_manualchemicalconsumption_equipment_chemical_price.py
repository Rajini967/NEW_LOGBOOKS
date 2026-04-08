from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0018_manualboilerconsumption_actual_electricity_cost_rs"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualchemicalconsumption",
            name="chemical_name",
            field=models.CharField(blank=True, db_index=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="manualchemicalconsumption",
            name="equipment_name",
            field=models.CharField(blank=True, db_index=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="manualchemicalconsumption",
            name="price_rs",
            field=models.FloatField(blank=True, default=0),
        ),
        migrations.AlterField(
            model_name="manualchemicalconsumption",
            name="date",
            field=models.DateField(db_index=True),
        ),
        migrations.AlterUniqueTogether(
            name="manualchemicalconsumption",
            unique_together={("equipment_name", "chemical_name", "date")},
        ),
    ]
