from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("filter_master", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="filtercategory",
            name="micron_costs",
            field=models.JSONField(
                blank=True,
                null=True,
                default=dict,
                help_text="Optional mapping of micron size to cost, e.g. {'0.2': 100, '0.45': 80}.",
            ),
        ),
    ]

