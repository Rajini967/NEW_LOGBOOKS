from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import LogbookSchema, LogbookRoleAssignment, LogbookEntry
from .serializers import (
    LogbookSchemaSerializer,
    LogbookSchemaCreateSerializer,
    LogbookSchemaUpdateSerializer,
    LogbookRoleAssignmentSerializer,
    LogbookEntrySerializer
)
from accounts.permissions import IsAdminOrSuperAdmin, IsSuperAdmin
from accounts.models import UserRole


class LogbookSchemaViewSet(viewsets.ModelViewSet):
    """ViewSet for managing logbook schemas."""
    permission_classes = [IsAuthenticated]
    queryset = LogbookSchema.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'create':
            return LogbookSchemaCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return LogbookSchemaUpdateSerializer
        return LogbookSchemaSerializer
    
    def get_queryset(self):
        """Filter logbooks based on user's role."""
        user = self.request.user
        
        # Admins and Super Admins can see all logbooks
        if user.role in ['admin', 'super_admin']:
            return LogbookSchema.objects.all()
        
        # Other users see only logbooks assigned to their role
        assigned_schemas = LogbookRoleAssignment.objects.filter(
            role=user.role
        ).values_list('schema_id', flat=True)
        
        return LogbookSchema.objects.filter(id__in=assigned_schemas)
    
    def get_permissions(self):
        """Only managers and super admins can create/update/delete."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Set created_by when creating a schema."""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post', 'get'], permission_classes=[IsAdminOrSuperAdmin])
    def assign_roles(self, request, pk=None):
        """Assign roles to a logbook."""
        schema = self.get_object()
        
        if request.method == 'POST':
            roles = request.data.get('roles', [])
            
            # Validate roles
            valid_roles = [choice[0] for choice in UserRole.choices]
            invalid_roles = [r for r in roles if r not in valid_roles]
            if invalid_roles:
                return Response(
                    {'error': f'Invalid roles: {invalid_roles}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Clear existing assignments
            LogbookRoleAssignment.objects.filter(schema=schema).delete()
            
            # Create new assignments
            for role in roles:
                LogbookRoleAssignment.objects.create(
                    schema=schema,
                    role=role,
                    assigned_by=request.user
                )
            
            return Response({
                'message': 'Roles assigned successfully',
                'assigned_roles': roles
            })
        
        # GET: Return current assignments
        assignments = LogbookRoleAssignment.objects.filter(schema=schema)
        serializer = LogbookRoleAssignmentSerializer(assignments, many=True)
        return Response(serializer.data)


class LogbookEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for managing logbook entries."""
    permission_classes = [IsAuthenticated]
    serializer_class = LogbookEntrySerializer
    queryset = LogbookEntry.objects.all()

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Filter entries based on user's role and assigned logbooks."""
        user = self.request.user
        queryset = LogbookEntry.objects.all()
        
        # Admins and Super Admins can see all entries
        if user.role in ['admin', 'super_admin']:
            return queryset
        
        # Other users see only entries from logbooks assigned to their role
        assigned_schemas = LogbookRoleAssignment.objects.filter(
            role=user.role
        ).values_list('schema_id', flat=True)
        
        return queryset.filter(schema_id__in=assigned_schemas)
    
    def perform_create(self, serializer):
        """Set operator when creating an entry."""
        serializer.save(
            operator=self.request.user,
            operator_name=self.request.user.name or self.request.user.email
        )
