from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0024_remove_chillerlog_legacy_summary_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="chillerlog",
            name="recording_frequency",
        ),
    ]

