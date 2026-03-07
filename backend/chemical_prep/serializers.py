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
    chemical_name = serializers.SerializerMethodField()
    chemical_formula = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        u = obj.created_by
        return (u.name and u.name.strip()) or u.email or ""

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
        extra_kwargs = {
            "chemical": {"required": False, "allow_null": True},
            "chemical_name": {"required": False, "allow_blank": True},
            "chemical_formula": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
        }

    def get_chemical_name(self, obj):
        if obj.chemical_id:
            return obj.chemical.name
        return obj.chemical_name or ""

    def get_chemical_formula(self, obj):
        if obj.chemical_id:
            return obj.chemical.formula
        return obj.chemical_formula or ""

    def get_location(self, obj):
        if obj.chemical_id:
            return obj.chemical.get_location_display()
        return obj.location or ""

    def validate(self, attrs):
        chemical = attrs.get("chemical")
        chemical_name = (attrs.get("chemical_name") or self.initial_data.get("chemical_name") or "").strip()
        chemical_formula = (attrs.get("chemical_formula") or self.initial_data.get("chemical_formula") or "").strip() or None
        location = (attrs.get("location") or self.initial_data.get("location") or "").strip() or None
        if not chemical and not chemical_name:
            raise serializers.ValidationError(
                {"chemical_name": "Provide either a chemical (id) or chemical name."}
            )
        equipment_name = (attrs.get("equipment_name") or "").strip()
        if not equipment_name:
            raise serializers.ValidationError(
                {"equipment_name": "Equipment name is required."}
            )
        if not attrs.get("category"):
            raise serializers.ValidationError(
                {"category": "Category (major/minor) is required."}
            )
        # Pass through for create (SerializerMethodField does not add to validated_data)
        if not chemical and chemical_name:
            attrs["chemical_name"] = chemical_name
            attrs["chemical_formula"] = chemical_formula
            attrs["location"] = location
        return attrs

    def create(self, validated_data):
        chemical_name = validated_data.pop("chemical_name", None)
        chemical_formula = validated_data.pop("chemical_formula", None)
        location = validated_data.pop("location", None)
        equipment_name = (validated_data.get("equipment_name") or "").strip()
        category = validated_data.get("category")
        chemical = validated_data.get("chemical")
        # Ensure created_by is set (from save(created_by=...) or request context)
        request = self.context.get("request")
        created_by = validated_data.pop("created_by", None) or (request.user if request else None)
        if chemical:
            validated_data["created_by"] = created_by
            return super().create(validated_data)
        return ChemicalAssignment.objects.create(
            chemical_name=chemical_name,
            chemical_formula=chemical_formula,
            location=location,
            equipment_name=equipment_name,
            category=category,
            created_by=created_by,
            is_active=validated_data.get("is_active", True),
        )


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

