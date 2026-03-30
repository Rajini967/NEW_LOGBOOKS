# Generated manually — align logbook_role_assignments with accounts role relabel

from django.db import migrations, models


def relabel_assignment_roles(apps, schema_editor):
    LogbookRoleAssignment = apps.get_model("logbooks", "LogbookRoleAssignment")
    LogbookRoleAssignment.objects.filter(role="manager").update(role="admin")
    LogbookRoleAssignment.objects.filter(role="client").update(role="manager")


def relabel_assignment_roles_reverse(apps, schema_editor):
    LogbookRoleAssignment = apps.get_model("logbooks", "LogbookRoleAssignment")
    LogbookRoleAssignment.objects.filter(role="manager").update(role="client")
    LogbookRoleAssignment.objects.filter(role="admin").update(role="manager")


class Migration(migrations.Migration):

    dependencies = [
        ("logbooks", "0003_alter_logbookroleassignment_role"),
        ("accounts", "0014_user_role_relabel_client_to_manager"),
    ]

    operations = [
        migrations.RunPython(relabel_assignment_roles, relabel_assignment_roles_reverse),
        migrations.AlterField(
            model_name="logbookroleassignment",
            name="role",
            field=models.CharField(
                choices=[
                    ("super_admin", "Super Admin"),
                    ("admin", "Admin"),
                    ("supervisor", "Supervisor"),
                    ("operator", "Operator"),
                    ("manager", "Manager"),
                ],
                max_length=20,
            ),
        ),
    ]
