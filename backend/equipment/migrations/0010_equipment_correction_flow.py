from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0009_equipment_approval_comment_rejection_comment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="equipment",
            name="equipment_number",
            field=models.CharField(
                db_index=True,
                help_text="Equipment identifier used in log entries.",
                max_length=100,
            ),
        ),
        migrations.AddField(
            model_name="equipment",
            name="corrects",
            field=models.ForeignKey(
                blank=True,
                help_text="Original rejected equipment record that this row corrects.",
                null=True,
                on_delete=models.SET_NULL,
                related_name="corrections",
                to="equipment.equipment",
            ),
        ),
        migrations.AlterField(
            model_name="equipment",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("pending_correction_entry", "Pending correction entry"),
                ],
                default="pending",
                help_text="Approval status for this equipment master record.",
                max_length=30,
            ),
        ),
    ]

