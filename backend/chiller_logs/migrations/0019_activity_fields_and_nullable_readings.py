from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0018_alter_chillerequipmentstatusaudit_field_name_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="chillerlog",
            name="activity_type",
            field=models.CharField(
                choices=[("operation", "Operation"), ("maintenance", "Maintenance"), ("shutdown", "Shutdown")],
                default="operation",
                help_text="Activity status for this log entry (drives reading applicability).",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="chillerlog",
            name="activity_from_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="chillerlog",
            name="activity_to_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="chillerlog",
            name="activity_from_time",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="chillerlog",
            name="activity_to_time",
            field=models.TimeField(blank=True, null=True),
        ),
    ]

