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
import { chillerDashboardAPI, equipmentAPI, equipmentCategoryAPI, type ChillerDashboardSummary } from '@/lib/api';
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
import { Loader2, Zap, TrendingUp, IndianRupee, BarChart3 } from 'lucide-react';

type PeriodType = 'day' | 'month' | 'year';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function ChillerDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('day');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<ChillerDashboardSummary | null>(null);
  const [series, setSeries] = useState<{ date: string; label: string; limit_power_kwh: number; actual_power_kwh: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const chillerCat = categories?.find((c) => /^chiller(s)?$/i.test((c.name || '').trim()));
        const list = chillerCat
          ? await equipmentAPI.list({ category: chillerCat.id, status: 'approved' })
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

  const fetchSummary = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await chillerDashboardAPI.getSummary({
        periodType,
        date,
        equipmentId: selectedEquipmentId || undefined,
      });
      setSummary(data);
    } catch (e: unknown) {
      if (!background) {
        const message = e instanceof Error ? e.message : 'Failed to load chiller dashboard';
        setError(message);
        setSummary(null);
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [periodType, date, selectedEquipmentId]);

  const fetchSeries = useCallback(async () => {
    try {
      const data = await chillerDashboardAPI.getSeries({
        periodType,
        date,
        equipmentId: selectedEquipmentId || undefined,
        days: periodType === 'day' ? 1 : undefined,
      });
      setSeries(data.series || []);
    } catch {
      setSeries([]);
      setError('Failed to load chart data.');
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
    Actual: p.actual_power_kwh,
    Projected: p.projected_power_kwh ?? 0,
  }));

  const costChartData = series.map((p) => ({
    name: p.label,
    'Actual cost': p.actual_cost_rs ?? 0,
    'Projected opex': p.projected_cost_rs ?? 0,
  }));

  const consumptionYMax = consumptionChartData.length
    ? Math.max(1, ...consumptionChartData.flatMap((d) => [d.Actual, d.Projected]))
    : 1;
  const costYMax = costChartData.length
    ? Math.max(1, ...costChartData.flatMap((d) => [d['Actual cost'], d['Projected opex']]))
    : 1;

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost = summary?.actual_cost_rs != null || summary?.projected_cost_rs != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 pl-1 border-l-4 border-[hsl(185,70%,40%)]">
        <h3 className="text-lg font-semibold text-foreground">Chiller dashboard</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="chiller-period-date" className="text-sm text-muted-foreground whitespace-nowrap">
            Date
          </Label>
          <Input
            id="chiller-period-date"
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

      {!loading && !error && summary && (
        <>
          {/* Efficiency, Consumption, Cost cards – above charts so they are visible without scrolling */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Chiller efficiency – teal accent */}
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(185,70%,40%)]" />
              <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(185,70%,40%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,38%)]">
                  <Zap className="h-4 w-4" />
                </span>
                Efficiency
              </h4>
              {summary.limit_power_kwh > 0 && summary.utilization_pct != null ? (
                <p className="text-2xl font-semibold text-[hsl(185,55%,28%)]">
                  {summary.utilization_pct.toFixed(1)}% utilization
                </p>
              ) : (
                <p className="text-2xl font-semibold text-foreground">—</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {summary.kwh_per_day.toFixed(1)} kWh/day
              </p>
            </div>

            {/* Actual vs projected consumption – blue accent */}
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(220,55%,45%)]" />
              <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(220,55%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(220,55%,45%)/15] text-[hsl(220,55%,38%)]">
                  <TrendingUp className="h-4 w-4" />
                </span>
                Consumption
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
                <p className="text-xs text-muted-foreground mt-1">Set projected power in config to compare.</p>
              )}
            </div>

            {/* Actual vs projected cost – amber accent */}
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(38,92%,45%)]" />
              <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(38,92%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(38,92%,45%)/18] text-[hsl(38,92%,38%)]">
                  <IndianRupee className="h-4 w-4" />
                </span>
                Cost
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
                <p className="text-sm text-muted-foreground">Set electricity rate to see cost.</p>
              )}
            </div>
          </div>

          {/* Two charts: Actual consumption vs Projected | Actual cost vs Projected opex */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Actual consumption vs Projected consumption */}
            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(220,60%,35%)] to-[hsl(185,70%,40%)]" />
              <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,35%)]">
                  <BarChart3 className="h-4 w-4" />
                </span>
                Actual consumption vs Projected consumption
              </h4>
              {(periodType === 'month' || periodType === 'year') && (
                <p className="text-xs text-muted-foreground -mt-2 mb-2">
                  {periodType === 'month' ? 'Month total (same as cards)' : 'Year total (same as cards)'}
                </p>
              )}
              {consumptionChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px] rounded-lg p-2 bg-gradient-to-r from-[hsl(220,40%,94%)] via-[hsl(185,35%,94%)] to-[hsl(38,40%,96%)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={consumptionChartData} margin={{ top: 10, right: 10, left: -10, bottom: consumptionChartData.length > 1 ? 40 : 0 }}>
                      <defs>
                        <linearGradient id="chillerActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(185, 70%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(185, 70%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="chillerProjectedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(220, 60%, 35%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis dataKey="name" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} angle={consumptionChartData.length > 1 ? -35 : 0} textAnchor={consumptionChartData.length > 1 ? 'end' : 'middle'} />
                      <YAxis domain={[0, consumptionYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(0, 0%, 100%)', border: '1px solid hsl(220, 15%, 88%)', borderRadius: '8px', boxShadow: '0 4px 6px -1px hsl(220, 30%, 10%, 0.1)' }}
                        formatter={(value: number) => [`${Number(value).toFixed(1)} kWh`, '']}
                        labelFormatter={(label) => label}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="Actual" stroke="hsl(185, 70%, 40%)" fill="url(#chillerActualFill)" name="Actual (kWh)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Projected" stroke="hsl(220, 60%, 25%)" fill="url(#chillerProjectedFill)" name="Projected (kWh)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Actual cost vs Projected opex cost */}
            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(38,70%,45%)] to-[hsl(185,70%,40%)]" />
              <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(38,70%,45%)/15] text-[hsl(38,70%,38%)]">
                  <IndianRupee className="h-4 w-4" />
                </span>
                Actual cost vs Projected opex cost
              </h4>
              {(periodType === 'month' || periodType === 'year') && (
                <p className="text-xs text-muted-foreground -mt-2 mb-2">
                  {periodType === 'month' ? 'Month total (same as cards)' : 'Year total (same as cards)'}
                </p>
              )}
              {costChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
              ) : (
                <div className="h-[280px] rounded-lg p-2 bg-gradient-to-r from-[hsl(38,40%,96%)] via-[hsl(185,35%,94%)] to-[hsl(220,40%,94%)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={costChartData} margin={{ top: 10, right: 10, left: -10, bottom: costChartData.length > 1 ? 40 : 0 }}>
                      <defs>
                        <linearGradient id="actualCostFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(185, 70%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(185, 70%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="projectedCostFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(38, 70%, 45%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(38, 70%, 35%)" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis dataKey="name" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} angle={costChartData.length > 1 ? -35 : 0} textAnchor={costChartData.length > 1 ? 'end' : 'middle'} />
                      <YAxis domain={[0, costYMax]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(0, 0%, 100%)', border: '1px solid hsl(220, 15%, 88%)', borderRadius: '8px', boxShadow: '0 4px 6px -1px hsl(220, 30%, 10%, 0.1)' }}
                        formatter={(value: number) => [`₹ ${Number(value).toFixed(2)}`, '']}
                        labelFormatter={(label) => label}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="Actual cost" stroke="hsl(185, 70%, 40%)" fill="url(#actualCostFill)" name="Actual cost (₹)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Projected opex" stroke="hsl(38, 70%, 35%)" fill="url(#projectedCostFill)" name="Projected opex (₹)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
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
                  Limit 0? Set daily power limit in Settings → Chiller daily limits for each equipment.
                </p>
              )}
            </div>
          )}
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
