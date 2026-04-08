import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { ChillerDashboardSection } from '@/components/dashboard/ChillerDashboardSection';
import { BoilerDashboardSection } from '@/components/dashboard/BoilerDashboardSection';
import { ChemicalDashboardSection } from '@/components/dashboard/ChemicalDashboardSection';
import { FiltersDashboardSection } from '@/components/dashboard/FiltersDashboardSection';
import { DashboardSectionShell } from '@/components/dashboard/DashboardSectionShell';
import { ScheduledReadingsStatus } from '@/components/dashboard/ScheduledReadingsStatus';
import { useMissedReadingsByType } from '@/hooks/useMissedReadingsByType';
import { useDashboardSummaryQuery, useOverdueSummaryQuery } from '@/hooks/useDashboardQueries';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  chillerDashboardAPI,
  boilerDashboardAPI,
  chemicalDashboardAPI,
  filtersDashboardAPI,
  filterScheduleAPI,
  chillerLimitsAPI,
  boilerLimitsAPI,
  dashboardSummaryAPI,
} from '@/lib/api';
import {
  Thermometer,
  FlaskConical,
  Filter,
  Zap,
  Droplets,
  Fuel,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface OverviewSeriesPoint {
  label: string;
  actual_power_kwh?: number;
  projected_power_kwh?: number;
}

interface OverviewData {
  chillerSummary?: { actual_cost_rs?: number; projected_cost_rs?: number; utilization_pct?: number; by_equipment?: Array<{ equipment_id: string; actual_power_kwh?: number; limit_power_kwh?: number }> };
  chillerSeries?: { series?: OverviewSeriesPoint[] };
  boilerSummary?: { actual_cost_rs?: number; projected_cost_rs?: number; utilization_pct?: number; by_equipment?: Array<{ equipment_id: string; actual_power_kwh?: number; limit_power_kwh?: number }> };
  boilerSeries?: { series?: OverviewSeriesPoint[] };
  chemicalSummary?: { total_cost_rs?: number; projected_cost_rs?: number; total_consumption_kg?: number; projected_consumption_kg?: number };
  filterSummary?: { total_cost_rs?: number; projected_cost_rs?: number };
}
type EquipmentPowerRow = { equipment_id: string; actual_power_kwh?: number; limit_power_kwh?: number };
type OverdueScheduleRow = {
  schedule_type?: string;
  next_due_date?: string;
  assignment_info?: {
    equipment_id?: string;
    equipment_number?: string;
    equipment_name?: string;
    area_category?: string;
    tag_info?: string;
  };
};
type OverdueFilterGroup = {
  id: string;
  label: string;
  types: string[];
  earliestDue?: string;
};

function num0(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** YYYY-MM-DD in the local calendar (avoids UTC day shift from toISOString). */
function toLocalYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Projected water (L) for the selected period using the same "exact configured dates" rules as
 * chiller/boiler dashboard projected power and fuel (no carry-forward of limits from earlier effective_from).
 */
function projectedWaterLitersExactRange(
  startYmd: string,
  endYmd: string,
  chillerLimits: unknown[],
  boilerLimits: unknown[],
): number {
  const inRange = (eff: string) => Boolean(eff) && eff >= startYmd && eff <= endYmd;

  const chill = (chillerLimits || []).filter((row) => {
    const r = row as Record<string, unknown>;
    const eid = String(r?.equipment_id ?? '').trim();
    const eff = String(r?.effective_from ?? '').trim();
    return Boolean(eid) && inRange(eff);
  });
  chill.sort((a, b) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ea = String(ra.equipment_id);
    const eb = String(rb.equipment_id);
    if (ea !== eb) return ea.localeCompare(eb);
    const da = String(ra.effective_from);
    const db = String(rb.effective_from);
    if (da !== db) return da.localeCompare(db);
    return num0(rb.id) - num0(ra.id);
  });
  let chillerSum = 0;
  const seenC = new Set<string>();
  for (const row of chill) {
    const r = row as Record<string, unknown>;
    const key = `${r.equipment_id}|${r.effective_from}`;
    if (seenC.has(key)) continue;
    seenC.add(key);
    chillerSum +=
      num0(r.daily_water_ct1_liters) + num0(r.daily_water_ct2_liters) + num0(r.daily_water_ct3_liters);
  }

  const boil = (boilerLimits || []).filter((row) => {
    const r = row as Record<string, unknown>;
    const eid = String(r?.equipment_id ?? '').trim();
    const eff = String(r?.effective_from ?? '').trim();
    return Boolean(eid) && inRange(eff);
  });
  boil.sort((a, b) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ea = String(ra.equipment_id);
    const eb = String(rb.equipment_id);
    if (ea !== eb) return ea.localeCompare(eb);
    const da = String(ra.effective_from);
    const db = String(rb.effective_from);
    if (da !== db) return da.localeCompare(db);
    return num0(rb.id) - num0(ra.id);
  });
  let boilerSum = 0;
  const seenB = new Set<string>();
  for (const row of boil) {
    const r = row as Record<string, unknown>;
    const key = `${r.equipment_id}|${r.effective_from}`;
    if (seenB.has(key)) continue;
    seenB.add(key);
    boilerSum += num0(r.daily_water_limit_liters);
  }

  return Number((chillerSum + boilerSum).toFixed(2));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { missedByLogType, loading: missedReadingsLoading } = useMissedReadingsByType();
  const todayDate = new Date().toISOString().slice(0, 10);

  const { data: dashboardSummary } = useDashboardSummaryQuery(true);
  const { data: overdueSummary } = useOverdueSummaryQuery(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewDate, setOverviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [overviewPeriodType, setOverviewPeriodType] = useState<'day' | 'month' | 'year'>('day');
  const [showOverduePopup, setShowOverduePopup] = useState(false);
  const [overduePopupAcknowledged, setOverduePopupAcknowledged] = useState(false);
  const [chillerDate, setChillerDate] = useState(new Date().toISOString().slice(0, 10));
  const [chillerPeriodType, setChillerPeriodType] = useState<'day' | 'month' | 'year'>('day');
  const [chillerEquipmentId, setChillerEquipmentId] = useState('');
  const [chillerEquipmentOptions, setChillerEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [boilerDate, setBoilerDate] = useState(new Date().toISOString().slice(0, 10));
  const [boilerPeriodType, setBoilerPeriodType] = useState<'day' | 'month' | 'year'>('day');
  const [boilerFuelType, setBoilerFuelType] = useState<'diesel' | 'furnace_oil' | 'brigade'>('diesel');
  const [boilerEquipmentId, setBoilerEquipmentId] = useState('');
  const [boilerEquipmentOptions, setBoilerEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [chemicalDate, setChemicalDate] = useState(new Date().toISOString().slice(0, 10));
  const [chemicalPeriodType, setChemicalPeriodType] = useState<'day' | 'month' | 'year'>('month');
  const [chemicalEquipmentName, setChemicalEquipmentName] = useState('');
  const [chemicalName, setChemicalName] = useState('');
  const [chemicalEquipmentOptions, setChemicalEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [chemicalNameOptions, setChemicalNameOptions] = useState<{ value: string; label: string }[]>([]);
  const [filtersDate, setFiltersDate] = useState(new Date().toISOString().slice(0, 10));
  const [filtersPeriodType, setFiltersPeriodType] = useState<'week' | 'month'>('month');
  const [filtersEquipmentId, setFiltersEquipmentId] = useState('');
  const [filtersEquipmentOptions, setFiltersEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewActualWaterLiters, setOverviewActualWaterLiters] = useState(0);
  const [overviewProjectedWaterLiters, setOverviewProjectedWaterLiters] = useState(0);
  const [overdueByFilter, setOverdueByFilter] = useState<OverdueFilterGroup[]>([]);
  const overdueEntries = useMemo(
    () =>
      [
        { key: 'replacement', label: 'Replacement', value: Number(overdueSummary?.replacement ?? 0) },
        { key: 'cleaning', label: 'Cleaning', value: Number(overdueSummary?.cleaning ?? 0) },
        { key: 'integrity', label: 'Integrity', value: Number(overdueSummary?.integrity ?? 0) },
      ].filter((x) => x.value > 0),
    [overdueSummary]
  );
  const totalOverdueCount = useMemo(
    () => overdueEntries.reduce((sum, x) => sum + x.value, 0),
    [overdueEntries]
  );
  const hasOverdueFilters = totalOverdueCount > 0;

  useEffect(() => {
    if (activeTab === 'maintenance' && hasOverdueFilters && !overduePopupAcknowledged) {
      setShowOverduePopup(true);
    }
  }, [activeTab, hasOverdueFilters, overduePopupAcknowledged]);

  useEffect(() => {
    if (activeTab !== 'maintenance' || !hasOverdueFilters) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = (await filterScheduleAPI.list({ overdue: true })) as OverdueScheduleRow[];
        if (cancelled) return;
        const groups = new Map<string, OverdueFilterGroup>();
        for (const row of rows || []) {
          const info = row.assignment_info ?? {};
          const equipmentId = String(info.equipment_id ?? '').trim();
          if (!equipmentId) continue;
          const equipmentNum = String(info.equipment_number ?? equipmentId).trim();
          const equipmentName = String(info.equipment_name ?? '').trim();
          const area = String(info.area_category ?? '').trim();
          const tag = String(info.tag_info ?? '').trim();
          const id = `${equipmentId}|${area}|${tag}`;
          const labelBase = equipmentName ? `${equipmentNum} - ${equipmentName}` : equipmentNum;
          const suffix = area || tag ? ` (${[area, tag].filter(Boolean).join(' | ')})` : '';
          if (!groups.has(id)) {
            groups.set(id, {
              id,
              label: `${labelBase}${suffix}`,
              types: [],
              earliestDue: row.next_due_date,
            });
          }
          const g = groups.get(id)!;
          const type = String(row.schedule_type ?? '').trim();
          if (type && !g.types.includes(type)) g.types.push(type);
          if (row.next_due_date && (!g.earliestDue || row.next_due_date < g.earliestDue)) {
            g.earliestDue = row.next_due_date;
          }
        }
        setOverdueByFilter(Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label)));
      } catch {
        if (!cancelled) setOverdueByFilter([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasOverdueFilters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { chemical_names } = await chemicalDashboardAPI.getChemicalNames({
          equipmentName: chemicalEquipmentName || undefined,
        });
        if (cancelled) return;
        const opts = (chemical_names || []).map((name) => ({ value: name, label: name }));
        setChemicalNameOptions(opts);
        setChemicalName((prev) => (prev && opts.some((o) => o.value === prev) ? prev : ''));
      } catch {
        if (!cancelled) {
          setChemicalNameOptions([]);
          setChemicalName('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chemicalEquipmentName]);

  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const [chillerSummary, chillerSeries, boilerSummary, boilerSeries, chemicalSummary, filterSummary] =
          await Promise.all([
            chillerDashboardAPI.getSummary({ periodType: overviewPeriodType, date: overviewDate, equipmentId: undefined }),
            chillerDashboardAPI.getSeries({ periodType: overviewPeriodType, date: overviewDate }),
            boilerDashboardAPI.getSummary({ periodType: overviewPeriodType, date: overviewDate, equipmentId: undefined }),
            boilerDashboardAPI.getSeries({ periodType: overviewPeriodType, date: overviewDate }),
            chemicalDashboardAPI.getSummary({ periodType: overviewPeriodType, date: overviewDate }),
            filtersDashboardAPI.getSummary({ periodType: filtersPeriodType, date: filtersDate }),
          ]);
        if (!cancelled) setOverviewData({ chillerSummary, chillerSeries, boilerSummary, boilerSeries, chemicalSummary, filterSummary });
      } catch {
        if (!cancelled) setOverviewData(null);
      }
    };
    loadOverview();
    const id = window.setInterval(loadOverview, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [overviewDate, overviewPeriodType, filtersDate, filtersPeriodType]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const d = new Date(`${overviewDate}T12:00:00`);
        const start =
          overviewPeriodType === 'day'
            ? overviewDate
            : overviewPeriodType === 'month'
              ? toLocalYyyyMmDd(new Date(d.getFullYear(), d.getMonth(), 1))
              : toLocalYyyyMmDd(new Date(d.getFullYear(), 0, 1));
        const end =
          overviewPeriodType === 'day'
            ? overviewDate
            : overviewPeriodType === 'month'
              ? toLocalYyyyMmDd(new Date(d.getFullYear(), d.getMonth() + 1, 0))
              : toLocalYyyyMmDd(new Date(d.getFullYear(), 11, 31));

        const [chillerLimitsRaw, boilerLimitsRaw, chillerConsumption, boilerConsumption] = await Promise.all([
          chillerLimitsAPI.list(),
          boilerLimitsAPI.list(),
          dashboardSummaryAPI.getDailyConsumptionBatched({ type: 'chiller', date_from: start, date_to: end }),
          dashboardSummaryAPI.getDailyConsumptionBatched({ type: 'boiler', date_from: start, date_to: end }),
        ]);
        if (cancelled) return;

        const chillerRows = Array.isArray((chillerConsumption as any)?.chiller) ? (chillerConsumption as any).chiller : [];
        const boilerRows = Array.isArray((boilerConsumption as any)?.boiler) ? (boilerConsumption as any).boiler : [];
        const waterActual = chillerRows.reduce(
          (sum: number, row: any) =>
            sum +
            numberOrZero(row?.water_ct1_l) +
            numberOrZero(row?.water_ct2_l) +
            numberOrZero(row?.water_ct3_l),
          0
        ) + boilerRows.reduce((sum: number, row: any) => sum + numberOrZero(row?.water_l), 0);
        setOverviewActualWaterLiters(Number(waterActual.toFixed(2)));
        setOverviewProjectedWaterLiters(
          projectedWaterLitersExactRange(start, end, (chillerLimitsRaw as unknown[]) || [], (boilerLimitsRaw as unknown[]) || []),
        );
      } catch {
        if (!cancelled) {
          setOverviewActualWaterLiters(0);
          setOverviewProjectedWaterLiters(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [overviewDate, overviewPeriodType]);

  const powerTrend = useMemo(() => {
    const c = overviewData?.chillerSeries?.series ?? [];
    const b = overviewData?.boilerSeries?.series ?? [];
    return c.map((row: OverviewSeriesPoint, i: number) => ({
      name: row.label,
      actual: (row.actual_power_kwh ?? 0) + (b[i]?.actual_power_kwh ?? 0),
      projected: (row.projected_power_kwh ?? 0) + (b[i]?.projected_power_kwh ?? 0),
    }));
  }, [overviewData]);
  const costComparisonData = useMemo(
    () => [
      { name: 'Energy', actual: (overviewData?.chillerSummary?.actual_cost_rs ?? 0) + (overviewData?.boilerSummary?.actual_cost_rs ?? 0), projected: (overviewData?.chillerSummary?.projected_cost_rs ?? 0) + (overviewData?.boilerSummary?.projected_cost_rs ?? 0) },
      { name: 'Chemicals', actual: overviewData?.chemicalSummary?.total_cost_rs ?? 0, projected: overviewData?.chemicalSummary?.projected_cost_rs ?? 0 },
      { name: 'Filters', actual: overviewData?.filterSummary?.total_cost_rs ?? 0, projected: overviewData?.filterSummary?.projected_cost_rs ?? 0 },
    ],
    [overviewData]
  );
  const usageDonutData = useMemo(
    () => [
      { name: 'Power', value: Math.min(100, Math.max(0, overviewData?.chillerSummary?.utilization_pct ?? 0)), color: '#3b82f6' },
      { name: 'Steam', value: Math.min(100, Math.max(0, overviewData?.boilerSummary?.utilization_pct ?? 0)), color: '#f97316' },
      { name: 'Chemical', value: Math.min(100, Math.max(0, ((overviewData?.chemicalSummary?.total_consumption_kg ?? 0) / Math.max(1, overviewData?.chemicalSummary?.projected_consumption_kg ?? 1)) * 100)), color: '#a855f7' },
    ],
    [overviewData]
  );
  const distributionPieData = useMemo(
    () => [
      { name: 'Fuel', value: dashboardSummary?.fuel_today_liters ?? 0, color: '#f97316' },
      { name: 'Water', value: dashboardSummary?.water_today_liters ?? 0, color: '#22c55e' },
      { name: 'Chemicals', value: overviewData?.chemicalSummary?.total_consumption_kg ?? 0, color: '#a855f7' },
    ],
    [dashboardSummary, overviewData]
  );
  const topEquipmentRows = useMemo(() => {
    const chillerRows = (overviewData?.chillerSummary?.by_equipment ?? []).map((r: EquipmentPowerRow) => ({
      equipment: r.equipment_id,
      actual: r.actual_power_kwh ?? 0,
      limit: r.limit_power_kwh ?? 0,
    }));
    const boilerRows = (overviewData?.boilerSummary?.by_equipment ?? []).map((r: EquipmentPowerRow) => ({
      equipment: r.equipment_id,
      actual: r.actual_power_kwh ?? 0,
      limit: r.limit_power_kwh ?? 0,
    }));
    return [...chillerRows, ...boilerRows]
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 6);
  }, [overviewData]);

  const topFilterBar = (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        {activeTab === 'energy' && (
          <>
            <Label className="text-[10px] text-muted-foreground">Date</Label>
            <Input type="date" max={todayDate} value={chillerDate} onChange={(e) => setChillerDate(e.target.value)} className="h-8 w-[145px]" />
            <div className="flex rounded-md border p-0.5">
              {(['day', 'month', 'year'] as const).map((p) => (
                <Button key={p} size="sm" variant={chillerPeriodType === p ? 'secondary' : 'ghost'} className="h-7 px-2 text-[10px]" onClick={() => setChillerPeriodType(p)}>{p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}</Button>
              ))}
            </div>
            <Select value={chillerEquipmentId || 'all'} onValueChange={(v) => setChillerEquipmentId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All equipment" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All equipment</SelectItem>{chillerEquipmentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
        {activeTab === 'chemicals' && (
          <>
            <Input type="date" max={todayDate} value={chemicalDate} onChange={(e) => setChemicalDate(e.target.value)} className="h-8 w-[145px]" />
            <div className="flex rounded-md border p-0.5">
              {(['day', 'month', 'year'] as const).map((p) => (
                <Button key={p} size="sm" variant={chemicalPeriodType === p ? 'secondary' : 'ghost'} className="h-7 px-2 text-[10px]" onClick={() => setChemicalPeriodType(p)}>{p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}</Button>
              ))}
            </div>
            <Select value={chemicalEquipmentName || 'all'} onValueChange={(v) => setChemicalEquipmentName(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All equipment" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All equipment</SelectItem>{chemicalEquipmentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={chemicalName || 'all'} onValueChange={(v) => setChemicalName(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All chemicals" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All chemicals</SelectItem>{chemicalNameOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
        {activeTab === 'maintenance' && (
          <>
            <Input type="date" max={todayDate} value={filtersDate} onChange={(e) => setFiltersDate(e.target.value)} className="h-8 w-[145px]" />
            <div className="flex rounded-md border p-0.5">
              {(['week', 'month'] as const).map((p) => (
                <Button key={p} size="sm" variant={filtersPeriodType === p ? 'secondary' : 'ghost'} className="h-7 px-2 text-[10px]" onClick={() => setFiltersPeriodType(p)}>{p === 'week' ? 'W' : 'M'}</Button>
              ))}
            </div>
            <Select value={filtersEquipmentId || 'all'} onValueChange={(v) => setFiltersEquipmentId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All equipment" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All equipment</SelectItem>{filtersEquipmentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  );

  const numberOrZero = (value: unknown): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const pickProjected = (obj: unknown, keys: string[]): number => {
    const rec = (obj ?? {}) as Record<string, unknown>;
    for (const key of keys) {
      const raw = rec[key];
      if (raw != null) return numberOrZero(raw);
    }
    return 0;
  };

  const projectedFuelLiquid =
    numberOrZero((overviewData?.boilerSummary as any)?.projected_diesel_liters) +
    numberOrZero((overviewData?.boilerSummary as any)?.projected_furnace_oil_liters);
  const projectedFuelFallback = numberOrZero((overviewData?.boilerSummary as any)?.projected_brigade_kg);
  const actualFuelLiquid =
    numberOrZero((overviewData?.boilerSummary as any)?.actual_diesel_liters) +
    numberOrZero((overviewData?.boilerSummary as any)?.actual_furnace_oil_liters);
  const actualFuelFallback = numberOrZero((overviewData?.boilerSummary as any)?.actual_brigade_kg);

  const overviewConsumptionCards = [
    {
      title: 'Power',
      unit: 'kWh',
      icon: Zap,
      accent: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      actual:
        numberOrZero((overviewData?.chillerSummary as any)?.actual_power_kwh) +
        numberOrZero((overviewData?.boilerSummary as any)?.actual_power_kwh),
      projected:
        numberOrZero((overviewData?.chillerSummary as any)?.projected_power_kwh) +
        numberOrZero((overviewData?.boilerSummary as any)?.projected_power_kwh),
    },
    {
      title: 'Water',
      unit: 'L',
      icon: Droplets,
      accent: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
      actual: overviewActualWaterLiters,
      projected: overviewProjectedWaterLiters,
    },
    {
      title: 'Fuel',
      unit: 'L',
      icon: Fuel,
      accent: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      actual: actualFuelLiquid > 0 ? actualFuelLiquid : actualFuelFallback,
      projected: projectedFuelLiquid > 0 ? projectedFuelLiquid : projectedFuelFallback,
    },
    {
      title: 'Chemical',
      unit: 'kg',
      icon: FlaskConical,
      accent: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
      actual: numberOrZero((overviewData?.chemicalSummary as any)?.total_consumption_kg),
      projected: numberOrZero((overviewData?.chemicalSummary as any)?.projected_consumption_kg),
    },
  ];

  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name || user?.email || 'User'}`}
      />

      <div className="p-3 sm:p-4 space-y-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="energy">Energy</TabsTrigger>
            <TabsTrigger value="chemicals">Chemicals</TabsTrigger>
            <TabsTrigger
              value="maintenance"
              className={hasOverdueFilters ? 'border border-destructive/50 bg-destructive/10 text-destructive' : undefined}
            >
              Maintenance / Filters
              {hasOverdueFilters ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                  {totalOverdueCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          {activeTab !== 'overview' && topFilterBar}
          <TabsContent value="overview" className="space-y-3">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  max={todayDate}
                  value={overviewDate}
                  onChange={(e) => setOverviewDate(e.target.value)}
                  className="h-8 w-[145px]"
                />
                <div className="flex rounded-md border p-0.5">
                  {(['day', 'month', 'year'] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={overviewPeriodType === p ? 'secondary' : 'ghost'}
                      className="h-7 px-2 text-[10px]"
                      onClick={() => setOverviewPeriodType(p)}
                    >
                      {p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DashboardSectionShell title="Operations overview" accentHsl="220,60%,35%">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {overviewConsumptionCards.map((card) => {
                  const Icon = card.icon;
                  const delta = card.actual - card.projected;
                  const deltaLabel =
                    delta === 0
                      ? 'On target'
                      : `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${card.unit}`;
                  return (
                    <div key={card.title} className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/20">
                      <div className="flex items-start justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.title}</p>
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${card.accent}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Actual</span>
                            <span className="font-semibold tabular-nums">
                              {card.actual.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {card.unit}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Projected</span>
                            <span className="font-semibold tabular-nums">
                              {card.projected.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {card.unit}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Difference</span>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${
                            delta > 0
                              ? 'bg-amber-500/10 text-amber-700'
                              : delta < 0
                                ? 'bg-emerald-500/10 text-emerald-700'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {deltaLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </DashboardSectionShell>

            <div className="grid lg:grid-cols-1 gap-3">
              <ScheduledReadingsStatus missedByLogType={missedByLogType} loading={missedReadingsLoading} />
            </div>
          </TabsContent>
          <TabsContent value="energy" className="space-y-3">
            <div className="grid grid-cols-1 gap-3 items-start">
              <ChillerDashboardSection periodType={chillerPeriodType} onPeriodTypeChange={setChillerPeriodType} date={chillerDate} onDateChange={setChillerDate} selectedEquipmentId={chillerEquipmentId} onSelectedEquipmentIdChange={setChillerEquipmentId} onEquipmentOptionsChange={setChillerEquipmentOptions} showToolbar={false} />
              <BoilerDashboardSection periodType={boilerPeriodType} onPeriodTypeChange={setBoilerPeriodType} date={boilerDate} onDateChange={setBoilerDate} fuelType={boilerFuelType} onFuelTypeChange={setBoilerFuelType} selectedEquipmentId={boilerEquipmentId} onSelectedEquipmentIdChange={setBoilerEquipmentId} onEquipmentOptionsChange={setBoilerEquipmentOptions} showToolbar />
            </div>
          </TabsContent>
          <TabsContent value="chemicals" className="space-y-3">
            <ChemicalDashboardSection periodType={chemicalPeriodType} onPeriodTypeChange={setChemicalPeriodType} date={chemicalDate} onDateChange={setChemicalDate} selectedEquipmentName={chemicalEquipmentName} onSelectedEquipmentNameChange={setChemicalEquipmentName} selectedChemicalName={chemicalName} onSelectedChemicalNameChange={setChemicalName} onEquipmentOptionsChange={setChemicalEquipmentOptions} showToolbar={false} />
          </TabsContent>
          <TabsContent value="maintenance" className="space-y-3">
            <FiltersDashboardSection
              periodType={filtersPeriodType}
              onPeriodTypeChange={setFiltersPeriodType}
              date={filtersDate}
              onDateChange={setFiltersDate}
              selectedEquipmentId={filtersEquipmentId}
              onSelectedEquipmentIdChange={setFiltersEquipmentId}
              onEquipmentOptionsChange={setFiltersEquipmentOptions}
              showToolbar={false}
              className={hasOverdueFilters ? 'ring-2 ring-destructive/45' : undefined}
            />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showOverduePopup} onOpenChange={setShowOverduePopup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overdue Filter Maintenance Alert</AlertDialogTitle>
            <AlertDialogDescription>
              One or more due dates have been crossed. Please review Maintenance / Filters and take action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            {overdueByFilter.length > 0 ? overdueByFilter.map((entry) => (
              <div key={entry.id} className="rounded border px-3 py-2">
                <div className="font-medium">{entry.label}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Overdue: {entry.types.join(', ') || '—'}
                  {entry.earliestDue ? ` | Due from: ${entry.earliestDue}` : ''}
                </div>
              </div>
            )) : (
              <div className="text-muted-foreground">No overdue items.</div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setOverduePopupAcknowledged(true);
              }}
            >
              Dismiss
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setActiveTab('maintenance');
                setOverduePopupAcknowledged(true);
              }}
            >
              Open Maintenance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
