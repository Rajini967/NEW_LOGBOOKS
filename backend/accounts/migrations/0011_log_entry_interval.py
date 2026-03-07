# Generated manually for log entry interval (hourly/shift/daily)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_password_policy_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='sessionsetting',
            name='log_entry_interval',
            field=models.CharField(
                choices=[('hourly', 'Hourly'), ('shift', 'Shift'), ('daily', 'Daily')],
                default='hourly',
                help_text='Common log book entry interval for all log monitors (chiller, boiler, filter, chemical, etc.).',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='sessionsetting',
            name='shift_duration_hours',
            field=models.PositiveIntegerField(
                default=8,
                help_text="Shift length in hours; used when log_entry_interval is 'shift' for next-entry-due calculation.",
            ),
        ),
    ]
