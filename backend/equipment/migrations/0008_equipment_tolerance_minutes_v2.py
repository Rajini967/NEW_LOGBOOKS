from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0007_remove_equipment_tolerance_minutes"),
    ]

    operations = [
        # Add tolerance_minutes field in state only, and in the database using
        # a conditional ADD COLUMN so it does not fail if the column already exists.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE equipment
                    ADD COLUMN IF NOT EXISTS tolerance_minutes integer NULL;
                    """,
                    reverse_sql="""
                    ALTER TABLE equipment
                    DROP COLUMN IF EXISTS tolerance_minutes;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="equipment",
                    name="tolerance_minutes",
                    field=models.PositiveIntegerField(
                        null=True,
                        blank=True,
                        help_text="Per-equipment tolerance window in minutes (±). Null/0 = no tolerance highlighting.",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="equipment",
            name="tolerance_enabled_at",
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text="Timestamp when tolerance_minutes was first configured; used to avoid coloring old logs.",
            ),
        ),
    ]

