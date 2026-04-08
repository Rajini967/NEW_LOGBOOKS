from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0028_remove_chiller_chemical_limit_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="chillerequipmentlimit",
            name="equipment_id",
            field=models.CharField(
                db_index=True,
                help_text="Chiller equipment identifier (e.g. equipment_number)",
                max_length=100,
            ),
        ),
        migrations.AddConstraint(
            model_name="chillerequipmentlimit",
            constraint=models.UniqueConstraint(
                fields=("equipment_id", "effective_from"),
                name="uniq_chiller_limit_equipment_effective_from",
            ),
        ),
        migrations.AddConstraint(
            model_name="chillerequipmentlimit",
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(("effective_from__isnull", True)),
                fields=("equipment_id",),
                name="uniq_chiller_limit_equipment_default",
            ),
        ),
    ]
