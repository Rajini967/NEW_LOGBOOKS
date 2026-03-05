import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class FilterLog(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('pending_secondary_approval', 'Pending secondary approval'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    equipment_id = models.CharField(max_length=100, db_index=True)
    category = models.CharField(max_length=100)
    filter_no = models.CharField(max_length=100)
    filter_micron = models.CharField(max_length=100, blank=True, null=True)
    filter_size = models.CharField(max_length=100, blank=True, null=True)

    installed_date = models.DateField()
    integrity_done_date = models.DateField(blank=True, null=True)
    integrity_due_date = models.DateField()
    cleaning_done_date = models.DateField(blank=True, null=True)
    cleaning_due_date = models.DateField()
    replacement_due_date = models.DateField()

    remarks = models.TextField(blank=True, null=True)

    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='filter_logs',
    )
    operator_name = models.CharField(max_length=255)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_filter_logs',
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    secondary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='secondary_approved_filter_logs',
    )
    secondary_approved_at = models.DateTimeField(blank=True, null=True)

    corrects = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='corrections',
        help_text="If this is a correction, points to the original log entry.",
    )

    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'filter_logs'
        ordering = ['-timestamp']
        verbose_name = 'Filter Log'
        verbose_name_plural = 'Filter Logs'

    def __str__(self):
        return f"Filter {self.equipment_id} - {self.timestamp}"

    def _compute_default_integrity_due(self):
        # installed_date + 6 months + 15 days (approximate 6 months as 182 days)
        base = self.installed_date
        return base + timedelta(days=182 + 15)

    def _compute_default_cleaning_due(self):
        # Same rule as integrity due
        base = self.installed_date
        return base + timedelta(days=182 + 15)

    def _compute_default_replacement_due(self):
        # installed_date + 1 year (365 days); UI will mention ±30 days
        base = self.installed_date
        return base + timedelta(days=365)

    def save(self, *args, **kwargs):
        # Auto-calculate due dates when missing
        if self.installed_date:
            if not self.integrity_due_date:
                self.integrity_due_date = self._compute_default_integrity_due()
            if not self.cleaning_due_date:
                self.cleaning_due_date = self._compute_default_cleaning_due()
            if not self.replacement_due_date:
                self.replacement_due_date = self._compute_default_replacement_due()

        super().save(*args, **kwargs)

