# Generated manually — renames stored roles: manager(Admin)->admin, client->manager

from django.db import migrations, models


def relabel_user_roles(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="manager").update(role="admin")
    User.objects.filter(role="client").update(role="manager")


def relabel_user_roles_reverse(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="manager").update(role="client")
    User.objects.filter(role="admin").update(role="manager")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0013_remove_sessionsetting_log_entry_tolerance_minutes"),
    ]

    operations = [
        migrations.RunPython(relabel_user_roles, relabel_user_roles_reverse),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("super_admin", "Super Admin"),
                    ("admin", "Admin"),
                    ("supervisor", "Supervisor"),
                    ("operator", "Operator"),
                    ("manager", "Manager"),
                ],
                default="operator",
                max_length=20,
            ),
        ),
    ]
