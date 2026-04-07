import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Thermometer, Flame, Droplets, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  dashboardSummaryAPI,
  equipmentCategoryAPI,
  equipmentAPI,
  chillerLimitsAPI,
  boilerLimitsAPI,
} from '@/lib/api';

const toDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

type ChillerLimitRow = {
  equipment_id?: string;
  effective_from?: string | null;
  electricity_rate_rs_per_kwh?: number | null;
};

function chillerLimitEffectiveDateKey(row: ChillerLimitRow): string | null {
  const raw = row.effective_from;
  if (raw == null || raw === '') return null;
  return String(raw).slice(0, 10);
}

/**
 * Same rule as backend `_get_chiller_limit_for_electricity_cost_date`:
 * effective_from must match the consumption date exactly, or blank effective_from (all dates).
 */
function pickChillerLimitForDate(rows: ChillerLimitRow[], forDate: string): ChillerLimitRow | null {
  if (!rows.length) return null;
  const d = forDate.slice(0, 10);
  const exact = rows.find((r) => chillerLimitEffectiveDateKey(r) === d);
  if (exact) return exact;
  return rows.find((r) => chillerLimitEffectiveDateKey(r) == null) ?? null;
}

export default function ConsumptionPage() {
  const today = new Date();
  const defaultDate = toDateStr(today);
  const todayDate = defaultDate;

  const [chillerDate, setChillerDate] = useState(defaultDate);
  const [boilerDate, setBoilerDate] = useState(defaultDate);
  const [chemicalDate, setChemicalDate] = useState(defaultDate);

  // Chiller
  const [chillerEquipment, setChillerEquipment] = useState<
    { id: string; equipment_number: string; name: string }[]
  >([]);
  const [chillerLoading, setChillerLoading] = useState(true);
  const [selectedChiller, setSelectedChiller] = useState('');
  const [chillerForm, setChillerForm] = useState<{
    power_kwh: number;
    water_ct1_l: number;
    water_ct2_l: number;
    water_ct3_l: number;
    actual_electricity_cost_rs: number | null;
  }>({
    power_kwh: 0,
    water_ct1_l: 0,
    water_ct2_l: 0,
    water_ct3_l: 0,
    actual_electricity_cost_rs: null,
  });
  const [chillerFormLoading, setChillerFormLoading] = useState(false);
  const [chillerSaving, setChillerSaving] = useState(false);
  const [chillerRateRsPerKwh, setChillerRateRsPerKwh] = useState<number | null>(null);

  // Boiler
  const [boilerEquipment, setBoilerEquipment] = useState<
    { id: string; equipment_number: string; name: string }[]
  >([]);
  const [boilerLoading, setBoilerLoading] = useState(true);
  const [selectedBoiler, setSelectedBoiler] = useState('');
  const [boilerForm, setBoilerForm] = useState({
    power_kwh: 0,
    water_l: 0,
    diesel_l: 0,
    furnace_oil_l: 0,
    brigade_kg: 0,
    steam_kg_hr: 0,
    actual_electricity_cost_rs: null as number | null,
  });
  const [boilerFormLoading, setBoilerFormLoading] = useState(false);
  const [boilerSaving, setBoilerSaving] = useState(false);
  const [boilerRateRsPerKwh, setBoilerRateRsPerKwh] = useState<number | null>(null);

  // Chemical
  const [chemicalForm, setChemicalForm] = useState({ chemical_kg: 0 });
  const [chemicalFormLoading, setChemicalFormLoading] = useState(false);
  const [chemicalSaving, setChemicalSaving] = useState(false);

  useEffect(() => {
    const loadChillerEquipment = async () => {
      setChillerLoading(true);
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        let chillerCategoryId: string | null = null;
        for (const c of categories) {
          const name = (c.name || '').toLowerCase().trim();
          if (name === 'chiller' || name === 'chillers') {
            chillerCategoryId = c.id;
            break;
          }
        }
        if (!chillerCategoryId) {
          setChillerEquipment([]);
          return;
        }
        const list = (await equipmentAPI.list({ category: chillerCategoryId })) as any[];
        const chillers = (list || [])
          .filter((e: any) => e?.is_active !== false && e?.status === 'approved')
          .map((e: any) => ({
            id: e.id,
            equipment_number: e.equipment_number || '',
            name: e.name || '',
          }));
        setChillerEquipment(chillers);
        if (chillers.length > 0 && !selectedChiller) {
          setSelectedChiller(chillers[0].equipment_number);
        }
      } catch (e) {
        console.error('Failed to load chiller equipment', e);
        setChillerEquipment([]);
      } finally {
        setChillerLoading(false);
      }
    };
    loadChillerEquipment();
  }, []);

  useEffect(() => {
    const loadBoilerEquipment = async () => {
      setBoilerLoading(true);
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        let boilerCategoryId: string | null = null;
        for (const c of categories) {
          const name = (c.name || '').toLowerCase().trim();
          if (name === 'boiler' || name === 'boilers') {
            boilerCategoryId = c.id;
            break;
          }
        }
        if (!boilerCategoryId) {
          setBoilerEquipment([]);
          return;
        }
        const list = (await equipmentAPI.list({ category: boilerCategoryId })) as any[];
        const boilers = (list || [])
          .filter((e: any) => e?.is_active !== false && e?.status === 'approved')
          .map((e: any) => ({
            id: e.id,
            equipment_number: e.equipment_number || '',
            name: e.name || '',
          }));
        setBoilerEquipment(boilers);
        if (boilers.length > 0 && !selectedBoiler) {
          setSelectedBoiler(boilers[0].equipment_number);
        }
      } catch (e) {
        console.error('Failed to load boiler equipment', e);
        setBoilerEquipment([]);
      } finally {
        setBoilerLoading(false);
      }
    };
    loadBoilerEquipment();
  }, []);

  // Load chiller form when equipment or date changes
  useEffect(() => {
    if (!selectedChiller) return;
    setChillerFormLoading(true);
    dashboardSummaryAPI
      .getDailyConsumption({
        date_from: chillerDate,
        date_to: chillerDate,
        equipment_id: selectedChiller,
        type: 'chiller',
      })
      .then((res) => {
        const row = (res.chiller ?? [])[0];
        if (row) {
          setChillerForm({
            power_kwh: row.power_kwh ?? 0,
            water_ct1_l: row.water_ct1_l ?? 0,
            water_ct2_l: row.water_ct2_l ?? 0,
            water_ct3_l: row.water_ct3_l ?? 0,
            actual_electricity_cost_rs:
              typeof row.actual_electricity_cost_rs === 'number' ? row.actual_electricity_cost_rs : null,
          });
        } else {
          setChillerForm({
            power_kwh: 0,
            water_ct1_l: 0,
            water_ct2_l: 0,
            water_ct3_l: 0,
            actual_electricity_cost_rs: null,
          });
        }
      })
      .catch(() =>
        setChillerForm({
          power_kwh: 0,
          water_ct1_l: 0,
          water_ct2_l: 0,
          water_ct3_l: 0,
          actual_electricity_cost_rs: null,
        }),
      )
      .finally(() => setChillerFormLoading(false));
  }, [selectedChiller, chillerDate]);

  // Chiller electricity rate: exact effective_from = consumption date, or blank effective_from (all dates).
  useEffect(() => {
    if (!selectedChiller) {
      setChillerRateRsPerKwh(null);
      return;
    }
    const eq = chillerEquipment.find((e) => e.equipment_number === selectedChiller);
    chillerLimitsAPI
      .list()
      .then((rowsAll) => {
        const rows = (rowsAll as ChillerLimitRow[]).filter(
          (r) => r.equipment_id === selectedChiller || (!!eq?.id && r.equipment_id === eq.id),
        );
        const picked = pickChillerLimitForDate(rows, chillerDate);
        const rate = picked?.electricity_rate_rs_per_kwh;
        setChillerRateRsPerKwh(typeof rate === 'number' ? rate : null);
      })
      .catch(() => setChillerRateRsPerKwh(null));
  }, [selectedChiller, chillerDate, chillerEquipment]);

  // Load boiler form when equipment or date changes
  useEffect(() => {
    if (!selectedBoiler) return;
    setBoilerFormLoading(true);
    dashboardSummaryAPI
      .getDailyConsumption({
        date_from: boilerDate,
        date_to: boilerDate,
        equipment_id: selectedBoiler,
        type: 'boiler',
      })
      .then((res) => {
        const row = (res.boiler ?? [])[0];
        if (row) {
          setBoilerForm({
            power_kwh: row.power_kwh ?? 0,
            water_l: row.water_l ?? 0,
            diesel_l: row.diesel_l ?? 0,
            furnace_oil_l: row.furnace_oil_l ?? 0,
            brigade_kg: row.brigade_kg ?? 0,
            steam_kg_hr: row.steam_kg_hr ?? 0,
            actual_electricity_cost_rs:
              typeof row.actual_electricity_cost_rs === 'number' ? row.actual_electricity_cost_rs : null,
          });
        } else {
          setBoilerForm({
            power_kwh: 0,
            water_l: 0,
            diesel_l: 0,
            furnace_oil_l: 0,
            brigade_kg: 0,
            steam_kg_hr: 0,
            actual_electricity_cost_rs: null,
          });
        }
      })
      .catch(() =>
        setBoilerForm({
          power_kwh: 0,
          water_l: 0,
          diesel_l: 0,
          furnace_oil_l: 0,
          brigade_kg: 0,
          steam_kg_hr: 0,
          actual_electricity_cost_rs: null,
        }),
      )
      .finally(() => setBoilerFormLoading(false));
  }, [selectedBoiler, boilerDate]);

  // Load boiler electricity rate (for cost display) when equipment changes
  useEffect(() => {
    if (!selectedBoiler) {
      setBoilerRateRsPerKwh(null);
      return;
    }
    boilerLimitsAPI
      .get(selectedBoiler)
      .then((limit) => {
        const rate = limit?.electricity_rate_rs_per_kwh;
        setBoilerRateRsPerKwh(typeof rate === 'number' ? rate : null);
      })
      .catch(() => setBoilerRateRsPerKwh(null));
  }, [selectedBoiler]);

  // Load chemical form when date changes
  useEffect(() => {
    setChemicalFormLoading(true);
    dashboardSummaryAPI
      .getDailyConsumption({
        date_from: chemicalDate,
        date_to: chemicalDate,
        type: 'chemical',
      })
      .then((res) => {
        const row = (res.chemical ?? [])[0];
        setChemicalForm({ chemical_kg: row?.chemical_kg ?? 0 });
      })
      .catch(() => setChemicalForm({ chemical_kg: 0 }))
      .finally(() => setChemicalFormLoading(false));
  }, [chemicalDate]);

  const saveChiller = async () => {
    if (!selectedChiller) return;
    setChillerSaving(true);
    try {
      const res = (await dashboardSummaryAPI.saveDailyConsumption({
        type: 'chiller',
        date: chillerDate,
        equipment_id: selectedChiller,
        power_kwh: chillerForm.power_kwh,
        water_ct1_l: chillerForm.water_ct1_l,
        water_ct2_l: chillerForm.water_ct2_l,
        water_ct3_l: chillerForm.water_ct3_l,
      })) as { warnings?: string[]; actual_electricity_cost_rs?: number | null };
      setChillerForm((p) => ({
        ...p,
        actual_electricity_cost_rs:
          typeof res?.actual_electricity_cost_rs === 'number' ? res.actual_electricity_cost_rs : null,
      }));
      const warnings = res?.warnings;
      if (Array.isArray(warnings) && warnings.length > 0) {
        const warningMessage = warnings.join(' ');
        toast.warning(`Chiller consumption saved with limit warnings: ${warningMessage}`);
      } else {
        toast.success('Chiller consumption saved');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Failed to save');
    } finally {
      setChillerSaving(false);
    }
  };

  const saveBoiler = async () => {
    if (!selectedBoiler) return;
    setBoilerSaving(true);
    try {
      const res = (await dashboardSummaryAPI.saveDailyConsumption({
        type: 'boiler',
        date: boilerDate,
        equipment_id: selectedBoiler,
        power_kwh: boilerForm.power_kwh,
        water_l: boilerForm.water_l,
        diesel_l: boilerForm.diesel_l,
        furnace_oil_l: boilerForm.furnace_oil_l,
        brigade_kg: boilerForm.brigade_kg,
        steam_kg_hr: boilerForm.steam_kg_hr,
      })) as { warnings?: string[]; actual_electricity_cost_rs?: number | null };
      setBoilerForm((p) => ({
        ...p,
        actual_electricity_cost_rs:
          typeof res?.actual_electricity_cost_rs === 'number' ? res.actual_electricity_cost_rs : null,
      }));
      const warnings = res?.warnings;
      if (Array.isArray(warnings) && warnings.length > 0) {
        const warningMessage = warnings.join(' ');
        toast.warning(`Boiler consumption saved with limit warnings: ${warningMessage}`);
      } else {
        toast.success('Boiler consumption saved');
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to save';
      toast.error(msg);
    } finally {
      setBoilerSaving(false);
    }
  };

  const saveChemical = async () => {
    setChemicalSaving(true);
    try {
      await dashboardSummaryAPI.saveDailyConsumption({
        type: 'chemical',
        date: chemicalDate,
        chemical_kg: chemicalForm.chemical_kg,
      });
      toast.success('Chemical consumption saved');
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Failed to save');
    } finally {
      setChemicalSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Consumption"
        subtitle="Enter daily consumptions by equipment and date (Settings-style)"
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Chiller daily consumption – Settings-style form */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Chiller daily consumption</h3>
              <p className="text-sm text-muted-foreground">
                Enter daily consumption for the selected chiller and date. Manual entries override values from approved logs.
              </p>
            </div>
          </div>
          {chillerLoading ? (
            <p className="text-sm text-muted-foreground">Loading chiller equipment…</p>
          ) : chillerEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No approved chiller equipment found. Add equipment with category Chiller in Equipment Master.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <Label>Select chiller</Label>
                  <Select
                    value={selectedChiller || chillerEquipment[0]?.equipment_number}
                    onValueChange={setSelectedChiller}
                  >
                    <SelectTrigger className="w-full min-w-[200px]">
                      <SelectValue placeholder="Select chiller" />
                    </SelectTrigger>
                    <SelectContent>
                      {chillerEquipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.equipment_number}>
                          {eq.equipment_number} – {eq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    max={todayDate}
                    value={chillerDate}
                    onChange={(e) => setChillerDate(e.target.value)}
                    className="w-40"
                  />
                </div>
              </div>
              {selectedChiller && (() => {
                const eq = chillerEquipment.find((e) => e.equipment_number === selectedChiller);
                if (!eq) return null;
                return (
                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium text-foreground">{eq.equipment_number} – {eq.name}</h4>
                    {chillerFormLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading…
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Daily power consumption (kWh)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={chillerForm.power_kwh === 0 ? '' : chillerForm.power_kwh}
                            onChange={(e) =>
                              setChillerForm((p) => ({
                                ...p,
                                power_kwh: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0,
                                actual_electricity_cost_rs: null,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Actual electricity cost (₹)</Label>
                          <Input
                            type="text"
                            readOnly
                            className="bg-muted/50"
                            value={
                              chillerRateRsPerKwh != null
                                ? chillerForm.actual_electricity_cost_rs != null
                                  ? `₹ ${Number(chillerForm.actual_electricity_cost_rs).toFixed(2)}`
                                  : `₹ ${((chillerForm.power_kwh ?? 0) * chillerRateRsPerKwh).toFixed(2)}`
                                : 'No rate for this date — in Settings use Effective from = this date, or leave blank for all dates'
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cooling Tower 1 – Water (L)</Label>
                          <Input type="number" min={0} step="any" value={chillerForm.water_ct1_l === 0 ? '' : chillerForm.water_ct1_l} onChange={(e) => setChillerForm((p) => ({ ...p, water_ct1_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cooling Tower 2 – Water (L)</Label>
                          <Input type="number" min={0} step="any" value={chillerForm.water_ct2_l === 0 ? '' : chillerForm.water_ct2_l} onChange={(e) => setChillerForm((p) => ({ ...p, water_ct2_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cooling Tower 3 – Water (L)</Label>
                          <Input type="number" min={0} step="any" value={chillerForm.water_ct3_l === 0 ? '' : chillerForm.water_ct3_l} onChange={(e) => setChillerForm((p) => ({ ...p, water_ct3_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                      </div>
                    )}
                    <Button size="sm" variant="default" disabled={chillerSaving || chillerFormLoading} onClick={saveChiller}>
                      {chillerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save consumption'}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Boiler daily consumption – Settings-style form */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Boiler daily consumption</h3>
              <p className="text-sm text-muted-foreground">
                Enter daily consumption for the selected boiler and date. Manual entries override values from logs.
              </p>
            </div>
          </div>
          {boilerLoading ? (
            <p className="text-sm text-muted-foreground">Loading boiler equipment…</p>
          ) : boilerEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No approved boiler equipment found. Add equipment with category Boiler in Equipment Master.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <Label>Select boiler</Label>
                  <Select
                    value={selectedBoiler || boilerEquipment[0]?.equipment_number}
                    onValueChange={setSelectedBoiler}
                  >
                    <SelectTrigger className="w-full min-w-[200px]">
                      <SelectValue placeholder="Select boiler" />
                    </SelectTrigger>
                    <SelectContent>
                      {boilerEquipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.equipment_number}>
                          {eq.equipment_number} – {eq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" max={todayDate} value={boilerDate} onChange={(e) => setBoilerDate(e.target.value)} className="w-40" />
                </div>
              </div>
              {selectedBoiler && (() => {
                const eq = boilerEquipment.find((e) => e.equipment_number === selectedBoiler);
                if (!eq) return null;
                return (
                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium text-foreground">{eq.equipment_number} – {eq.name}</h4>
                    {boilerFormLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading…
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Daily power consumption (kWh)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.power_kwh === 0 ? '' : boilerForm.power_kwh} onChange={(e) => setBoilerForm((p) => ({ ...p, power_kwh: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0, actual_electricity_cost_rs: null }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Actual electricity cost (₹)</Label>
                          <Input
                            type="text"
                            readOnly
                            className="bg-muted/50"
                            value={
                              boilerForm.actual_electricity_cost_rs != null
                                ? `₹ ${Number(boilerForm.actual_electricity_cost_rs).toFixed(2)}`
                                : boilerRateRsPerKwh != null
                                  ? `₹ ${((boilerForm.power_kwh ?? 0) * boilerRateRsPerKwh).toFixed(2)}`
                                  : 'Set electricity rate in Settings → Boiler limits'
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Daily water consumption (L)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.water_l === 0 ? '' : boilerForm.water_l} onChange={(e) => setBoilerForm((p) => ({ ...p, water_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Daily diesel consumption (L)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.diesel_l === 0 ? '' : boilerForm.diesel_l} onChange={(e) => setBoilerForm((p) => ({ ...p, diesel_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Daily furnace oil consumption (L)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.furnace_oil_l === 0 ? '' : boilerForm.furnace_oil_l} onChange={(e) => setBoilerForm((p) => ({ ...p, furnace_oil_l: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Daily brigade consumption (kg)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.brigade_kg === 0 ? '' : boilerForm.brigade_kg} onChange={(e) => setBoilerForm((p) => ({ ...p, brigade_kg: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Steam consumption (kg/hr)</Label>
                          <Input type="number" min={0} step="any" value={boilerForm.steam_kg_hr === 0 ? '' : boilerForm.steam_kg_hr} onChange={(e) => setBoilerForm((p) => ({ ...p, steam_kg_hr: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                        </div>
                      </div>
                    )}
                    <Button size="sm" variant="default" disabled={boilerSaving || boilerFormLoading} onClick={saveBoiler}>
                      {boilerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save consumption'}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Chemical daily consumption – Settings-style */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Chemical daily consumption</h3>
              <p className="text-sm text-muted-foreground">
                Enter total chemical consumption (kg) for the selected date.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" max={todayDate} value={chemicalDate} onChange={(e) => setChemicalDate(e.target.value)} className="w-40" />
              </div>
            </div>
            <div className="border border-border rounded-lg p-4 space-y-4 max-w-md">
              {chemicalFormLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Chemical consumption (kg)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={chemicalForm.chemical_kg === 0 ? '' : chemicalForm.chemical_kg}
                    onChange={(e) => setChemicalForm((p) => ({ ...p, chemical_kg: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              )}
              <Button size="sm" variant="default" disabled={chemicalSaving || chemicalFormLoading} onClick={saveChemical}>
                {chemicalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save consumption'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
