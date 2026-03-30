from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_logs", "0007_filterlog_area_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="filterlog",
            name="cleaning_applicable",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="filterlog",
            name="integrity_applicable",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="filterlog",
            name="replacement_applicable",
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name="filterlog",
            name="cleaning_due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="filterlog",
            name="integrity_due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="filterlog",
            name="replacement_due_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
