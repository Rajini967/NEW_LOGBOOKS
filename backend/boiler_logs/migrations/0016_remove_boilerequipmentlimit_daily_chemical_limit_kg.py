from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("boiler_logs", "0015_alter_boilerlog_steam_consumption_kg_hr"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="boilerequipmentlimit",
            name="daily_chemical_limit_kg",
        ),
    ]
