from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_pending_correction_to_secondary(apps, schema_editor):
    Equipment = apps.get_model("equipment", "Equipment")
    Equipment.objects.filter(status="pending_correction_entry").update(
        status="pending_secondary_approval"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0010_equipment_correction_flow"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="equipment",
            name="secondary_approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="equipment",
            name="secondary_approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="secondary_approved_equipment",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="equipment",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("pending_secondary_approval", "Pending secondary approval"),
                ],
                default="pending",
                help_text="Approval status for this equipment master record.",
                max_length=30,
            ),
        ),
        migrations.RunPython(
            migrate_pending_correction_to_secondary,
            migrations.RunPython.noop,
        ),
    ]
