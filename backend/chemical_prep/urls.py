from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChemicalViewSet,
    ChemicalStockViewSet,
    ChemicalAssignmentViewSet,
    ChemicalPreparationViewSet,
)

router = DefaultRouter()
router.register(r"chemicals", ChemicalViewSet, basename="chemical")
router.register(r"chemical-stock", ChemicalStockViewSet, basename="chemical-stock")
router.register(r"chemical-assignments", ChemicalAssignmentViewSet, basename="chemical-assignment")
router.register(r"chemical-preps", ChemicalPreparationViewSet, basename="chemical-prep")

urlpatterns = [
    path("", include(router.urls)),
]

