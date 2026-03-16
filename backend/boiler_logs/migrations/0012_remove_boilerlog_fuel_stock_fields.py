from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("boiler_logs", "0011_activity_fields_and_nullable_readings"),
    ]

    operations = [
        migrations.RemoveField(model_name="boilerlog", name="diesel_stock_liters"),
        migrations.RemoveField(model_name="boilerlog", name="diesel_cost_rupees"),
        migrations.RemoveField(model_name="boilerlog", name="furnace_oil_stock_liters"),
        migrations.RemoveField(model_name="boilerlog", name="furnace_oil_cost_rupees"),
        migrations.RemoveField(model_name="boilerlog", name="brigade_stock_kg"),
        migrations.RemoveField(model_name="boilerlog", name="brigade_cost_rupees"),
    ]
