from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0019_activity_fields_and_nullable_readings"),
    ]

    operations = [
        migrations.RemoveField(model_name="chillerlog", name="cooling_tower_chemical_name"),
        migrations.RemoveField(model_name="chillerlog", name="cooling_tower_chemical_qty_per_day"),
        migrations.RemoveField(model_name="chillerlog", name="chilled_water_pump_chemical_name"),
        migrations.RemoveField(model_name="chillerlog", name="chilled_water_pump_chemical_qty_kg"),
        migrations.RemoveField(model_name="chillerlog", name="cooling_tower_fan_chemical_name"),
        migrations.RemoveField(model_name="chillerlog", name="cooling_tower_fan_chemical_qty_kg"),
    ]
