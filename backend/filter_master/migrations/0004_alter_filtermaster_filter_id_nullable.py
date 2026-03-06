from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("filter_master", "0003_filterschedule_approval_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="filtermaster",
            name="filter_id",
            field=models.CharField(
                max_length=32,
                unique=True,
                editable=False,
                blank=True,
                null=True,
                help_text="System-generated filter identifier (e.g. FMT-0001), assigned upon approval.",
            ),
        ),
    ]

