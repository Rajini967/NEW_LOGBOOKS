from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ("boiler_logs", "0016_remove_boilerequipmentlimit_daily_chemical_limit_kg"),
    ]

    operations = [
        migrations.AlterField(
            model_name="boilerequipmentlimit",
            name="equipment_id",
            field=models.CharField(
                db_index=True,
                help_text="Boiler equipment identifier",
                max_length=100,
            ),
        ),
        migrations.AddConstraint(
            model_name="boilerequipmentlimit",
            constraint=models.UniqueConstraint(
                fields=("equipment_id", "effective_from"),
                name="uniq_boiler_limit_equipment_effective_from",
            ),
        ),
        migrations.AddConstraint(
            model_name="boilerequipmentlimit",
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(("effective_from__isnull", True)),
                fields=("equipment_id",),
                name="uniq_boiler_limit_equipment_default",
            ),
        ),
    ]
