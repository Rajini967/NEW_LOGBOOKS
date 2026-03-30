from django.db import models
from django.conf import settings
import uuid

from accounts.models import UserRole


class LogbookSchema(models.Model):
    """Logbook schema/template definition."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    client_id = models.CharField(max_length=100, default='svu-enterprises')
    category = models.CharField(
        max_length=50,
        choices=[
            ('utility', 'Utility'),
            ('maintenance', 'Maintenance'),
            ('quality', 'Quality Control'),
            ('safety', 'Safety'),
            ('validation', 'Validation'),
            ('custom', 'Custom'),
        ],
        default='custom'
    )
    fields = models.JSONField(default=list)
    workflow = models.JSONField(blank=True, default=dict)
    display = models.JSONField(blank=True, default=dict)
    metadata = models.JSONField(blank=True, default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_logbooks'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'logbook_schemas'
        ordering = ['-created_at']
        verbose_name = 'Logbook Schema'
        verbose_name_plural = 'Logbook Schemas'

    def __str__(self):
        return self.name


class LogbookRoleAssignment(models.Model):
    """Tracks which roles can access which logbooks."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    schema = models.ForeignKey(
        LogbookSchema,
        on_delete=models.CASCADE,
        related_name='role_assignments'
    )
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_logbook_roles'
    )

    class Meta:
        db_table = 'logbook_role_assignments'
        unique_together = [['schema', 'role']]
        ordering = ['role']
        verbose_name = 'Logbook Role Assignment'
        verbose_name_plural = 'Logbook Role Assignments'

    def __str__(self):
        return f"{self.schema.name} - {self.role}"


class LogbookEntry(models.Model):
    """Individual logbook entry/record."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    schema = models.ForeignKey(
        LogbookSchema,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    client_id = models.CharField(max_length=100)
    site_id = models.CharField(max_length=100, blank=True, null=True)
    data = models.JSONField(default=dict)
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='logbook_entries'
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('pending', 'Pending'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        default='draft'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_logbook_entries'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    attachments = models.JSONField(blank=True, default=list)
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'logbook_entries'
        ordering = ['-timestamp']
        verbose_name = 'Logbook Entry'
        verbose_name_plural = 'Logbook Entries'

    def __str__(self):
        return f"{self.schema.name} - {self.operator_name} - {self.timestamp}"
