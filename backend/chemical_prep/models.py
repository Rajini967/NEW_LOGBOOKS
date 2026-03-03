from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
import uuid


class ChemicalPreparation(models.Model):
    """Chemical preparation log model."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Chemical preparation fields
    equipment_name = models.CharField(max_length=255, blank=True, null=True)
    chemical_name = models.CharField(max_length=255, blank=True, null=True)
    chemical_category = models.CharField(
        max_length=10,
        choices=[
            ('major', 'Major'),
            ('minor', 'Minor'),
        ],
        blank=True,
        null=True,
    )
    chemical_percent = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True)
    solution_concentration = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True)
    water_qty = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Water quantity (L)")
    chemical_qty = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Chemical quantity (G)")
    batch_no = models.CharField(max_length=100, blank=True, null=True)
    quantity_taken = models.FloatField(validators=[MinValueValidator(0)], blank=True, null=True, help_text="Quantity taken (L or Kg)")
    reason = models.TextField(blank=True, null=True)
    done_by = models.CharField(max_length=255, blank=True, null=True)
    
    remarks = models.TextField(blank=True, null=True, help_text="Operator remarks from entry form")
    comment = models.TextField(blank=True, null=True, help_text="Separate comment field for list view")
    checked_by = models.CharField(max_length=255, blank=True, null=True)
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='chemical_preparations'
    )
    operator_name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_chemical_preparations'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chemical_preparations'
        ordering = ['-timestamp']
        verbose_name = 'Chemical Preparation'
        verbose_name_plural = 'Chemical Preparations'

    def __str__(self):
        return f"Chemical Preparation - {self.equipment_name} - {self.chemical_name} - {self.timestamp}"
