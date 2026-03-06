from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("chemical_prep", "0015_chemical_chemicalstock"),
    ]

    operations = [
        migrations.AddField(
            model_name="chemicalpreparation",
            name="chemical",
            field=models.ForeignKey(
                to="chemical_prep.chemical",
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="preparations",
                null=True,
                blank=True,
            ),
        ),
    ]

