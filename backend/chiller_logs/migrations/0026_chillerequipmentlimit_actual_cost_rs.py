from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0025_remove_chillerlog_recording_frequency"),
    ]

    operations = [
        migrations.AddField(
            model_name="chillerequipmentlimit",
            name="actual_cost_rs",
            field=models.FloatField(
                blank=True,
                null=True,
                help_text="Latest actual cost snapshot (Rs) written from manual consumption save.",
            ),
        ),
    ]
