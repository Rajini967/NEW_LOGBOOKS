# Generated manually for FilterSchedule.tolerance_days

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_master", "0010_alter_filterschedule_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterschedule",
            name="tolerance_days",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Extra days after next_due_date before the schedule is treated as overdue (grace period).",
                null=True,
            ),
        ),
    ]
