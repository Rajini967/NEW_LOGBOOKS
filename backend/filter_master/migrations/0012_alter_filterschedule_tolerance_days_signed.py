# Allow negative tolerance (days before/after nominal due for overdue boundary).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_master", "0011_filterschedule_tolerance_days"),
    ]

    operations = [
        migrations.AlterField(
            model_name="filterschedule",
            name="tolerance_days",
            field=models.IntegerField(
                blank=True,
                help_text="Days added to nominal due before marking overdue: positive = grace after due date, negative = overdue effective earlier.",
                null=True,
            ),
        ),
    ]
