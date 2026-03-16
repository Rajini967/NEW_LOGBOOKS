import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
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
import { Loader2, TrendingUp, IndianRupee, BarChart3, Flame, Zap } from 'lucide-react';

type PeriodType = 'day' | 'month' | 'year';
type FuelType = 'diesel' | 'furnace_oil' | 'brigade';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function BoilerDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('day');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<BoilerDashboardSummary | null>(null);
  const [series, setSeries] = useState<BoilerDashboardSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          .filter((e: any) => e?.is_active !== false && e?.status === 'approved')
          .map((e: any) => ({
            value: e.equipment_number,
            label: `${e.equipment_number}${e.name ? ` – ${e.name}` : ''}`,
          }));
        if (!cancelled) setEquipmentOptions(opts);
      } catch {
        if (!cancelled) setEquipmentOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchSummary = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await boilerDashboardAPI.getSummary({
          periodType,
          date,
          equipmentId: selectedEquipmentId || undefined,
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
    [periodType, date, selectedEquipmentId]
  );

  const fetchSeries = useCallback(async () => {
    try {
      const data = await boilerDashboardAPI.getSeries({
        periodType,
        date,
        equipmentId: selectedEquipmentId || undefined,
        days: periodType === 'day' ? 1 : undefined,
      });
      setSeries(data.series || []);
    } catch {
      setSeries([]);
    }
  }, [periodType, date, selectedEquipmentId]);

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

  const consumptionChartData = series.map((p) => ({
    name: p.label,
    Actual: p.actual_power_kwh ?? 0,
    Projected: p.projected_power_kwh ?? 0,
  }));
  const costChartData = series.map((p) => ({
    name: p.label,
    'Actual cost': p.actual_cost_rs ?? 0,
    'Projected opex': p.projected_cost_rs ?? 0,
  }));
  const fuelChartData = series.map((p) => {
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
    return { name: p.label, Actual: actual, Projected: projected };
  });
  const steamChartData = series.map((p) => ({
    name: p.label,
    Actual: p.actual_steam_kg_hr ?? 0,
    Projected: p.projected_steam_kg_hr ?? 0,
  }));

  const consumptionYMax =
    consumptionChartData.length > 0
      ? Math.max(1, ...consumptionChartData.flatMap((d) => [d.Actual, d.Projected]))
      : 1;
  const costYMax =
    costChartData.length > 0
      ? Math.max(1, ...costChartData.flatMap((d) => [d['Actual cost'], d['Projected opex']]))
      : 1;
  const fuelYMax =
    fuelChartData.length > 0
      ? Math.max(1, ...fuelChartData.flatMap((d) => [d.Actual, d.Projected]))
      : 1;
  const steamYMax =
    steamChartData.length > 0
      ? Math.max(1, ...steamChartData.flatMap((d) => [d.Actual, d.Projected]))
      : 1;

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost = summary?.actual_cost_rs != null || summary?.projected_cost_rs != null;

  const fuelActual =
    fuelType === 'diesel'
      ? (summary?.actual_diesel_liters ?? summary?.actual_oil_liters ?? 0)
      : fuelType === 'furnace_oil'
        ? (summary?.actual_furnace_oil_liters ?? 0)
        : (summary?.actual_brigade_kg ?? 0);
  const fuelProjected =
    fuelType === 'diesel'
      ? (summary?.limit_diesel_liters ?? summary?.limit_oil_liters ?? 0)
      : fuelType === 'furnace_oil'
        ? (summary?.limit_furnace_oil_liters ?? 0)
        : (summary?.limit_brigade_kg ?? 0);
  const fuelUnit = fuelType === 'brigade' ? 'kg' : 'L';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 pl-1 border-l-4 border-[hsl(25,95%,45%)]">
        <h3 className="text-lg font-semibold text-foreground">Boiler dashboard</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="boiler-period-date" className="text-sm text-muted-foreground whitespace-nowrap">
            Date
          </Label>
          <Input
            id="boiler-period-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
          {(['day', 'month', 'year'] as const).map((p) => (
            <Button
              key={p}
              variant={periodType === p ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-md"
              onClick={() => setPeriodType(p)}
            >
              {p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Equipment</Label>
          <Select value={selectedEquipmentId || 'all'} onValueChange={(v) => setSelectedEquipmentId(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {equipmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Fuel</Label>
          <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diesel">Diesel</SelectItem>
              <SelectItem value="furnace_oil">Furnace oil</SelectItem>
              <SelectItem value="brigade">Brigade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && summary && summary.has_boiler_equipment === false && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground">
          <p className="text-sm">
            No approved boiler equipment found. Add equipment with category Boiler in Equipment Master and approve it to see the boiler dashboard.
          </p>
        </div>
      )}

      {!loading && !error && summary && summary.has_boiler_equipment !== false && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(220,55%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(220,55%,45%)/15] text-[hsl(220,55%,38%)]">
                  <Zap className="h-4 w-4" />
                </span>
                Actual vs Projected consumption
              </h4>
              <p className="text-lg font-medium text-[hsl(220,40%,28%)]">
                Actual: {summary.actual_power_kwh.toFixed(1)} kWh
              </p>
              {hasProjected ? (
                <>
                  <p className="text-lg text-muted-foreground">
                    Projected: {summary.projected_power_kwh!.toFixed(1)} kWh
                  </p>
                  {summary.projected_power_kwh! !== 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Variance:{' '}
                      {(
                        ((summary.actual_power_kwh - summary.projected_power_kwh!) /
                          summary.projected_power_kwh!) *
                        100
                      ).toFixed(1)}
                      %
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Limit from Settings → Boiler daily limits.</p>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(38,92%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(38,92%,45%)/18] text-[hsl(38,92%,38%)]">
                  <IndianRupee className="h-4 w-4" />
                </span>
                Actual vs Projected opex cost
              </h4>
              {hasCost ? (
                <>
                  <p className="text-lg font-medium text-[hsl(38,60%,28%)]">
                    Actual: ₹{summary.actual_cost_rs?.toLocaleString('en-IN') ?? '—'}
                  </p>
                  <p className="text-lg text-muted-foreground">
                    Projected: ₹{summary.projected_cost_rs?.toLocaleString('en-IN') ?? '—'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Set electricity/oil rate to see cost.</p>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(25,95%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(25,95%,45%)/15] text-[hsl(25,95%,38%)]">
                  <Flame className="h-4 w-4" />
                </span>
                Fuel: Actual vs Projected ({fuelType === 'brigade' ? 'kg' : 'L'})
              </h4>
              <p className="text-lg font-medium text-[hsl(25,60%,28%)]">
                Actual: {fuelActual.toFixed(1)} {fuelUnit}
              </p>
              <p className="text-lg text-muted-foreground">
                Projected: {fuelProjected.toFixed(1)} {fuelUnit}
              </p>
              {fuelProjected !== 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Variance: {(((fuelActual - fuelProjected) / fuelProjected) * 100).toFixed(1)}%
                </p>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(185,70%,40%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,38%)]">
                  <TrendingUp className="h-4 w-4" />
                </span>
                Steam: Actual vs Projected
              </h4>
              <p className="text-lg font-medium text-[hsl(185,55%,28%)]">
                Actual: {(summary.actual_steam_kg_hr ?? 0).toFixed(1)} kg/hr
              </p>
              <p className="text-lg text-muted-foreground">
                Projected: {(summary.limit_steam_kg_hr ?? 0).toFixed(1)} kg/hr
              </p>
              {(summary.limit_steam_kg_hr ?? 0) !== 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Variance:{' '}
                  {(
                    (((summary.actual_steam_kg_hr ?? 0) - (summary.limit_steam_kg_hr ?? 0)) /
                      (summary.limit_steam_kg_hr ?? 1)) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              )}
            </div>
          </div>

          {!selectedEquipmentId && summary.by_equipment && summary.by_equipment.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium text-foreground mb-2">By equipment</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Equipment</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Actual (kWh)</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Limit (kWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_equipment.map((row) => (
                      <tr key={row.equipment_id} className="border-b border-border/50">
                        <td className="py-1.5 font-mono">{row.equipment_id}</td>
                        <td className="text-right py-1.5">{row.actual_power_kwh.toFixed(1)}</td>
                        <td className="text-right py-1.5">{row.limit_power_kwh.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.by_equipment.some((row) => row.limit_power_kwh === 0) && (
                <p className="text-xs text-muted-foreground mt-2">
                  Limit 0? Set daily power limit in Settings → Boiler daily limits for each equipment.
                </p>
              )}
            </div>
          )}

          {(periodType === 'month' || periodType === 'year') && (
            <p className="text-xs text-muted-foreground">
              {periodType === 'month' ? 'Month total (same as cards)' : 'Year total (same as cards)'}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(220,55%,45%)]" />
              <h4 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Actual consumption vs Projected consumption
              </h4>
              {consumptionChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={consumptionChartData}
                      margin={{ top: 10, right: 10, left: -10, bottom: consumptionChartData.length > 1 ? 40 : 0 }}
                    >
                      <defs>
                        <linearGradient id="boilerActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(25, 95%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(25, 95%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="boilerProjectedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(220, 60%, 35%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                        angle={consumptionChartData.length > 1 ? -35 : 0}
                        textAnchor={consumptionChartData.length > 1 ? 'end' : 'middle'}
                      />
                      <YAxis domain={[0, consumptionYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)} kWh`, '']} />
                      <Legend />
                      <Area type="monotone" dataKey="Actual" stroke="hsl(25, 95%, 40%)" fill="url(#boilerActualFill)" strokeWidth={2} name="Actual (kWh)" />
                      <Area type="monotone" dataKey="Projected" stroke="hsl(220, 60%, 25%)" fill="url(#boilerProjectedFill)" strokeWidth={2} name="Projected (kWh)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(38,92%,45%)]" />
              <h4 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Actual cost vs Projected opex cost
              </h4>
              {costChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={costChartData} margin={{ top: 10, right: 10, left: -10, bottom: costChartData.length > 1 ? 40 : 0 }}>
                      <defs>
                        <linearGradient id="boilerCostActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(38, 92%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(38, 92%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="boilerCostProjFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(220, 60%, 35%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                        angle={costChartData.length > 1 ? -35 : 0}
                        textAnchor={costChartData.length > 1 ? 'end' : 'middle'}
                      />
                      <YAxis domain={[0, costYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip formatter={(value: number) => [`₹${Number(value).toLocaleString('en-IN')}`, '']} />
                      <Legend />
                      <Area type="monotone" dataKey="Actual cost" stroke="hsl(38, 92%, 40%)" fill="url(#boilerCostActualFill)" strokeWidth={2} name="Actual cost (₹)" />
                      <Area type="monotone" dataKey="Projected opex" stroke="hsl(220, 60%, 25%)" fill="url(#boilerCostProjFill)" strokeWidth={2} name="Projected opex (₹)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(25,95%,45%)]" />
              <h4 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Actual Fuel vs Projected Fuel ({fuelType === 'brigade' ? 'kg' : 'L'})
              </h4>
              {fuelChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={fuelChartData} margin={{ top: 10, right: 10, left: -10, bottom: fuelChartData.length > 1 ? 40 : 0 }}>
                      <defs>
                        <linearGradient id="boilerFuelActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(25, 95%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(25, 95%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="boilerFuelProjFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(220, 60%, 35%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                        angle={fuelChartData.length > 1 ? -35 : 0}
                        textAnchor={fuelChartData.length > 1 ? 'end' : 'middle'}
                      />
                      <YAxis domain={[0, fuelYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)} ${fuelUnit}`, '']} />
                      <Legend />
                      <Area type="monotone" dataKey="Actual" stroke="hsl(25, 95%, 40%)" fill="url(#boilerFuelActualFill)" strokeWidth={2} name={`Actual (${fuelUnit})`} />
                      <Area type="monotone" dataKey="Projected" stroke="hsl(220, 60%, 25%)" fill="url(#boilerFuelProjFill)" strokeWidth={2} name={`Projected (${fuelUnit})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(185,70%,40%)]" />
              <h4 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Actual steam vs Projected steam
              </h4>
              {steamChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={steamChartData} margin={{ top: 10, right: 10, left: -10, bottom: steamChartData.length > 1 ? 40 : 0 }}>
                      <defs>
                        <linearGradient id="boilerSteamActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(185, 70%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(185, 70%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="boilerSteamProjFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(220, 60%, 35%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                        angle={steamChartData.length > 1 ? -35 : 0}
                        textAnchor={steamChartData.length > 1 ? 'end' : 'middle'}
                      />
                      <YAxis domain={[0, steamYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)} kg/hr`, '']} />
                      <Legend />
                      <Area type="monotone" dataKey="Actual" stroke="hsl(185, 70%, 40%)" fill="url(#boilerSteamActualFill)" strokeWidth={2} name="Actual (kg/hr)" />
                      <Area type="monotone" dataKey="Projected" stroke="hsl(220, 60%, 25%)" fill="url(#boilerSteamProjFill)" strokeWidth={2} name="Projected (kg/hr)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && !error && !summary && (
        <div className="bg-muted/50 rounded-lg border border-border p-6 text-center text-muted-foreground">
          No summary available.
        </div>
      )}
    </div>
  );
}
