from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0026_chillerequipmentlimit_actual_cost_rs"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="chillerequipmentlimit",
            name="actual_cost_rs",
        ),
    ]
