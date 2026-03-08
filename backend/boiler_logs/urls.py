from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BoilerLogViewSet, BoilerEquipmentLimitViewSet

router = DefaultRouter()
router.register(r'boiler-logs', BoilerLogViewSet, basename='boiler-log')
router.register(r'boiler-limits', BoilerEquipmentLimitViewSet, basename='boiler-limit')

urlpatterns = [
    path('', include(router.urls)),
]

