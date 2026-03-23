from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("compressor_logs", "0002_activity_fields_and_nullable_readings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="compressorlog",
            name="comment",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="compressorlog",
            name="corrects",
            field=models.ForeignKey(
                blank=True,
                help_text="If this is a correction, points to the original log entry.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="corrections",
                to="compressor_logs.compressorlog",
            ),
        ),
        migrations.AddField(
            model_name="compressorlog",
            name="secondary_approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="compressorlog",
            name="secondary_approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="secondary_approved_compressor_logs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="compressorlog",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("pending_secondary_approval", "Pending secondary approval"),
                ],
                default="draft",
                max_length=30,
            ),
        ),
    ]
