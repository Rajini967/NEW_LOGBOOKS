from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_logs", "0006_filterlog_comment"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterlog",
            name="area_category",
            field=models.CharField(
                blank=True,
                help_text="Area category from filter assignment (Register), e.g. Utility, AHU Room.",
                max_length=100,
                null=True,
            ),
        ),
    ]
