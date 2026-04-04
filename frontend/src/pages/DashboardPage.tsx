import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
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
import { chillerDashboardAPI, boilerDashboardAPI, chemicalDashboardAPI, filtersDashboardAPI, filterScheduleAPI } from '@/lib/api';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const { missedByLogType, loading: missedReadingsLoading } = useMissedReadingsByType();

  const { data: dashboardSummary } = useDashboardSummaryQuery(true);
  const { data: overdueSummary } = useOverdueSummaryQuery(true);
  const [activeTab, setActiveTab] = useState('overview');
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
  const [chemicalEquipmentOptions, setChemicalEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [filtersDate, setFiltersDate] = useState(new Date().toISOString().slice(0, 10));
  const [filtersPeriodType, setFiltersPeriodType] = useState<'week' | 'month'>('month');
  const [filtersEquipmentId, setFiltersEquipmentId] = useState('');
  const [filtersEquipmentOptions, setFiltersEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
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
    const loadOverview = async () => {
      try {
        const [chillerSummary, chillerSeries, boilerSummary, boilerSeries, chemicalSummary, filterSummary] =
          await Promise.all([
            chillerDashboardAPI.getSummary({ periodType: chillerPeriodType, date: chillerDate, equipmentId: undefined }),
            chillerDashboardAPI.getSeries({ periodType: chillerPeriodType, date: chillerDate }),
            boilerDashboardAPI.getSummary({ periodType: boilerPeriodType, date: boilerDate, equipmentId: undefined }),
            boilerDashboardAPI.getSeries({ periodType: boilerPeriodType, date: boilerDate }),
            chemicalDashboardAPI.getSummary({ periodType: chemicalPeriodType, date: chemicalDate }),
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
  }, [chillerDate, chillerPeriodType, boilerDate, boilerPeriodType, chemicalDate, chemicalPeriodType, filtersDate, filtersPeriodType]);

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
            <Input type="date" value={chillerDate} onChange={(e) => setChillerDate(e.target.value)} className="h-8 w-[145px]" />
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
            <Input type="date" value={chemicalDate} onChange={(e) => setChemicalDate(e.target.value)} className="h-8 w-[145px]" />
            <div className="flex rounded-md border p-0.5">
              {(['day', 'month', 'year'] as const).map((p) => (
                <Button key={p} size="sm" variant={chemicalPeriodType === p ? 'secondary' : 'ghost'} className="h-7 px-2 text-[10px]" onClick={() => setChemicalPeriodType(p)}>{p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}</Button>
              ))}
            </div>
            <Select value={chemicalEquipmentName || 'all'} onValueChange={(v) => setChemicalEquipmentName(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="All equipment" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All equipment</SelectItem>{chemicalEquipmentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
        {activeTab === 'maintenance' && (
          <>
            <Input type="date" value={filtersDate} onChange={(e) => setFiltersDate(e.target.value)} className="h-8 w-[145px]" />
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
            <DashboardSectionShell title="Operations overview" accentHsl="220,60%,35%">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <MetricCard title="Active Chillers" value={dashboardSummary?.active_chillers_count ?? '—'} unit="units" icon={Thermometer} sparklineData={powerTrend.map((p) => ({ value: p.actual }))} />
                <MetricCard title="Active Boilers" value={dashboardSummary?.active_boilers_count ?? '—'} unit="units" icon={Zap} sparklineData={powerTrend.map((p) => ({ value: p.projected }))} />
                <MetricCard title="Active Chemicals" value={dashboardSummary?.active_chemicals_count ?? '—'} unit="units" icon={FlaskConical} />
                <MetricCard title="Active Filters" value={dashboardSummary?.active_filters_count ?? '—'} unit="units" icon={Filter} />
                <MetricCard title="Power" value={dashboardSummary?.power_today_kwh ?? 0} unit="kWh" icon={Zap} />
                <MetricCard title="Water" value={dashboardSummary?.water_today_liters ?? 0} unit="L" icon={Droplets} />
                <MetricCard title="Fuel" value={dashboardSummary?.fuel_today_liters ?? 0} unit="L" icon={Fuel} />
                <MetricCard title="Diesel" value={dashboardSummary?.diesel_today_liters ?? 0} unit="L" icon={Fuel} />
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
            <ChemicalDashboardSection periodType={chemicalPeriodType} onPeriodTypeChange={setChemicalPeriodType} date={chemicalDate} onDateChange={setChemicalDate} selectedEquipmentName={chemicalEquipmentName} onSelectedEquipmentNameChange={setChemicalEquipmentName} onEquipmentOptionsChange={setChemicalEquipmentOptions} showToolbar={false} />
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
