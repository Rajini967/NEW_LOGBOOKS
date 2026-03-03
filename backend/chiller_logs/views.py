from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from .models import ChillerLog, ChillerEquipmentStatusAudit
from .serializers import ChillerLogSerializer
from accounts.permissions import CanLogEntries, CanApproveReports
from reports.utils import log_limit_change


class ChillerLogViewSet(viewsets.ModelViewSet):
    """ViewSet for managing chiller logs."""
    permission_classes = [IsAuthenticated]
    serializer_class = ChillerLogSerializer
    queryset = ChillerLog.objects.all()
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set operator and apply daily pump/fan status logic with audit trail."""
        validated = serializer.validated_data
        equipment_id = validated.get('equipment_id')
        remarks = (validated.get('remarks') or '').strip()

        pump_fields = [
            'cooling_tower_pump_status',
            'chilled_water_pump_status',
            'cooling_tower_fan_status',
        ]

        pump_field_labels = {
            'cooling_tower_pump_status': 'Cooling Tower Pump',
            'chilled_water_pump_status': 'Chilled Water Pump',
            'cooling_tower_fan_status': 'Cooling Tower Fan',
        }

        overrides = {}
        changes = []

        first_log = None
        if equipment_id:
            today = timezone.localdate()
            first_log = (
                ChillerLog.objects.filter(
                    equipment_id=equipment_id,
                    timestamp__date=today,
                )
                .order_by('timestamp')
                .first()
            )

        # If a first log exists for the day, treat its pump/fan status
        # as the initial_equipment_status and compare against it.
        if first_log:
            for field in pump_fields:
                requested_value = validated.get(field, None)
                initial_value = getattr(first_log, field)

                # If nothing was sent for this field, reuse initial value
                if requested_value in [None, '']:
                    overrides[field] = initial_value
                    continue

                overrides[field] = requested_value

                # Track changes relative to first reading
                if requested_value != initial_value:
                    changes.append(
                        {
                            'field': field,
                            'label': pump_field_labels.get(field, field),
                            'old': initial_value,
                            'new': requested_value,
                        }
                    )

        # Enforce remarks when pump/fan status is changed relative to first reading
        if changes and not remarks:
            raise ValidationError(
                {'remarks': ['Remarks are required when changing pump/fan status.']}
            )

        # Auto-append change notes into remarks for compliance
        combined_remarks = remarks
        if changes:
            now = timezone.localtime()
            time_str = now.strftime('%H:%M')
            notes = []
            for change in changes:
                old_val = change['old'] if change['old'] not in [None, ''] else 'BLANK'
                new_val = change['new'] if change['new'] not in [None, ''] else 'BLANK'
                notes.append(
                    f"{change['label']} changed from {old_val} to {new_val} at {time_str}"
                )
            notes_text = '\n'.join(notes)
            combined_remarks = f"{remarks}\n{notes_text}".strip() if remarks else notes_text

        log = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email,
            remarks=combined_remarks,
            **overrides,
        )

        # Create audit trail entries for each changed field
        if changes:
            for change in changes:
                ChillerEquipmentStatusAudit.objects.create(
                    chiller_log=log,
                    field_name=change['field'],
                    old_value=change['old'],
                    new_value=change['new'],
                    changed_by=self.request.user,
                )

    def _is_first_log_of_day(self, log: ChillerLog) -> bool:
        """Return True if the given log is the first entry of the day for its equipment."""
        if not log.equipment_id or not log.timestamp:
            return False
        first_log = (
            ChillerLog.objects.filter(
                equipment_id=log.equipment_id,
                timestamp__date=log.timestamp.date(),
            )
            .order_by('timestamp')
            .first()
        )
        return bool(first_log and first_log.id == log.id)

    def update(self, request, *args, **kwargs):
        """
        Prevent editing the first verified reading of the day and
        record reading changes in the audit trail.
        """
        instance = self.get_object()
        if instance.status == 'approved' and self._is_first_log_of_day(instance):
            raise ValidationError(
                {
                    'detail': [
                        'First reading of the day cannot be edited after verification.'
                    ]
                }
            )
        # Capture old readings before update
        tracked_fields = [
            'chiller_supply_temp',
            'chiller_return_temp',
            'cooling_tower_supply_temp',
            'cooling_tower_return_temp',
            'ct_differential_temp',
            'chiller_water_inlet_pressure',
            'chiller_makeup_water_flow',
            'evap_water_inlet_pressure',
            'evap_water_outlet_pressure',
            'evap_entering_water_temp',
            'evap_leaving_water_temp',
            'evap_approach_temp',
            'cond_water_inlet_pressure',
            'cond_water_outlet_pressure',
            'cond_entering_water_temp',
            'cond_leaving_water_temp',
            'cond_approach_temp',
            'chiller_control_signal',
            'avg_motor_current',
            'compressor_running_time_min',
            'starter_energy_kwh',
            'cooling_tower_pump_status',
            'chilled_water_pump_status',
            'cooling_tower_fan_status',
            'cooling_tower_blowoff_valve_status',
            'cooling_tower_blowdown_time_min',
            'cooling_tower_chemical_name',
            'cooling_tower_chemical_qty_per_day',
            'chilled_water_pump_chemical_name',
            'chilled_water_pump_chemical_qty_kg',
            'cooling_tower_fan_chemical_name',
            'cooling_tower_fan_chemical_qty_kg',
            'recording_frequency',
            'operator_sign',
            'verified_by',
            'remarks',
            'comment',
            'status',
        ]
        old_values = {field: getattr(instance, field) for field in tracked_fields}

        response = super().update(request, *args, **kwargs)

        # Reload instance to get updated values
        updated = self.get_object()
        user = request.user
        extra_base = {
            "equipment_id": updated.equipment_id,
            "site_id": updated.site_id,
            "timestamp": timezone.localtime(updated.timestamp).isoformat() if updated.timestamp else None,
        }

        for field in tracked_fields:
            before = old_values.get(field)
            after = getattr(updated, field)
            if before == after:
                continue
            extra = dict(extra_base)
            extra["field_label"] = field
            log_limit_change(
                user=user,
                object_type="chiller_log",
                key=str(updated.id),
                field_name=field,
                old=before,
                new=after,
                extra=extra,
                event_type="log_update",
            )

        return response

    def partial_update(self, request, *args, **kwargs):
        """
        Prevent editing the first verified reading of the day and
        record reading changes in the audit trail (partial updates).
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a chiller log."""
        log = self.get_object()
        action_type = request.data.get('action', 'approve')
        remarks = request.data.get('remarks', '')
        
        if action_type == 'approve':
            log.status = 'approved'
        elif action_type == 'reject':
            log.status = 'rejected'
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        log.approved_by = request.user
        from django.utils import timezone
        log.approved_at = timezone.now()
        if remarks:
            log.comment = remarks
        log.save()
        
        # Create report entry when approved
        if action_type == 'approve':
            from reports.utils import create_report_entry
            title = f"Chiller Monitoring - {log.equipment_id or 'N/A'}"
            create_report_entry(
                report_type='utility',
                source_id=str(log.id),
                source_table='chiller_logs',
                title=title,
                site=log.equipment_id or 'N/A',
                created_by=log.operator_name or 'Unknown',
                created_at=log.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(log)
        return Response(serializer.data)
