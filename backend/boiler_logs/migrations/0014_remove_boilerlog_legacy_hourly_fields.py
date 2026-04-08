# Generated manually for removing legacy hourly parameters

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('boiler_logs', '0013_boilerequipmentlimit_effective_from'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='boilerlog',
            name='feed_water_temp',
        ),
        migrations.RemoveField(
            model_name='boilerlog',
            name='oil_temp',
        ),
        migrations.RemoveField(
            model_name='boilerlog',
            name='steam_temp',
        ),
        migrations.RemoveField(
            model_name='boilerlog',
            name='steam_pressure',
        ),
        migrations.RemoveField(
            model_name='boilerlog',
            name='steam_flow_lph',
        ),
    ]
