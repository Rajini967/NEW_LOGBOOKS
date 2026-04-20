import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import {
  boilerDashboardAPI,
  equipmentAPI,
  equipmentCategoryAPI,
  type BoilerDashboardSummary,
  type BoilerDashboardSeriesPoint,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, IndianRupee, Loader2, Settings2, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardSectionShell } from './DashboardSectionShell';
import { DashboardInsightRow, makeCompactChartTooltip } from './DashboardInsightRow';
import { formatDiffPct, rowStatus, utilizationDonutPct } from './dashboard-status';
import { cn } from '@/lib/utils';

type PeriodType = 'day' | 'month' | 'year';
type FuelType = 'diesel' | 'furnace_oil' | 'brigade';
export type BoilerPeriodType = PeriodType;
export type BoilerFuelType = FuelType;

interface BoilerDashboardSectionProps {
  periodType?: BoilerPeriodType;
  onPeriodTypeChange?: (value: BoilerPeriodType) => void;
  date?: string;
  onDateChange?: (value: string) => void;
  fuelType?: BoilerFuelType;
  onFuelTypeChange?: (value: BoilerFuelType) => void;
  selectedEquipmentId?: string;
  onSelectedEquipmentIdChange?: (value: string) => void;
  showToolbar?: boolean;
  className?: string;
  onEquipmentOptionsChange?: (options: { value: string; label: string }[]) => void;
}

const ACCENT = '25,95%,45%';
const COST_PIE_COLORS = ['hsl(30, 90%, 46%)', 'hsl(16 78% 44% / 0.85)'];

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function costDonutPct(actual: number, projected: number): number | null {
  if (projected <= 0) return null;
  return Math.min(100, Math.max(0, (actual / projected) * 100));
}

function steamDonutPct(actual: number, limit: number): number | null {
  if (limit <= 0) return null;
  return Math.min(100, Math.max(0, (actual / limit) * 100));
}

