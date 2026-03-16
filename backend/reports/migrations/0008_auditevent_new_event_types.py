# Enterprise audit trail - new event types

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0007_manual_daily_consumption"),
    ]

    operations = [
        migrations.AlterField(
            model_name="auditevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("limit_update", "Limit Update"),
                    ("config_update", "Configuration Update"),
                    ("log_update", "Log Update"),
                    ("log_correction", "Log Correction"),
                    ("log_created", "Log Created"),
                    ("log_deleted", "Log Deleted"),
                    ("entity_created", "Entity Created"),
                    ("entity_updated", "Entity Updated"),
                    ("entity_deleted", "Entity Deleted"),
                    ("entity_approved", "Entity Approved"),
                    ("entity_rejected", "Entity Rejected"),
                    ("consumption_updated", "Consumption Updated"),
                    ("user_created", "User Created"),
                    ("password_changed", "Password Changed"),
                    ("user_locked", "User Locked"),
                    ("user_unlocked", "User Unlocked"),
                ],
                max_length=64,
            ),
        ),
    ]
