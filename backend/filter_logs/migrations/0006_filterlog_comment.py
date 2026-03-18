from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_logs", "0005_activity_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterlog",
            name="comment",
            field=models.TextField(blank=True, null=True),
        ),
    ]

