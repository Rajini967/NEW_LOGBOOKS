from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0008_equipment_tolerance_minutes_v2"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE equipment
                    ADD COLUMN IF NOT EXISTS approval_comment text NOT NULL DEFAULT '';
                    ALTER TABLE equipment
                    ADD COLUMN IF NOT EXISTS rejection_comment text NOT NULL DEFAULT '';
                    """,
                    reverse_sql="""
                    ALTER TABLE equipment
                    DROP COLUMN IF EXISTS approval_comment;
                    ALTER TABLE equipment
                    DROP COLUMN IF EXISTS rejection_comment;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="equipment",
                    name="approval_comment",
                    field=models.TextField(
                        blank=True,
                        default="",
                        help_text="Comment provided when this equipment was approved.",
                    ),
                ),
                migrations.AddField(
                    model_name="equipment",
                    name="rejection_comment",
                    field=models.TextField(
                        blank=True,
                        default="",
                        help_text="Comment provided when this equipment was rejected.",
                    ),
                ),
            ],
        ),
    ]
