from rest_framework import serializers
from .models import Chemical, ChemicalStock, ChemicalPreparation, ChemicalAssignment


class ChemicalSerializer(serializers.ModelSerializer):
    location_label = serializers.CharField(
        source="get_location_display", read_only=True
    )

    class Meta:
        model = Chemical
        fields = [
            "id",
            "location",
            "location_label",
            "formula",
            "name",
            "category",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ChemicalStockSerializer(serializers.ModelSerializer):
    chemical_name = serializers.CharField(source="chemical.name", read_only=True)
    chemical_formula = serializers.CharField(
        source="chemical.formula", read_only=True
    )
    location = serializers.CharField(
        source="chemical.get_location_display", read_only=True
    )

    class Meta:
        model = ChemicalStock
        fields = [
            "id",
            "chemical",
            "chemical_name",
            "chemical_formula",
            "location",
            "available_qty_kg",
            "unit",
            "price_per_unit",
            "site",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ChemicalAssignmentSerializer(serializers.ModelSerializer):
    chemical_name = serializers.CharField(source="chemical.name", read_only=True)
    chemical_formula = serializers.CharField(
        source="chemical.formula", read_only=True
    )
    location = serializers.CharField(
        source="chemical.get_location_display", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.name", read_only=True
    )

    class Meta:
        model = ChemicalAssignment
        fields = [
            "id",
            "chemical",
            "chemical_name",
            "chemical_formula",
            "location",
            "equipment_name",
            "category",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at"]


class ChemicalPreparationSerializer(serializers.ModelSerializer):
    operator_id = serializers.UUIDField(source='operator.id', read_only=True)
    approved_by_id = serializers.UUIDField(source='approved_by.id', read_only=True, allow_null=True)
    secondary_approved_by_id = serializers.UUIDField(source='secondary_approved_by.id', read_only=True, allow_null=True)
    corrects_id = serializers.UUIDField(source='corrects.id', read_only=True, allow_null=True)
    has_corrections = serializers.SerializerMethodField()

    class Meta:
        model = ChemicalPreparation
        fields = [
            'id', 'equipment_name', 'chemical', 'chemical_name', 'chemical_category',
            'chemical_percent', 'chemical_concentration', 'solution_concentration', 'water_qty', 'chemical_qty',
            'batch_no', 'done_by',
            'remarks', 'comment', 'checked_by', 'operator_id', 'operator_name', 'status',
            'approved_by_id', 'approved_at', 'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections', 'timestamp', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'operator_id', 'operator_name', 'approved_by_id', 'approved_at',
            'secondary_approved_by_id', 'secondary_approved_at',
            'corrects_id', 'has_corrections',
            'created_at', 'updated_at'
        ]

    def update(self, instance, validated_data):
        timestamp = validated_data.pop('timestamp', None)
        if timestamp is not None and instance.status not in ('rejected', 'pending_secondary_approval'):
            validated_data['timestamp'] = instance.timestamp
        elif timestamp is not None:
            validated_data['timestamp'] = timestamp
        return super().update(instance, validated_data)

    def get_has_corrections(self, obj: ChemicalPreparation) -> bool:
        return obj.corrections.exists()

