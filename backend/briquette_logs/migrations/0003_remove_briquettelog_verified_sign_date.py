from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("briquette_logs", "0002_briquettelog_verified_sign_date"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="briquettelog",
            name="verified_sign_date",
        ),
    ]
