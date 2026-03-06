from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("filter_logs", "0003_alter_filterlog_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterlog",
            name="tag_info",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]

