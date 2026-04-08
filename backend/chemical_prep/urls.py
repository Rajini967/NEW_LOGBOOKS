from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChemicalViewSet,
    ChemicalStockViewSet,
    ChemicalAssignmentViewSet,
    ChemicalPreparationViewSet,
    ChemicalDailyLimitViewSet,
)

router = DefaultRouter()
router.register(r"chemicals", ChemicalViewSet, basename="chemical")
router.register(r"chemical-stock", ChemicalStockViewSet, basename="chemical-stock")
router.register(r"chemical-assignments", ChemicalAssignmentViewSet, basename="chemical-assignment")
router.register(r"chemical-preps", ChemicalPreparationViewSet, basename="chemical-prep")
router.register(r"chemical-limits", ChemicalDailyLimitViewSet, basename="chemical-limit")

urlpatterns = [
    path("", include(router.urls)),
]

