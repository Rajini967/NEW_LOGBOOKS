from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0013_alter_auditevent_event_type"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE manual_chiller_consumption
                DROP COLUMN IF EXISTS actual_cost_rs,
                DROP COLUMN IF EXISTS projected_cost_rs;
            """,
            reverse_sql="""
                ALTER TABLE manual_chiller_consumption
                ADD COLUMN IF NOT EXISTS actual_cost_rs double precision NULL,
                ADD COLUMN IF NOT EXISTS projected_cost_rs double precision NULL;
            """,
        ),
    ]
