"""
URL configuration for core project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API Routes
    path('api/', include('accounts.urls')),
    path('api/', include('sites.urls')),
    path('api/', include('instruments.urls')),
    path('api/', include('equipment.urls')),
    path('api/', include('chemical_prep.urls')),
    path('api/', include('chiller_logs.urls')),
    path('api/', include('boiler_logs.urls')),
    path('api/', include('filter_logs.urls')),
    path('api/', include('compressor_logs.urls')),
    path('api/', include('air_validation.urls')),
    path('api/', include('test_certificates.urls')),
    path('api/', include('filter_master.urls')),
    path('api/logbooks/', include('logbooks.urls')),
    path('api/reports/', include('reports.urls')),
]
