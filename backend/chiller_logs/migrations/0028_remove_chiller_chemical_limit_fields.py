from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0027_remove_chillerequipmentlimit_actual_cost_rs"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="chillerequipmentlimit",
            name="daily_chemical_ct1_kg",
        ),
        migrations.RemoveField(
            model_name="chillerequipmentlimit",
            name="daily_chemical_ct2_kg",
        ),
        migrations.RemoveField(
            model_name="chillerequipmentlimit",
            name="daily_chemical_ct3_kg",
        ),
    ]
