# Generated manually for per-equipment log entry intervals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0004_equipment_approved_at_equipment_approved_by_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipment',
            name='log_entry_interval',
            field=models.CharField(
                blank=True,
                choices=[('hourly', 'Hourly'), ('shift', 'Shift'), ('daily', 'Daily')],
                help_text='Per-equipment log entry interval. Null = use global SessionSetting default.',
                max_length=10,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='equipment',
            name='shift_duration_hours',
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Shift length in hours; used when this equipment's log_entry_interval is 'shift'.",
                null=True,
            ),
        ),
    ]
