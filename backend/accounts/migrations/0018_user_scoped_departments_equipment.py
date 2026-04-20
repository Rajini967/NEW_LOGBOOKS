# Generated manually — replaces single FK assignments with M2M scope.

from django.db import migrations, models


def forwards_copy_fk_to_m2m(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for u in User.objects.all():
        dept_id = getattr(u, "assigned_department_id", None)
        if dept_id:
            u.scoped_departments.add(dept_id)
        eq_id = getattr(u, "assigned_equipment_id", None)
        if eq_id:
            u.scoped_equipment.add(eq_id)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0001_initial"),
        ("accounts", "0017_useractivitylog_attempted_email_failed_login_events"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="scoped_departments",
            field=models.ManyToManyField(
                blank=True,
                help_text="Departments this user may access (Supervisor/Operator/Manager); Admin/Super Admin ignore.",
                related_name="scope_users",
                to="equipment.department",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="scoped_equipment",
            field=models.ManyToManyField(
                blank=True,
                help_text="Equipment this user may access; combined with scoped departments on the server.",
                related_name="scope_users",
                to="equipment.equipment",
            ),
        ),
        migrations.RunPython(forwards_copy_fk_to_m2m, noop_reverse),
        migrations.RemoveField(model_name="user", name="assigned_department"),
        migrations.RemoveField(model_name="user", name="assigned_equipment"),
    ]
