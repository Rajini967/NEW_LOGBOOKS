from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0029_chiller_limit_datewise_uniqueness"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="chillerlog",
            name="verified_by",
        ),
    ]
