from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("chemical_prep", "0013_chemicalpreparation_chemical_fk_and_stock_check"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChemicalAssignment",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        primary_key=True,
                        default=uuid.uuid4,
                        editable=False,
                        serialize=False,
                    ),
                ),
                (
                    "equipment_name",
                    models.CharField(
                        max_length=255,
                        help_text="Equipment name or tag this chemical is assigned to.",
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        max_length=10,
                        choices=[("major", "Major"), ("minor", "Minor")],
                        help_text="Chemical category for this assignment (e.g. major / minor).",
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "chemical",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="assignments",
                        to="chemical_prep.chemical",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="chemical_assignments",
                        blank=True,
                        null=True,
                        to="accounts.user",
                    ),
                ),
            ],
            options={
                "db_table": "chemical_assignments",
                "ordering": ["equipment_name", "chemical__name"],
                "verbose_name": "Chemical Assignment",
                "verbose_name_plural": "Chemical Assignments",
            },
        ),
    ]

