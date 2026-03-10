from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChillerLogViewSet, ChillerEquipmentLimitViewSet

router = DefaultRouter()
router.register(r'chiller-logs', ChillerLogViewSet, basename='chiller-log')
router.register(r'chiller-limits', ChillerEquipmentLimitViewSet, basename='chiller-limit')

urlpatterns = [
    path('', include(router.urls)),
]

