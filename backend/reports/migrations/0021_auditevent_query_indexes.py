from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0020_rename_chemical_kg_quantity_kg"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["-timestamp"], name="reports_aud_timestam_3321fd_idx"),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["event_type", "-timestamp"], name="reports_aud_event_t_9d830f_idx"),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["object_type", "-timestamp"], name="reports_aud_object__6f3886_idx"),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["object_id", "-timestamp"], name="reports_aud_object__bcfc41_idx"),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(fields=["user", "-timestamp"], name="reports_aud_user_id_61f422_idx"),
        ),
    ]
