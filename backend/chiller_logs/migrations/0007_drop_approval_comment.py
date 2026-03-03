from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chiller_logs", "0006_alter_chillerlog_remarks"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE chiller_logs DROP COLUMN IF EXISTS approval_comment;",
            reverse_sql="ALTER TABLE chiller_logs ADD COLUMN approval_comment text;",
        ),
    ]

