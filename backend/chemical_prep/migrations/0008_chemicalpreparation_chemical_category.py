from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chemical_prep", "0007_drop_approval_comment"),
    ]

    operations = [
        migrations.AddField(
            model_name="chemicalpreparation",
            name="chemical_category",
            field=models.CharField(
                max_length=10,
                blank=True,
                null=True,
                choices=[
                    ("major", "Major"),
                    ("minor", "Minor"),
                ],
            ),
        ),
    ]

