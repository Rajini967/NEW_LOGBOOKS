from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("chemical_prep", "0021_drop_batch_no_unique_constraint"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChemicalDailyLimit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("effective_from", models.DateField(blank=True, help_text="Date from which this limit applies. Leave blank to apply to all dates.", null=True)),
                ("quantity", models.FloatField(blank=True, help_text="Daily chemical quantity limit", null=True, validators=[django.core.validators.MinValueValidator(0)])),
                ("price", models.FloatField(blank=True, help_text="Chemical price", null=True, validators=[django.core.validators.MinValueValidator(0)])),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Chemical Daily Limit",
                "verbose_name_plural": "Chemical Daily Limits",
                "db_table": "chemical_daily_limits",
                "ordering": ["-effective_from", "-updated_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="chemicaldailylimit",
            constraint=models.UniqueConstraint(fields=("effective_from",), name="uniq_chemical_daily_limit_effective_from"),
        ),
    ]
