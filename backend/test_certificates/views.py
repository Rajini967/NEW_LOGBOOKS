from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import CanLogEntries, CanApproveReports, IsSuperAdmin, forbid_manager_rejecting_reading
from reports.utils import log_audit_event

from .models import (
    AirVelocityTest, AirVelocityRoom, AirVelocityFilter,
    FilterIntegrityTest, FilterIntegrityRoom, FilterIntegrityReading,
    RecoveryTest, RecoveryDataPoint,
    DifferentialPressureTest, DifferentialPressureReading,
    NVPCTest, NVPCRoom, NVPCSamplingPoint,
)

from .serializers import (
    AirVelocityTestSerializer,
    FilterIntegrityTestSerializer,
    RecoveryTestSerializer,
    DifferentialPressureTestSerializer,
    NVPCTestSerializer,
)


class BaseTestCertificateViewSet(viewsets.ModelViewSet):
    """Base ViewSet for test certificates."""
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Different permissions for different actions."""
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAuthenticated(), CanLogEntries()]
        elif self.action == 'approve':
            return [IsAuthenticated(), CanApproveReports()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set operator when creating a test."""
        instance = serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
        log_audit_event(
            user=self.request.user,
            event_type="entity_created",
            object_type=getattr(instance._meta, "model_name", type(instance).__name__.lower()) or "test_certificate",
            object_id=str(instance.id),
            field_name="created",
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve or reject a test certificate."""
        test = self.get_object()
        previous_status = test.status
        action_type = request.data.get('action', 'approve')
        remarks = request.data.get('remarks', '')
        forbid_manager_rejecting_reading(request, action_type)

        if action_type == 'approve':
            test.status = 'approved'
        elif action_type == 'reject':
            test.status = 'rejected'
        else:
            return Response(
                {'error': 'Invalid action. Use "approve" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        test.approved_by = request.user
        from django.utils import timezone
        test.approved_at = timezone.now()
        if remarks:
            test.remarks = remarks
        test.save()

        log_audit_event(
            user=request.user,
            event_type="log_approved" if action_type == "approve" else "log_rejected",
            object_type=test._meta.model_name,
            object_id=str(test.id),
            field_name="status",
            old_value=previous_status,
            new_value=test.status,
            extra={"remarks": remarks} if remarks else {},
        )
        
        # Create report entry when approved
        if action_type == 'approve':
            from reports.utils import create_report_entry
            
            # Determine report type and title based on test type
            report_type_map = {
                'AirVelocityTest': ('air_velocity', f"Air Velocity Test - {test.certificate_no}"),
                'FilterIntegrityTest': ('filter_integrity', f"Filter Integrity Test - {test.certificate_no}"),
                'RecoveryTest': ('recovery', f"Recovery Test - {test.certificate_no}"),
                'DifferentialPressureTest': ('differential_pressure', f"Differential Pressure Test - {test.certificate_no}"),
                'NVPCTest': ('nvpc', f"NVPC Test - {test.certificate_no}"),
            }
            
            test_class_name = test.__class__.__name__
            report_type, title = report_type_map.get(test_class_name, ('unknown', f"Test - {test.certificate_no}"))
            
            table_map = {
                'AirVelocityTest': 'air_velocity_tests',
                'FilterIntegrityTest': 'filter_integrity_tests',
                'RecoveryTest': 'recovery_tests',
                'DifferentialPressureTest': 'differential_pressure_tests',
                'NVPCTest': 'nvpc_tests',
            }
            source_table = table_map.get(test_class_name, 'test_certificates')
            
            create_report_entry(
                report_type=report_type,
                source_id=str(test.id),
                source_table=source_table,
                title=title,
                site=test.ahu_number or 'N/A',
                created_by=test.prepared_by or 'Unknown',
                created_at=test.created_at,
                approved_by=request.user,
                remarks=remarks
            )
        
        serializer = self.get_serializer(test)
        return Response(serializer.data)


class AirVelocityTestViewSet(BaseTestCertificateViewSet):
    """ViewSet for managing air velocity tests."""
    serializer_class = AirVelocityTestSerializer
    queryset = AirVelocityTest.objects.all()
    
    def create(self, request, *args, **kwargs):
        """Create test with nested rooms and filters."""
        # Make a copy of request.data to avoid mutating the original
        data = request.data.copy()
        rooms_data = data.pop('rooms', [])
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        # Create the test
        test = serializer.save(
            operator=request.user,
            operator_name=request.user.name or request.user.email
        )
        
        # Create rooms and filters
        for room_data in rooms_data:
            filters_data = room_data.pop('filters', [])
            room = AirVelocityRoom.objects.create(
                test=test,
                room_name=room_data.get('room_name'),
                room_number=room_data.get('room_number'),
                total_air_flow_cfm=room_data.get('total_air_flow_cfm', 0),
                room_volume_cft=room_data.get('room_volume_cft', 0),
                ach=room_data.get('ach', 0),
                design_acph=room_data.get('design_acph')
            )
            
            for filter_data in filters_data:
                AirVelocityFilter.objects.create(
                    room=room,
                    filter_id=filter_data.get('filter_id'),
                    filter_area=filter_data.get('filter_area', 0),
                    reading_1=filter_data.get('reading_1', 0),
                    reading_2=filter_data.get('reading_2', 0),
                    reading_3=filter_data.get('reading_3', 0),
                    reading_4=filter_data.get('reading_4', 0),
                    reading_5=filter_data.get('reading_5', 0),
                    avg_velocity=filter_data.get('avg_velocity', 0),
                    air_flow_cfm=filter_data.get('air_flow_cfm', 0)
                )
        
        # Return the created test with nested data
        response_serializer = self.get_serializer(test)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class FilterIntegrityTestViewSet(BaseTestCertificateViewSet):
    """ViewSet for managing filter integrity tests."""
    serializer_class = FilterIntegrityTestSerializer
    queryset = FilterIntegrityTest.objects.all()
    
    def create(self, request, *args, **kwargs):
        """Create test with nested rooms and readings."""
        data = request.data.copy()
        rooms_data = data.pop('rooms', [])
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        test = serializer.save(
            operator=request.user,
            operator_name=request.user.name or request.user.email
        )
        
        # Create rooms and readings
        for room_data in rooms_data:
            readings_data = room_data.pop('readings', [])
            room = FilterIntegrityRoom.objects.create(
                test=test,
                room_name=room_data.get('room_name'),
                room_number=room_data.get('room_number')
            )
            
            for reading_data in readings_data:
                FilterIntegrityReading.objects.create(
                    room=room,
                    filter_id=reading_data.get('filter_id'),
                    upstream_concentration=reading_data.get('upstream_concentration', 0),
                    aerosol_concentration=reading_data.get('aerosol_concentration', 0),
                    downstream_concentration=reading_data.get('downstream_concentration', 0),
                    downstream_leakage=reading_data.get('downstream_leakage', 0),
                    acceptable_limit=reading_data.get('acceptable_limit', 0),
                    test_status=reading_data.get('test_status', 'PASS')
                )
        
        response_serializer = self.get_serializer(test)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class RecoveryTestViewSet(BaseTestCertificateViewSet):
    """ViewSet for managing recovery tests."""
    serializer_class = RecoveryTestSerializer
    queryset = RecoveryTest.objects.all()
    
    def create(self, request, *args, **kwargs):
        """Create test with nested data points."""
        data = request.data.copy()
        data_points = data.pop('data_points', [])
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        test = serializer.save(
            operator=request.user,
            operator_name=request.user.name or request.user.email
        )
        
        # Create data points
        for dp_data in data_points:
            RecoveryDataPoint.objects.create(
                test=test,
                time=dp_data.get('time'),
                ahu_status=dp_data.get('ahu_status'),
                particle_count_05=dp_data.get('particle_count_05', 0),
                particle_count_5=dp_data.get('particle_count_5', 0)
            )
        
        response_serializer = self.get_serializer(test)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class DifferentialPressureTestViewSet(BaseTestCertificateViewSet):
    """ViewSet for managing differential pressure tests."""
    serializer_class = DifferentialPressureTestSerializer
    queryset = DifferentialPressureTest.objects.all()
    
    def create(self, request, *args, **kwargs):
        """Create test with nested readings."""
        data = request.data.copy()
        readings_data = data.pop('readings', [])
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        test = serializer.save(
            operator=request.user,
            operator_name=request.user.name or request.user.email
        )
        
        # Create readings
        for reading_data in readings_data:
            DifferentialPressureReading.objects.create(
                test=test,
                room_positive=reading_data.get('room_positive'),
                room_negative=reading_data.get('room_negative'),
                dp_reading=reading_data.get('dp_reading', 0),
                limit=reading_data.get('limit', 0),
                test_status=reading_data.get('test_status', 'PASS')
            )
        
        response_serializer = self.get_serializer(test)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class NVPCTestViewSet(BaseTestCertificateViewSet):
    """ViewSet for managing NVPC tests."""
    serializer_class = NVPCTestSerializer
    queryset = NVPCTest.objects.all()
    
    def create(self, request, *args, **kwargs):
        """Create test with nested rooms and sampling points."""
        data = request.data.copy()
        rooms_data = data.pop('rooms', [])
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        test = serializer.save(
            operator=request.user,
            operator_name=request.user.name or request.user.email
        )
        
        # Create rooms and sampling points
        for room_data in rooms_data:
            sampling_points_data = room_data.pop('sampling_points', [])
            room = NVPCRoom.objects.create(
                test=test,
                room_name=room_data.get('room_name'),
                room_number=room_data.get('room_number'),
                mean_05=room_data.get('mean_05'),
                mean_5=room_data.get('mean_5'),
                room_status=room_data.get('room_status')
            )
            
            for sp_data in sampling_points_data:
                # Frontend sends sampling_point, but backend expects point_id
                # Frontend sends mean_05/mean_5, but backend expects average_05/average_5
                # For now, we'll use the mean values as averages and set defaults for other fields
                NVPCSamplingPoint.objects.create(
                    room=room,
                    point_id=sp_data.get('sampling_point') or sp_data.get('point_id', ''),
                    location=sp_data.get('location', ''),
                    readings_05=sp_data.get('readings_05', []),
                    readings_5=sp_data.get('readings_5', []),
                    average_05=sp_data.get('mean_05') or sp_data.get('average_05', 0),
                    average_5=sp_data.get('mean_5') or sp_data.get('average_5', 0),
                    limit_05=sp_data.get('limit_05', 3520000),  # ISO 8 limit
                    limit_5=sp_data.get('limit_5', 29300),  # ISO 8 limit
                    test_status=sp_data.get('test_status', 'PASS')
                )
        
        response_serializer = self.get_serializer(test)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

