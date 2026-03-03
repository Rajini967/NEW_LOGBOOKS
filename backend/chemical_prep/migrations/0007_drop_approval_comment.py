from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("chemical_prep", "0006_chemicalpreparation_batch_no_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE chemical_preparations DROP COLUMN IF EXISTS approval_comment;",
            reverse_sql="ALTER TABLE chemical_preparations ADD COLUMN approval_comment text;",
        ),
    ]

