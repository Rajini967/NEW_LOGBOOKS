from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chemical_prep", "0023_chemicaldailylimit_uniq_chemical_daily_limit_default_single"),
    ]

    operations = [
        migrations.AddField(
            model_name="chemicaldailylimit",
            name="equipment_name",
            field=models.CharField(default="", help_text="Assigned equipment name for this limit.", max_length=255),
            preserve_default=False,
        ),
        migrations.RemoveConstraint(
            model_name="chemicaldailylimit",
            name="uniq_chemical_daily_limit_effective_from",
        ),
        migrations.RemoveConstraint(
            model_name="chemicaldailylimit",
            name="uniq_chemical_daily_limit_default_single",
        ),
        migrations.AddConstraint(
            model_name="chemicaldailylimit",
            constraint=models.UniqueConstraint(
                fields=("equipment_name", "effective_from"),
                name="uniq_chemical_daily_limit_equipment_effective_from",
            ),
        ),
        migrations.AddConstraint(
            model_name="chemicaldailylimit",
            constraint=models.UniqueConstraint(
                condition=models.Q(effective_from__isnull=True),
                fields=("equipment_name",),
                name="uniq_chemical_daily_limit_equipment_default_single",
            ),
        ),
    ]
