import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Beaker, Calculator, Save, Clock, AlertCircle, Thermometer, Gauge, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { chemicalPrepAPI, chemicalMasterAPI, chemicalStockAPI, chemicalAssignmentAPI } from '@/lib/api';

interface ChemicalPrep {
  id: string;
  logType: 'chemical' | 'boiler';
  date: string;
  time: string;
  // Chemical fields
  equipmentName?: string;
  chemicalName?: string;
  chemicalPercent?: number;
  solutionConcentration?: number;
  waterQty?: number;
  chemicalQty?: number;
  // Boiler fields
  feedWaterTemp?: number;
  oilTemp?: number;
  steamTemp?: number;
  steamPressure?: number;
  steamFlowLPH?: number;
  remarks: string;
  checkedBy: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval';
  operator_id?: string;
  approved_by_id?: string;
}

// Boiler monitoring limits (NLT = Not Less Than)
const boilerLimits = {
  feedWaterTemp: { min: 50, unit: '°C' },
  oilTemp: { min: 50, unit: '°C' },
  steamTemp: { min: 150, unit: '°C' },
  steamPressure: { min: 6, unit: 'bar' },
};

export default function ChemicalPrepPage() {
  const { user } = useAuth();
  const [preps, setPreps] = useState<ChemicalPrep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    logType: 'chemical' as 'chemical' | 'boiler',
    // Chemical fields
    equipmentName: '',
    chemicalName: '',
    chemicalCategory: 'major' as 'major' | 'minor',
    solutionConcentration: '',
    waterQty: '',
    // Boiler fields
    feedWaterTemp: '',
    oilTemp: '',
    steamTemp: '',
    steamPressure: '',
    steamFlowLPH: '',
    remarks: '',
  });
  const [calculatedQuantity, setCalculatedQuantity] = useState<number | null>(null);
  const [chemicalOptions, setChemicalOptions] = useState<
    { id: string; label: string; name: string }[]
  >([]);
  const [assignments, setAssignments] = useState<
    { id: string; chemical: string; equipment_name: string; category: 'major' | 'minor' }[]
  >([]);
  const [equipmentOptions, setEquipmentOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedChemicalId, setSelectedChemicalId] = useState<string>('');
  const [selectedStockInfo, setSelectedStockInfo] = useState<{
    availableQtyKg: number | null;
    unit: string | null;
    pricePerUnit: number | null;
    site: string | null;
  } | null>(null);

  // Load chemical master list from backend (no hardcoded names/formulas)
  useEffect(() => {
    (async () => {
      try {
        const data = await chemicalMasterAPI.list();
        const opts = (data as any[]).map((c) => ({
          id: String((c as any).id),
          label: `${(c as any).location_label ?? (c as any).location ?? ''} – ${(c as any).formula} – ${
            (c as any).name
          }`,
          name: String((c as any).name ?? ''),
        }));
        setChemicalOptions(opts);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load chemical master list.');
      }
    })();
  }, []);

  // Load chemical assignments to drive equipment dropdown (auto-fetched from Equipment Assignment page)
  useEffect(() => {
    (async () => {
      try {
        const data = await chemicalAssignmentAPI.list();
        const rows = (data as any[]).map((row) => ({
          id: String((row as any).id),
          chemical: String((row as any).chemical),
          equipment_name: String((row as any).equipment_name ?? ''),
          category: ((row as any).category || 'major') as 'major' | 'minor',
        }));
        setAssignments(rows);
        // Build unique equipment list
        const seen = new Set<string>();
        const eqOpts: { id: string; name: string }[] = [];
        rows.forEach((r) => {
          if (r.equipment_name && !seen.has(r.equipment_name)) {
            seen.add(r.equipment_name);
            eqOpts.push({ id: r.equipment_name, name: r.equipment_name });
          }
        });
        setEquipmentOptions(eqOpts);
      } catch (error: any) {
        console.error('Failed to load chemical assignments:', error);
        // Do not block the page; fall back to manual entry if needed
      }
    })();
  }, []);

  // Load stock information for selected chemical to enforce availability rule
  useEffect(() => {
    if (!selectedChemicalId) {
      setSelectedStockInfo(null);
      return;
    }
    (async () => {
      try {
        const stock = await chemicalStockAPI.list({ chemical: selectedChemicalId });
        if (Array.isArray(stock) && stock.length > 0) {
          const first = stock[0] as any;
          setSelectedStockInfo({
            availableQtyKg: first.available_qty_kg ?? null,
            unit: first.unit ?? null,
            pricePerUnit: first.price_per_unit ?? null,
            site: first.site ?? null,
          });
        } else {
          setSelectedStockInfo(null);
        }
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load stock details for selected chemical.');
        setSelectedStockInfo(null);
      }
    })();
  }, [selectedChemicalId]);

  // Auto-calculate chemical quantity when inputs change (for chemical type only)
  // Formula: Chemical Qty (g) = (Solution concentration % × Water Qty (L) × 1000) / Chemical %
  useEffect(() => {
    if (
      formData.logType === 'chemical' &&
      formData.chemicalCategory === 'major' &&
      formData.chemicalName &&
      formData.solutionConcentration &&
      formData.waterQty
    ) {
      const solutionConc = parseFloat(formData.solutionConcentration);
      const waterQty = parseFloat(formData.waterQty);
      if (!Number.isNaN(solutionConc) && !Number.isNaN(waterQty)) {
        const chemicalPercent = 100; // Default to 100% if not provided by backend
        const chemicalQtyGrams = (solutionConc * waterQty * 1000) / chemicalPercent;
        setCalculatedQuantity(Math.round(chemicalQtyGrams * 100) / 100);
      } else {
        setCalculatedQuantity(null);
      }
    } else {
      setCalculatedQuantity(null);
    }
  }, [
    formData.logType,
    formData.chemicalCategory,
    formData.chemicalName,
    formData.solutionConcentration,
    formData.waterQty,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.logType === 'chemical') {
      if (!formData.chemicalName) {
        toast.error('Please select a chemical.');
        return;
      }
      if (!selectedStockInfo) {
        toast.error('No stock available for the selected chemical. Please update stock before logging preparation.');
        return;
      }
      if (formData.chemicalCategory === 'major' && !calculatedQuantity) {
        toast.error('Please fill Solution concentration and Water Qty to calculate Chemical Qty.');
        return;
      }

      if (formData.solutionConcentration) {
        const solutionConc = parseFloat(formData.solutionConcentration);
        if (Number.isNaN(solutionConc)) {
          toast.error('Solution concentration must be numeric.');
          return;
        }
      }

      if (formData.waterQty) {
        const waterQty = parseFloat(formData.waterQty);
        if (Number.isNaN(waterQty)) {
          toast.error('Water quantity must be numeric.');
          return;
        }
      }

      // If we have a calculated chemical quantity and stock info, enforce that
      // requested quantity (kg) does not exceed available stock.
      if (
        formData.chemicalCategory === 'major' &&
        calculatedQuantity != null &&
        selectedStockInfo?.availableQtyKg != null
      ) {
        const requestedKg = calculatedQuantity / 1000; // grams -> kg
        if (requestedKg > selectedStockInfo.availableQtyKg) {
          toast.error(
            `Requested quantity (${requestedKg.toFixed(
              3,
            )} kg) exceeds available stock (${selectedStockInfo.availableQtyKg.toFixed(
              3,
            )} kg).`,
          );
          return;
        }
      }
    }
    if (formData.logType === 'boiler' && !formData.feedWaterTemp && !formData.oilTemp && !formData.steamTemp && !formData.steamPressure) {
      toast.error('Please fill in at least one boiler reading');
      return;
    }

    try {
      let solutionConcentrationValue: number | undefined;
      let waterQtyValue: number | undefined;
      if (formData.logType === 'chemical') {
        if (formData.solutionConcentration) {
          solutionConcentrationValue = parseFloat(formData.solutionConcentration);
        }
        if (formData.waterQty) {
          waterQtyValue = parseFloat(formData.waterQty);
        }
      }
      
      const prepData = {
        log_type: formData.logType,
        equipment_name: formData.logType === 'chemical' ? formData.equipmentName : undefined,
        chemical: formData.logType === 'chemical' && selectedChemicalId ? selectedChemicalId : undefined,
        chemical_name: formData.logType === 'chemical' ? formData.chemicalName : undefined,
        chemical_percent: formData.logType === 'chemical' ? 100 : undefined,
        chemical_category: formData.logType === 'chemical' ? formData.chemicalCategory : undefined,
        solution_concentration: formData.logType === 'chemical' ? solutionConcentrationValue : undefined,
        water_qty: formData.logType === 'chemical' ? waterQtyValue : undefined,
        chemical_qty: formData.logType === 'chemical' ? calculatedQuantity || undefined : undefined,
        feed_water_temp: formData.logType === 'boiler' && formData.feedWaterTemp ? parseFloat(formData.feedWaterTemp) : undefined,
        oil_temp: formData.logType === 'boiler' && formData.oilTemp ? parseFloat(formData.oilTemp) : undefined,
        steam_temp: formData.logType === 'boiler' && formData.steamTemp ? parseFloat(formData.steamTemp) : undefined,
        steam_pressure: formData.logType === 'boiler' && formData.steamPressure ? parseFloat(formData.steamPressure) : undefined,
        steam_flow_lph: formData.logType === 'boiler' && formData.steamFlowLPH ? parseFloat(formData.steamFlowLPH) : undefined,
        remarks: formData.remarks || undefined,
        checked_by: user?.name || user?.email || 'Unknown',
      };

      await chemicalPrepAPI.create(prepData);
      
      setIsDialogOpen(false);
      setFormData({
        logType: 'chemical',
        equipmentName: '',
        chemicalName: '',
        chemicalCategory: 'major',
        solutionConcentration: '',
        waterQty: '',
        feedWaterTemp: '',
        oilTemp: '',
        steamTemp: '',
        steamPressure: '',
        steamFlowLPH: '',
        remarks: '',
      });
      setCalculatedQuantity(null);
      toast.success(`${formData.logType === 'chemical' ? 'Chemical preparation' : 'Boiler monitoring'} logged successfully`);
      
      // Refresh data from API
      const data = await chemicalPrepAPI.list();
        const formattedPreps: ChemicalPrep[] = data.map((prep: any) => ({
        id: prep.id,
        logType: prep.log_type,
        date: format(new Date(prep.timestamp), 'yyyy-MM-dd'),
        time: format(new Date(prep.timestamp), 'HH:mm:ss'),
        equipmentName: prep.equipment_name,
        chemicalName: prep.chemical_name,
        chemicalPercent: prep.chemical_percent,
        solutionConcentration: prep.solution_concentration,
        waterQty: prep.water_qty,
        chemicalQty: prep.chemical_qty,
        feedWaterTemp: prep.feed_water_temp,
        oilTemp: prep.oil_temp,
        steamTemp: prep.steam_temp,
        steamPressure: prep.steam_pressure,
        steamFlowLPH: prep.steam_flow_lph,
        remarks: prep.remarks || '',
        checkedBy: prep.checked_by || prep.operator_name,
        timestamp: new Date(prep.timestamp),
          status: prep.status as ChemicalPrep['status'],
          operator_id: prep.operator_id,
          approved_by_id: prep.approved_by_id,
      }));
      setPreps(formattedPreps.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (error: any) {
      console.error('Error saving chemical preparation:', error);
      toast.error(error?.message || 'Failed to save entry');
    }
  };

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await chemicalPrepAPI.approve(id, 'approve');
      toast.success('Entry approved successfully');
      
      // Refresh data
      const data = await chemicalPrepAPI.list();
      const formattedPreps: ChemicalPrep[] = data.map((prep: any) => ({
        id: prep.id,
        logType: prep.log_type,
        date: format(new Date(prep.timestamp), 'yyyy-MM-dd'),
        time: format(new Date(prep.timestamp), 'HH:mm:ss'),
        equipmentName: prep.equipment_name,
        chemicalName: prep.chemical_name,
        chemicalPercent: prep.chemical_percent,
        solutionConcentration: prep.solution_concentration,
        waterQty: prep.water_qty,
        chemicalQty: prep.chemical_qty,
        feedWaterTemp: prep.feed_water_temp,
        oilTemp: prep.oil_temp,
        steamTemp: prep.steam_temp,
        steamPressure: prep.steam_pressure,
        steamFlowLPH: prep.steam_flow_lph,
        remarks: prep.remarks || '',
        checkedBy: prep.checked_by || prep.operator_name,
        timestamp: new Date(prep.timestamp),
        status: prep.status as 'pending' | 'approved' | 'rejected',
      }));
      setPreps(formattedPreps.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (error: any) {
      console.error('Error approving entry:', error);
      toast.error(error?.message || 'Failed to approve entry');
    }
  };

  const handleApproveClick = (id: string) => {
    setSelectedPrepId(id);
    setApproveConfirmOpen(true);
  };

  const handleReject = async (id: string) => {
    setRejectConfirmOpen(false);
    try {
      await chemicalPrepAPI.approve(id, 'reject');
      toast.error('Entry rejected');
      
      // Refresh data
      const data = await chemicalPrepAPI.list();
      const formattedPreps: ChemicalPrep[] = data.map((prep: any) => ({
        id: prep.id,
        logType: prep.log_type,
        date: format(new Date(prep.timestamp), 'yyyy-MM-dd'),
        time: format(new Date(prep.timestamp), 'HH:mm:ss'),
        equipmentName: prep.equipment_name,
        chemicalName: prep.chemical_name,
        chemicalPercent: prep.chemical_percent,
        solutionConcentration: prep.solution_concentration,
        waterQty: prep.water_qty,
        chemicalQty: prep.chemical_qty,
        feedWaterTemp: prep.feed_water_temp,
        oilTemp: prep.oil_temp,
        steamTemp: prep.steam_temp,
        steamPressure: prep.steam_pressure,
        steamFlowLPH: prep.steam_flow_lph,
        remarks: prep.remarks || '',
        checkedBy: prep.checked_by || prep.operator_name,
        timestamp: new Date(prep.timestamp),
        status: prep.status as 'pending' | 'approved' | 'rejected',
      }));
      setPreps(formattedPreps.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (error: any) {
      console.error('Error rejecting entry:', error);
      toast.error(error?.message || 'Failed to reject entry');
    }
  };

  const handleRejectClick = (id: string) => {
    setSelectedPrepId(id);
    setRejectConfirmOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry? This action cannot be undone.')) {
      return;
    }
    
    try {
      await chemicalPrepAPI.delete(id);
      toast.success('Entry deleted successfully');
      
      // Refresh data
      const data = await chemicalPrepAPI.list();
      const formattedPreps: ChemicalPrep[] = data.map((prep: any) => ({
        id: prep.id,
        logType: prep.log_type,
        date: format(new Date(prep.timestamp), 'yyyy-MM-dd'),
        time: format(new Date(prep.timestamp), 'HH:mm:ss'),
        equipmentName: prep.equipment_name,
        chemicalName: prep.chemical_name,
        chemicalPercent: prep.chemical_percent,
        solutionConcentration: prep.solution_concentration,
        waterQty: prep.water_qty,
        chemicalQty: prep.chemical_qty,
        feedWaterTemp: prep.feed_water_temp,
        oilTemp: prep.oil_temp,
        steamTemp: prep.steam_temp,
        steamPressure: prep.steam_pressure,
        steamFlowLPH: prep.steam_flow_lph,
        remarks: prep.remarks || '',
        checkedBy: prep.checked_by || prep.operator_name,
        timestamp: new Date(prep.timestamp),
        status: prep.status as 'pending' | 'approved' | 'rejected',
      }));
      setPreps(formattedPreps.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (error: any) {
      console.error('Error deleting entry:', error);
      toast.error(error?.message || 'Failed to delete entry');
    }
  };

  const selectedChemicalPercent =
    formData.logType === 'chemical' && formData.chemicalName ? 100 : null;

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Preparation"
        subtitle="Chemical monitoring and boiler monitoring logs"
      />

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {preps.filter((p) => p.status === 'draft').length} Draft
            </Badge>
            <Badge variant="pending">
              {preps.filter((p) => p.status === 'pending' || p.status === 'pending_secondary_approval').length} Pending
            </Badge>
            <Badge variant="success">
              {preps.filter((p) => p.status === 'approved').length} Approved
            </Badge>
            <Badge variant="destructive">
              {preps.filter((p) => p.status === 'rejected').length} Rejected
            </Badge>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                New Preparation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Beaker className="w-5 h-5" />
                  Chemical Preparation Form
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Digital Signature Info */}
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{format(new Date(), 'PPpp')}</p>
                    <p className="text-xs text-muted-foreground">Checked By: {user?.name || user?.email || 'Unknown'}</p>
                  </div>
                </div>

                {/* Log Type Selection */}
                <div className="space-y-2">
                  <Label>Log Type</Label>
                  <Select
                    value={formData.logType}
                    onValueChange={(v) => {
                      setFormData({
                        logType: v as 'chemical' | 'boiler',
                        equipmentName: '',
                        chemicalName: '',
                        chemicalCategory: 'major',
                        solutionConcentration: '',
                        waterQty: '',
                        feedWaterTemp: '',
                        oilTemp: '',
                        steamTemp: '',
                        steamPressure: '',
                        steamFlowLPH: '',
                        remarks: '',
                      });
                      setCalculatedQuantity(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select log type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chemical">Chemical Monitoring</SelectItem>
                      <SelectItem value="boiler">Boiler Monitoring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Chemical Monitoring Fields */}
                {formData.logType === 'chemical' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>EqP Name</Label>
                        <Select
                          value={formData.equipmentName}
                          onValueChange={(v) => {
                            const assignment = assignments.find(
                              (a) => a.equipment_name === v,
                            );
                            const matched = assignment
                              ? chemicalOptions.find(
                                  (c) => c.id === assignment.chemical,
                                )
                              : null;
                            setFormData((prev) => ({
                              ...prev,
                              equipmentName: v,
                              chemicalCategory: assignment?.category ?? prev.chemicalCategory,
                              chemicalName: matched?.name ?? prev.chemicalName,
                            }));
                            if (matched) setSelectedChemicalId(matched.id);
                            else setSelectedChemicalId("");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select equipment" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {equipmentOptions.map((eq) => (
                              <SelectItem key={eq.id} value={eq.name}>
                                {eq.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Chemical name</Label>
                        <Select
                          value={formData.chemicalName}
                          onValueChange={(v) => {
                            setFormData({ ...formData, chemicalName: v });
                            const opt = chemicalOptions.find((c) => c.name === v);
                            setSelectedChemicalId(opt ? opt.id : '');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select chemical" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {chemicalOptions.map((chem) => (
                              <SelectItem key={chem.id} value={chem.name}>
                                {chem.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formData.logType === 'chemical' && formData.chemicalName && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {selectedStockInfo ? (
                          <>
                            <span>
                              Available stock: {selectedStockInfo.availableQtyKg ?? 0}{' '}
                              {selectedStockInfo.unit ?? 'kg'} at price{' '}
                              {selectedStockInfo.pricePerUnit ?? 0} per{' '}
                              {selectedStockInfo.unit ?? 'kg'}
                              {selectedStockInfo.site ? ` (site: ${selectedStockInfo.site})` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-red-600">
                            No stock available for this chemical. You cannot log preparation until
                            stock is added.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Chemical Category</Label>
                      <Select
                        value={formData.chemicalCategory}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            chemicalCategory: v as 'major' | 'minor',
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="major">Major</SelectItem>
                          <SelectItem value="minor">Minor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedChemicalPercent !== null && (
                      <div className="bg-accent/10 rounded-lg p-3 border border-accent/20">
                        <p className="text-sm text-accent font-medium">
                          Chemical %: {selectedChemicalPercent}%
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>
                          Solution concentration %
                          {formData.chemicalCategory === 'major' && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={formData.solutionConcentration}
                          onChange={(e) => setFormData({ ...formData, solutionConcentration: e.target.value })}
                          placeholder="e.g., 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          Water Qty (L)
                          {formData.chemicalCategory === 'major' && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={formData.waterQty}
                          onChange={(e) => setFormData({ ...formData, waterQty: e.target.value })}
                          placeholder="e.g., 5"
                        />
                      </div>
                    </div>

                    {/* Auto-calculated Result */}
                    <div className={`rounded-lg p-4 border-2 ${calculatedQuantity ? 'bg-success/10 border-success/30' : 'bg-muted/50 border-border'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calculator className="w-5 h-5 text-success" />
                        <span className="text-sm font-medium text-foreground">Chemical Qty (Calculated)</span>
                      </div>
                      {calculatedQuantity ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold font-mono text-success">{calculatedQuantity}</span>
                          <span className="text-lg text-muted-foreground">G (Grams)</span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Fill in all fields to calculate
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* Boiler Monitoring Fields */}
                {formData.logType === 'boiler' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Feed water temp
                          <span className="text-xs text-muted-foreground">(NLT 50 °C)</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.feedWaterTemp}
                          onChange={(e) => setFormData({ ...formData, feedWaterTemp: e.target.value })}
                          placeholder="e.g., 50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Oil temp
                          <span className="text-xs text-muted-foreground">(NLT 50 °C)</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.oilTemp}
                          onChange={(e) => setFormData({ ...formData, oilTemp: e.target.value })}
                          placeholder="e.g., 50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Steam temp
                          <span className="text-xs text-muted-foreground">(NLT 150 °C)</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamTemp}
                          onChange={(e) => setFormData({ ...formData, steamTemp: e.target.value })}
                          placeholder="e.g., 180"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Gauge className="w-4 h-4" /> Steam Pressure
                          <span className="text-xs text-muted-foreground">(NLT 6 bar)</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamPressure}
                          onChange={(e) => setFormData({ ...formData, steamPressure: e.target.value })}
                          placeholder="e.g., 8"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Steam Flow LPH</Label>
                      <Input
                        type="number"
                        step="1"
                        value={formData.steamFlowLPH}
                        onChange={(e) => setFormData({ ...formData, steamFlowLPH: e.target.value })}
                        placeholder="e.g., 10000"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    placeholder="Purpose, batch number, or other notes..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="accent"
                    disabled={
                      formData.logType === 'chemical' &&
                      formData.chemicalCategory === 'major' &&
                      !calculatedQuantity
                    }
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {formData.logType === 'chemical' ? 'Log Preparation' : 'Log Reading'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Preparations Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">EqP Name / Equipment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Chemical name / Feed water temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Chemical % / Oil temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Solution concentration % / Steam temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Water Qty / Steam Pressure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Chemical Qty / Steam Flow LPH</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Remarks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preps.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm">No logs found</p>
                      <p className="text-xs mt-1">Create a new entry to get started</p>
                    </td>
                  </tr>
                ) : (
                  preps.map((prep) => (
                    <tr key={prep.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant={prep.logType === 'chemical' ? 'default' : 'secondary'}>
                          {prep.logType === 'chemical' ? 'Chemical' : 'Boiler'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{prep.date}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{prep.time}</span>
                      </td>
                      {prep.logType === 'chemical' ? (
                        <>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-foreground">{prep.equipmentName || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-foreground">{prep.chemicalName || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-muted-foreground">{prep.chemicalPercent !== undefined ? `${prep.chemicalPercent}%` : '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono">{prep.solutionConcentration !== undefined ? `${prep.solutionConcentration}%` : '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono">{prep.waterQty !== undefined ? `${prep.waterQty} L` : '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono font-bold text-accent">{prep.chemicalQty !== undefined ? `${prep.chemicalQty} G` : '-'}</span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground">-</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${prep.feedWaterTemp !== undefined && prep.feedWaterTemp < boilerLimits.feedWaterTemp.min ? 'text-destructive' : ''}`}>
                              {prep.feedWaterTemp !== undefined ? `${prep.feedWaterTemp} ${boilerLimits.feedWaterTemp.unit}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${prep.oilTemp !== undefined && prep.oilTemp < boilerLimits.oilTemp.min ? 'text-destructive' : ''}`}>
                              {prep.oilTemp !== undefined ? `${prep.oilTemp} ${boilerLimits.oilTemp.unit}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${prep.steamTemp !== undefined && prep.steamTemp < boilerLimits.steamTemp.min ? 'text-destructive' : ''}`}>
                              {prep.steamTemp !== undefined ? `${prep.steamTemp} ${boilerLimits.steamTemp.unit}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-mono ${prep.steamPressure !== undefined && prep.steamPressure < boilerLimits.steamPressure.min ? 'text-destructive' : ''}`}>
                              {prep.steamPressure !== undefined ? `${prep.steamPressure} ${boilerLimits.steamPressure.unit}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono">{prep.steamFlowLPH !== undefined ? `${prep.steamFlowLPH} LPH` : '-'}</span>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{prep.remarks || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{prep.checkedBy}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={prep.status === 'approved' ? 'success' : prep.status === 'rejected' ? 'danger' : 'pending'}>
                          {prep.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(prep.status === 'pending' || prep.status === 'draft') && user?.role !== 'operator' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (prep.operator_id === user?.id) {
                                    toast.error('The log book entry must be approved by a different user than the operator (Log Book Done By).');
                                    return;
                                  }
                                  handleApproveClick(prep.id);
                                }}
                                className="h-7 text-xs"
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRejectClick(prep.id)}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {prep.status === 'approved' && (
                            <span className="text-xs text-muted-foreground">Approved</span>
                          )}
                          {prep.status === 'rejected' && (
                            <span className="text-xs text-muted-foreground">Rejected</span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(prep.id)}
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete Entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Approve Confirmation Alert */}
      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedPrepId && handleApprove(selectedPrepId)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Alert */}
      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedPrepId && handleReject(selectedPrepId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
