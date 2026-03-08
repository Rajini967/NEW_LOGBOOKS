from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChillerLogViewSet, ChillerEquipmentLimitViewSet, CoolingTowerChemicalLogViewSet

router = DefaultRouter()
router.register(r'chiller-logs', ChillerLogViewSet, basename='chiller-log')
router.register(r'chiller-limits', ChillerEquipmentLimitViewSet, basename='chiller-limit')
router.register(r'ct-chemical-logs', CoolingTowerChemicalLogViewSet, basename='ct-chemical-log')

urlpatterns = [
    path('', include(router.urls)),
]