function compactAxisTick(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function formatAxisInr(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-IN');
}

function compactDelta(actual: number, projected: number | null | undefined): { text: string; up: boolean } {
  if (projected == null || projected === 0) return { text: '—', up: false };
  const pct = ((actual - projected) / projected) * 100;
  const abs = Math.abs(pct);
  const rounded = abs >= 10 ? Math.round(abs) : Number(abs.toFixed(1));
  return { text: `${pct >= 0 ? '+' : '-'}${rounded}%`, up: pct >= 0 };
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}


export function BoilerDashboardSection({
  periodType: periodTypeProp,
  onPeriodTypeChange,
  date: dateProp,
  onDateChange,
  fuelType: fuelTypeProp,
  onFuelTypeChange,
  selectedEquipmentId: selectedEquipmentIdProp,
  onSelectedEquipmentIdChange,
  showToolbar = true,
  className,
  onEquipmentOptionsChange,
}: BoilerDashboardSectionProps = {}) {
  const [periodTypeState, setPeriodTypeState] = useState<PeriodType>('day');
  const [dateState, setDateState] = useState<string>(getDefaultDate());
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [fuelTypeState, setFuelTypeState] = useState<FuelType>('diesel');
  const [selectedEquipmentIdState, setSelectedEquipmentIdState] = useState<string>('');
  const periodType = periodTypeProp ?? periodTypeState;
  const setPeriodType = onPeriodTypeChange ?? setPeriodTypeState;
  const date = dateProp ?? dateState;
  const setDate = onDateChange ?? setDateState;
  const fuelType = fuelTypeProp ?? fuelTypeState;
  const setFuelType = onFuelTypeChange ?? setFuelTypeState;
  const selectedEquipmentId = selectedEquipmentIdProp ?? selectedEquipmentIdState;
  const setSelectedEquipmentId = onSelectedEquipmentIdChange ?? setSelectedEquipmentIdState;
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<BoilerDashboardSummary | null>(null);
  const [series, setSeries] = useState<BoilerDashboardSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayDate = getDefaultDate();
  const isRangeActive = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const requestDate = date || (isRangeActive ? dateTo || dateFrom : '') || todayDate;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const boilerCat = categories?.find((c) => /^boiler(s)?$/i.test((c.name || '').trim()));
        const list = boilerCat
          ? await equipmentAPI.list({ category: boilerCat.id, status: 'approved' })
          : [];
        const opts = (Array.isArray(list) ? list : [])
          .filter((e: { is_active?: boolean; status?: string }) => e?.is_active !== false && e?.status === 'approved')
          .map((e: { equipment_number: string; name?: string }) => ({
            value: e.equipment_number,
            label: `${e.equipment_number}${e.name ? ` – ${e.name}` : ''}`,
          }));
        if (!cancelled) {
          setEquipmentOptions(opts);
          onEquipmentOptionsChange?.(opts);
        }
      } catch {
        if (!cancelled) {
          setEquipmentOptions([]);
          onEquipmentOptionsChange?.([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onEquipmentOptionsChange]);

  const fetchSummary = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await boilerDashboardAPI.getSummary({
          periodType,
          date: requestDate,
          equipmentId: selectedEquipmentId || undefined,
          dateFrom: isRangeActive ? dateFrom : undefined,
          dateTo: isRangeActive ? dateTo : undefined,
        });
        setSummary(data);
      } catch (e: unknown) {
        if (!background) {
          const message = e instanceof Error ? e.message : 'Failed to load boiler dashboard';
          setError(message);
          setSummary(null);
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [periodType, requestDate, selectedEquipmentId, isRangeActive, dateFrom, dateTo]
  );

  const fetchSeries = useCallback(async () => {
    try {
      const data = await boilerDashboardAPI.getSeries({
        periodType,
        date: requestDate,
        equipmentId: selectedEquipmentId || undefined,
        days: !isRangeActive && periodType === 'day' ? 1 : undefined,
        dateFrom: isRangeActive ? dateFrom : undefined,
        dateTo: isRangeActive ? dateTo : undefined,
      });
      setSeries(data.series || []);
    } catch {
      setSeries([]);
    }
  }, [periodType, requestDate, selectedEquipmentId, isRangeActive, dateFrom, dateTo]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    setSeries([]);
    fetchSeries();
  }, [fetchSeries]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSummary(true);
      fetchSeries();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary, fetchSeries]);

  const consumptionChartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.label,
        actual: p.actual_power_kwh ?? 0,
        target: p.projected_power_kwh ?? 0,
      })),
    [series]
  );

  const consumptionTableRows = useMemo(
    () =>
      series.map((p) => {
        const a = p.actual_power_kwh ?? 0;
        const t = p.projected_power_kwh ?? 0;
        return {
          period: p.label,
          actual: a.toFixed(1),
          target: '—',
          forecast: t.toFixed(1),
          status: rowStatus(a, 0, t),
        };
      }),
    [series]
  );

  const costChartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.label,
        actual: p.actual_cost_rs ?? 0,
        target: p.projected_cost_rs ?? 0,
      })),
    [series]
  );
  const costPieData = useMemo(
    () => [
      { name: 'Actual (₹)', value: Math.max(0, Number(summary?.actual_cost_rs ?? 0)) },
      { name: 'Projected (₹)', value: Math.max(0, Number(summary?.projected_cost_rs ?? 0)) },
    ],
    [summary?.actual_cost_rs, summary?.projected_cost_rs]
  );
  const costPieHasValues = costPieData.some((d) => d.value > 0);
  const costPieRenderData = costPieHasValues
    ? costPieData
    : [
        { name: 'Actual (₹)', value: 1 },
        { name: 'Projected (₹)', value: 1 },
      ];
  const costPieRenderColors = costPieHasValues ? COST_PIE_COLORS : ['#d1d5db', '#e5e7eb'];

  const costTableRows = useMemo(
    () =>
      series.map((p) => ({
        period: p.label,
        actual:
          p.actual_cost_rs != null
            ? `₹${Number(p.actual_cost_rs).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : '—',
        target: '—',
        forecast:
          p.projected_cost_rs != null
            ? `₹${Number(p.projected_cost_rs).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : '—',
        status: rowStatus(p.actual_cost_rs ?? 0, 0, p.projected_cost_rs ?? 0),
      })),
    [series]
  );

  const fuelChartData = useMemo(() => {
    return series.map((p) => {
      const actual =
        fuelType === 'diesel'
          ? (p.actual_diesel_liters ?? 0)
          : fuelType === 'furnace_oil'
            ? (p.actual_furnace_oil_liters ?? 0)
            : (p.actual_brigade_kg ?? 0);
      const projected =
        fuelType === 'diesel'
          ? (p.projected_diesel_liters ?? 0)
          : fuelType === 'furnace_oil'
            ? (p.projected_furnace_oil_liters ?? 0)
            : (p.projected_brigade_kg ?? 0);
      return { name: p.label, actual, target: projected };
    });
  }, [series, fuelType]);

  const fuelTableRows = useMemo(() => {
    return series.map((p) => {
      const actual =
        fuelType === 'diesel'
          ? (p.actual_diesel_liters ?? 0)
          : fuelType === 'furnace_oil'
            ? (p.actual_furnace_oil_liters ?? 0)
            : (p.actual_brigade_kg ?? 0);
      const projected =
        fuelType === 'diesel'
          ? (p.projected_diesel_liters ?? 0)
          : fuelType === 'furnace_oil'
            ? (p.projected_furnace_oil_liters ?? 0)
            : (p.projected_brigade_kg ?? 0);
      const unit = fuelType === 'brigade' ? 'kg' : 'L';
      return {
        period: p.label,
        actual: `${actual.toFixed(1)} ${unit}`,
        target: '—',
        forecast: `${projected.toFixed(1)} ${unit}`,
        status: rowStatus(actual, 0, projected),
      };
    });
  }, [series, fuelType]);

  const steamChartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.label,
        actual: p.actual_steam_kg_hr ?? 0,
        target: p.projected_steam_kg_hr ?? 0,
      })),
    [series]
  );

  const steamTableRows = useMemo(
    () =>
      series.map((p) => {
        const a = p.actual_steam_kg_hr ?? 0;
        const t = p.projected_steam_kg_hr ?? 0;
        return {
          period: p.label,
          actual: `${a.toFixed(1)}`,
          target: '—',
          forecast: `${t.toFixed(1)}`,
          status: rowStatus(a, 0, t),
        };
      }),
    [series]
  );

  const PowerCompactTooltip = useMemo(
    () => makeCompactChartTooltip((v) => [`${Number(v).toFixed(1)} kWh`, '']),
    []
  );

  const CostCompactTooltip = useMemo(
    () => makeCompactChartTooltip((v) => [`₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, '']),
    []
  );

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost =
    summary?.actual_cost_rs != null ||
    summary?.projected_cost_rs != null ||
    series.some((p) => p.actual_cost_rs != null || p.projected_cost_rs != null);
  const equipmentRows = summary?.by_equipment ?? [];
  const totalEquipmentMasterCount = equipmentOptions.length;
  const equipmentPerformanceList = useMemo(
    () =>
      [...equipmentRows]
        .sort((a, b) => (b.actual_power_kwh ?? 0) - (a.actual_power_kwh ?? 0))
        .map((row) => {
          const actual = Number(row.actual_power_kwh ?? 0);
          const projected = Number(row.limit_power_kwh ?? 0);
          const utilPct =
            projected > 0 ? Math.min(100, Math.max(0, (actual / projected) * 100)) : null;
          return { id: row.equipment_id, actual, projected, utilPct };
        }),
    [equipmentRows]
  );
  const inPeriodEquipmentList = useMemo(
    () => equipmentPerformanceList.filter((row) => row.actual > 0 || row.projected > 0),
    [equipmentPerformanceList]
  );
  const periodEquipmentCount = inPeriodEquipmentList.length;
  const powerDelta = compactDelta(summary?.actual_power_kwh ?? 0, summary?.projected_power_kwh);
  const costDelta = compactDelta(summary?.actual_cost_rs ?? 0, summary?.projected_cost_rs);

  const fuelActual =
    fuelType === 'diesel'
      ? (summary?.actual_diesel_liters ?? summary?.actual_oil_liters ?? 0)
      : fuelType === 'furnace_oil'
        ? (summary?.actual_furnace_oil_liters ?? 0)
        : (summary?.actual_brigade_kg ?? 0);
  const fuelProjected =
    fuelType === 'diesel'
      ? (summary?.projected_diesel_liters ?? summary?.limit_diesel_liters ?? summary?.limit_oil_liters ?? 0)
      : fuelType === 'furnace_oil'
        ? (summary?.projected_furnace_oil_liters ?? summary?.limit_furnace_oil_liters ?? 0)
        : (summary?.projected_brigade_kg ?? summary?.limit_brigade_kg ?? 0);
  const fuelUnit = fuelType === 'brigade' ? 'kg' : 'L';
  const actualEfficiency = safeRatio(summary?.actual_steam_kg_hr ?? 0, fuelActual);
  const projectedEfficiency = safeRatio(
    summary?.projected_steam_kg_hr ?? summary?.limit_steam_kg_hr ?? 0,
    fuelProjected
  );

  const toolbar = (
    <>
      <div className="flex w-full flex-wrap items-center gap-1.5">
        <div className="mr-2 flex items-center gap-1.5">
          <Label htmlFor="boiler-period-date" className="w-8 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">
            Date
          </Label>
          <Input
            id="boiler-period-date"
            type="date"
            max={todayDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-[124px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="boiler-date-from" className="w-8 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">
            From
          </Label>
          <Input
            id="boiler-date-from"
            type="date"
            max={todayDate}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-[124px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="boiler-date-to" className="w-8 text-right text-[11px] font-medium text-muted-foreground whitespace-nowrap">
            To
          </Label>
          <Input
            id="boiler-date-to"
            type="date"
            max={todayDate}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-[124px]"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
          {(['day', 'month', 'year'] as const).map((p) => (
            <Button
              key={p}
              variant={periodType === p ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 rounded-md px-2 text-[10px]"
              onClick={() => setPeriodType(p)}
            >
              {p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}
            </Button>
          ))}
        </div>
      </div>
      <div className="basis-full" />
      <div className="flex w-full items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Equipment</Label>
          <Select value={selectedEquipmentId || 'all'} onValueChange={(v) => setSelectedEquipmentId(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent position="popper" className="!w-[240px] !min-w-[240px] !max-w-[240px]">
              <SelectItem value="all">All</SelectItem>
              {equipmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Fuel</Label>
          <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
            <SelectTrigger className="h-8 w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!w-[170px] !min-w-[170px] !max-w-[170px]">
              <SelectItem value="diesel" className="whitespace-nowrap">Diesel</SelectItem>
              <SelectItem value="furnace_oil" className="whitespace-nowrap">Furnace oil</SelectItem>
              <SelectItem value="brigade" className="whitespace-nowrap">Brigade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );

  return (
    <DashboardSectionShell
      title="Boiler dashboard"
      accentHsl={ACCENT}
      variant="rail"
      accentEdge="strong"
      className={cn('bg-muted/35', className)}
      toolbar={showToolbar ? toolbar : undefined}
    >
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      {!loading && !error && summary && summary.has_boiler_equipment === false && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground text-sm">
          <p>
            No boiler limit or consumption data found for the selected filters/date.
          </p>
        </div>
      )}

      {!loading && !error && summary && summary.has_boiler_equipment !== false && (
        <>
          {isRangeActive ? (
            <p className="text-xs text-muted-foreground -mb-2">
              Exact range total ({dateFrom} to {dateTo})
            </p>
          ) : (periodType === 'month' || periodType === 'year') ? (
            <p className="text-xs text-muted-foreground -mb-2">
              {periodType === 'month' ? 'Month total (aligned with summary)' : 'Year total (aligned with summary)'}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <div className="group rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-blue-100/20 p-2.5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-blue-900/40 dark:from-blue-950/25 dark:to-background">
              <div className="mb-1.5 flex items-start justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-blue-600" />
                  <p className="text-[11px] font-semibold text-foreground">Power Consumption</p>
                </div>
                <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium', powerDelta.text === '—' && 'bg-muted text-muted-foreground', powerDelta.text !== '—' && powerDelta.up && 'bg-red-500/12 text-red-600', powerDelta.text !== '—' && !powerDelta.up && 'bg-emerald-500/12 text-emerald-600')}>
                  {powerDelta.text}
                  {powerDelta.text !== '—' ? (powerDelta.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />) : null}
                </span>
              </div>
              <div className="mb-1">
                <p className="text-lg font-bold leading-none tabular-nums text-foreground">{summary.actual_power_kwh.toFixed(1)} <span className="text-xs font-medium text-muted-foreground">kWh</span></p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  vs projected {hasProjected ? `${summary.projected_power_kwh!.toFixed(1)} kWh` : `${(summary.limit_power_kwh ?? 0).toFixed(1)} kWh`}
                </p>
              </div>
              <div className="h-[126px]">
                {consumptionChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={consumptionChartData}
                      margin={{ top: 14, right: 8, left: 14, bottom: 2 }}
                      barCategoryGap="20%"
                      barGap={8}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={20}
                      />
                      <YAxis
                        tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        width={68}
                        tickFormatter={formatAxisInr}
                      />
                      <Tooltip
                        content={PowerCompactTooltip}
                        cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.35)', strokeWidth: 1, strokeDasharray: '4 3' }}
                        wrapperStyle={{ outline: 'none', zIndex: 50 }}
                        allowEscapeViewBox={{ x: true, y: true }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="square"
                        iconSize={9}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: 1.2, textAlign: 'center' }}
                      />
                      <Bar
                        dataKey="actual"
                        name="Actual (kWh)"
                        fill="hsl(210, 88%, 50%)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={consumptionChartData.length <= 2 ? 44 : 28}
                        minPointSize={5}
                        animationDuration={260}
                        animationEasing="ease-out"
                      >
                        <LabelList
                          dataKey="actual"
                          position="top"
                          formatter={(v: number) => (Number(v) === 0 ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }))}
                          style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        />
                      </Bar>
                      <Bar
                        dataKey="target"
                        name="Projected (kWh)"
                        fill="hsl(222 47% 34% / 0.85)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={consumptionChartData.length <= 2 ? 44 : 28}
                        minPointSize={5}
                        animationDuration={260}
                        animationEasing="ease-out"
                      >
                        <LabelList
                          dataKey="target"
                          position="top"
                          formatter={(v: number) => (Number(v) === 0 ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }))}
                          style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center gap-1.5 text-[10px] text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    No power points in this period
                  </div>
                )}
              </div>
            </div>

            <div className="group rounded-xl border border-orange-200/60 bg-gradient-to-br from-orange-50/80 to-amber-100/20 p-2.5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-orange-900/40 dark:from-orange-950/25 dark:to-background">
              <div className="mb-1.5 flex items-start justify-between">
                <div className="flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5 text-orange-600" />
                  <p className="text-[11px] font-semibold text-foreground">Operating Cost</p>
                </div>
                <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium', costDelta.text === '—' && 'bg-muted text-muted-foreground', costDelta.text !== '—' && costDelta.up && 'bg-red-500/12 text-red-600', costDelta.text !== '—' && !costDelta.up && 'bg-emerald-500/12 text-emerald-600')}>
                  {costDelta.text}
                  {costDelta.text !== '—' ? (costDelta.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />) : null}
                </span>
              </div>
              <div className="mb-1">
                <p className="text-lg font-bold leading-none tabular-nums text-foreground">
                  {summary.actual_cost_rs != null
                    ? `₹${summary.actual_cost_rs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                    : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  vs projected {summary.projected_cost_rs != null ? `₹${summary.projected_cost_rs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                </p>
              </div>
              <div className="h-[126px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Tooltip
                      content={CostCompactTooltip}
                      wrapperStyle={{ outline: 'none', zIndex: 50 }}
                      allowEscapeViewBox={{ x: true, y: true }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="square"
                      iconSize={9}
                      wrapperStyle={{ fontSize: 11, paddingTop: 2, lineHeight: 1.2, textAlign: 'center' }}
                    />
                    <Pie
                      data={costPieRenderData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="40%"
                      outerRadius="90%"
                      paddingAngle={1}
                      stroke="hsl(var(--background))"
                      strokeWidth={1}
                    >
                      {costPieRenderData.map((entry, idx) => (
                        <Cell key={`boiler-cost-pie-${entry.name}`} fill={costPieRenderColors[idx % costPieRenderColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {!selectedEquipmentId && equipmentRows.length > 0 ? (
              <div className="group rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-green-100/20 p-2.5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/25 dark:to-background">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-emerald-600" />
                  <p className="text-[11px] font-semibold text-foreground">Equipment Performance</p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="rounded-md border border-emerald-200/50 bg-white/70 p-1.5 dark:bg-emerald-950/20">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Master Eq</p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">{totalEquipmentMasterCount}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/50 bg-white/70 p-1.5 dark:bg-emerald-950/20">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">In Period</p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">{periodEquipmentCount}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/50 bg-white/70 p-1.5 dark:bg-emerald-950/20">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Actual</p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">
                      {equipmentRows.reduce((s, r) => s + Number(r.actual_power_kwh ?? 0), 0).toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-md border border-emerald-200/50 bg-white/70 p-1.5 dark:bg-emerald-950/20">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Projected</p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">
                      {equipmentRows.reduce((s, r) => s + Number(r.limit_power_kwh ?? 0), 0).toFixed(1)}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <div className="rounded-md border border-emerald-400/55 bg-emerald-50/85 p-1.5 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                        Efficiency (Steam/Fuel)
                      </span>
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                        {actualEfficiency != null ? actualEfficiency.toFixed(3) : '—'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px]">
                      <span className="font-medium text-emerald-700/90 dark:text-emerald-300/90">Projected</span>
                      <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                        {projectedEfficiency != null ? projectedEfficiency.toFixed(3) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border border-emerald-200/40 bg-white/70 dark:bg-emerald-950/20">
                    <div className="max-h-[120px] overflow-y-auto">
                      <table className="w-full table-fixed border-collapse text-[10px]">
                        <colgroup>
                          <col className="w-[40%]" />
                          <col className="w-[22%]" />
                          <col className="w-[22%]" />
                          <col className="w-[16%]" />
                        </colgroup>
                        <thead className="sticky top-0 z-[1]">
                          <tr className="border-b border-emerald-200/35 bg-emerald-50/95 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm dark:border-emerald-800/40 dark:bg-emerald-950/95">
                            <th className="px-2 py-1 text-left font-semibold">Equipment</th>
                            <th className="px-2 py-1 text-right font-semibold">Actual</th>
                            <th className="px-2 py-1 text-right font-semibold">Proj.</th>
                            <th className="px-2 py-1 text-right font-semibold">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inPeriodEquipmentList.map((row) => {
                            const pct = row.utilPct != null ? Math.round(row.utilPct) : null;
                            const pctClass =
                              pct == null
                                ? 'text-muted-foreground'
                                : pct >= 95
                                  ? 'font-semibold text-red-600'
                                  : pct >= 75
                                    ? 'font-medium text-amber-700'
                                    : 'text-emerald-700';
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-emerald-100/40 last:border-b-0 dark:border-emerald-900/30"
                              >
                                <td className="truncate px-2 py-1 font-mono text-foreground" title={row.id}>
                                  {row.id}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.actual.toFixed(1)}</td>
                                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                                  {row.projected.toFixed(1)}
                                </td>
                                <td className={cn('px-2 py-1 text-right tabular-nums', pctClass)}>
                                  {pct != null ? `${pct}%` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="border-t border-emerald-200/30 px-2 py-1 text-[8px] leading-tight text-muted-foreground">
                      kWh for this period · projected from boiler daily limits (configured dates only)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-green-100/20 p-2.5 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/25 dark:to-background">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-emerald-600" />
                  <p className="text-[11px] font-semibold text-foreground">Equipment Performance</p>
                </div>
                <div className="flex h-[128px] items-center gap-1.5 text-[10px] text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  {selectedEquipmentId ? 'Showing selected equipment only' : 'No equipment data in this period'}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DashboardInsightRow
              subtitle={`Fuel (${fuelUnit}) — actual vs projected`}
              accentHsl={ACCENT}
              donutCenterTitle="% of projected fuel"
              donutCenterValue={
                costDonutPct(fuelActual, fuelProjected) != null
                  ? `${Math.round(costDonutPct(fuelActual, fuelProjected)!)}%`
                  : '—'
              }
              donutFillPct={costDonutPct(fuelActual, fuelProjected)}
              metrics={[
                { label: `Actual (${fuelUnit})`, value: fuelActual.toFixed(1) },
                { label: `Projected (${fuelUnit})`, value: fuelProjected.toFixed(1) },
                {
                  label: 'Δ vs projected',
                  value: fuelProjected !== 0 ? formatDiffPct(fuelActual, fuelProjected) : '—',
                },
              ]}
              chartData={fuelChartData}
              barLabel={`Actual (${fuelUnit})`}
              lineLabel={`Projected (${fuelUnit})`}
              formatTooltip={(value) => [`${Number(value).toFixed(1)} ${fuelUnit}`, '']}
              tableRows={fuelTableRows}
              emptyMessage="No fuel data for this period."
              chartType="area-dual"
              rowVariant="soft"
              comparisonHsl="220, 18%, 30%"
            />

            <DashboardInsightRow
              subtitle="Steam (kg) — actual vs projected"
              accentHsl={ACCENT}
              donutCenterTitle="% of projected"
              donutCenterValue={
                steamDonutPct(
                  summary.actual_steam_kg_hr ?? 0,
                  summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0,
                ) != null
                  ? `${Math.round(
                    steamDonutPct(
                      summary.actual_steam_kg_hr ?? 0,
                      summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0,
                    )!,
                  )}%`
                  : '—'
              }
              donutFillPct={steamDonutPct(
                summary.actual_steam_kg_hr ?? 0,
                summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0,
              )}
              metrics={[
                { label: 'Actual (kg)', value: (summary.actual_steam_kg_hr ?? 0).toFixed(1) },
                {
                  label: 'Projected (kg)',
                  value:
                    (summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0) > 0
                      ? (summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0).toFixed(1)
                      : '—',
                },
                {
                  label: 'Δ vs projected',
                  value:
                    (summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0) !== 0
                      ? formatDiffPct(
                        summary.actual_steam_kg_hr ?? 0,
                        summary.projected_steam_kg_hr ?? summary.limit_steam_kg_hr ?? 0,
                      )
                      : '—',
                },
              ]}
              chartData={steamChartData}
              barLabel="Actual (kg)"
              lineLabel="Projected (kg)"
              formatTooltip={(value) => [`${Number(value).toFixed(1)} kg`, '']}
              tableRows={steamTableRows}
              emptyMessage="No steam data for this period."
              chartType="grouped-bar"
              rowVariant="standard"
              comparisonHsl="185, 50%, 36%"
            />
          </div>

          {!selectedEquipmentId && summary.by_equipment && summary.by_equipment.some((row) => row.limit_power_kwh === 0) && (
            <p className="text-xs text-muted-foreground mt-1">
              Some equipment has 0 limit. Set daily power limit in Settings → Boiler daily limits.
            </p>
          )}
        </>
      )}

      {!loading && !error && !summary && (
        <div className="bg-muted/50 rounded-lg border border-border p-6 text-center text-muted-foreground text-sm">
          No summary available.
        </div>
      )}
    </DashboardSectionShell>
  );
}
