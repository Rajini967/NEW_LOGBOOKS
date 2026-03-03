from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("boiler_logs", "0004_boilerlog_physical_format_fields"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE boiler_logs DROP COLUMN IF EXISTS approval_comment;",
            reverse_sql="ALTER TABLE boiler_logs ADD COLUMN approval_comment text;",
        ),
    ]

