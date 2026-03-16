import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  chemicalDashboardAPI,
  type ChemicalDashboardSummary,
  type ChemicalDashboardSeriesPoint,
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
import { Loader2, TrendingUp, IndianRupee, FlaskConical } from 'lucide-react';

type PeriodType = 'day' | 'month' | 'year';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function periodLabel(summary: ChemicalDashboardSummary): string {
  const start = summary.period_start;
  if (summary.period_type === 'day') {
    return format(new Date(start), 'd MMM yyyy');
  }
  if (summary.period_type === 'year') {
    return format(new Date(start), 'yyyy');
  }
  return format(new Date(start), 'MMM yyyy');
}

export function ChemicalDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [selectedEquipmentName, setSelectedEquipmentName] = useState<string>('');
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<ChemicalDashboardSummary | null>(null);
  const [series, setSeries] = useState<ChemicalDashboardSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { equipment_names } = await chemicalDashboardAPI.getEquipmentNames();
        if (!cancelled) {
          setEquipmentOptions(
            (equipment_names || []).map((name) => ({ value: name, label: name }))
          );
        }
      } catch {
        if (!cancelled) setEquipmentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSummary = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await chemicalDashboardAPI.getSummary({
          periodType,
          date,
          equipmentName: selectedEquipmentName || undefined,
        });
        setSummary(data);
      } catch (e: unknown) {
        if (!background) {
          const message = e instanceof Error ? e.message : 'Failed to load chemical dashboard';
          setError(message);
          setSummary(null);
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [periodType, date, selectedEquipmentName]
  );

  const fetchSeries = useCallback(async () => {
    try {
      const data = await chemicalDashboardAPI.getSeries({
        periodType,
        date,
        equipmentName: selectedEquipmentName || undefined,
        days: periodType === 'day' ? 1 : undefined,
      });
      setSeries(data.series || []);
    } catch {
      setSeries([]);
    }
  }, [periodType, date, selectedEquipmentName]);

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

  const hasProjectedConsumption = summary?.projected_consumption_kg != null;
  const hasProjectedCost = summary?.projected_cost_rs != null;

  const consumptionChartData = series.map((p) => ({
    name: p.label,
    Actual: p.actual_consumption_kg ?? 0,
    Projected: p.projected_consumption_kg ?? 0,
  }));
  const costChartData = series.map((p) => ({
    name: p.label,
    'Actual cost': p.actual_cost_rs ?? 0,
    'Projected opex': p.projected_cost_rs ?? 0,
  }));
  const consumptionYMax =
    consumptionChartData.length > 0
      ? Math.max(1, ...consumptionChartData.flatMap((d) => [d.Actual, d.Projected]))
      : 1;
  const costYMax =
    costChartData.length > 0
      ? Math.max(1, ...costChartData.flatMap((d) => [d['Actual cost'], d['Projected opex']]))
      : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 pl-1 border-l-4 border-[hsl(185,70%,40%)]">
        <h3 className="text-lg font-semibold text-foreground">Chemical dashboard</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="chemical-period-date" className="text-sm text-muted-foreground whitespace-nowrap">
            Date
          </Label>
          <Input
            id="chemical-period-date"
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
          <Select
            value={selectedEquipmentName || 'all'}
            onValueChange={(v) => setSelectedEquipmentName(v === 'all' ? '' : v)}
          >
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
          {/* Two cards side by side: Actual consumption vs projected, Actual cost vs projected opex */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(185,70%,40%)]" />
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-[hsl(185,70%,40%)]" />
                Actual consumption vs Projected consumption
              </h4>
              {hasProjectedConsumption ? (
                <div className="space-y-1">
                  <p className="text-foreground">
                    Actual: {summary.total_consumption_kg.toFixed(2)} kg
                  </p>
                  <p className="text-muted-foreground">
                    Projected: {summary.projected_consumption_kg!.toFixed(2)} kg
                  </p>
                  {summary.projected_consumption_kg! !== 0 && (
                    <p className="text-xs text-muted-foreground">
                      Variance:{' '}
                      {(
                        ((summary.total_consumption_kg - summary.projected_consumption_kg!) /
                          summary.projected_consumption_kg!) *
                        100
                      ).toFixed(1)}
                      %
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Set projected consumption in config to compare.
                </p>
              )}
            </div>
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(38,92%,50%)]" />
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <IndianRupee className="h-4 w-4 text-[hsl(38,92%,50%)]" />
                Actual cost vs Projected opex cost
              </h4>
              <div className="space-y-1">
                <p className="text-foreground font-medium">
                  Actual price: ₹{summary.total_cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {hasProjectedCost ? (
                  <>
                    <p className="text-muted-foreground">
                      Projected opex: ₹{summary.projected_cost_rs!.toLocaleString('en-IN')}
                    </p>
                    {summary.projected_cost_rs! !== 0 && (
                      <p className="text-xs text-muted-foreground">
                        Variance:{' '}
                        {(
                          ((summary.total_cost_rs - summary.projected_cost_rs!) /
                            summary.projected_cost_rs!) *
                          100
                        ).toFixed(1)}
                        %
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Set projected cost in config to compare.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chemical cost summary – table by chemical + total */}
          <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(220,60%,35%)] to-[hsl(185,70%,40%)]" />
            <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,35%)]">
                <FlaskConical className="h-4 w-4" />
              </span>
              Individual Chemical Cost ({periodLabel(summary)})
            </h4>
            {summary.by_chemical.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-foreground">Chemical</th>
                      <th className="text-right py-2 px-3 font-medium text-foreground">Consumption (kg)</th>
                      <th className="text-right py-2 px-3 font-medium text-foreground">Cost (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_chemical.map((row, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="py-2 px-3 text-foreground">{row.chemical_name}</td>
                        <td className="py-2 px-3 text-right text-foreground">{row.consumption_kg.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {row.cost_rs != null ? `₹${row.cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {summary.by_chemical.length > 0 && (
              <p className="text-sm font-medium text-foreground mt-4 pt-2 border-t border-border">
                Total cost (period): ₹{summary.total_cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Charts side by side (day / month / year) – like Boiler */}
          <p className="text-xs text-muted-foreground">
            Charts show {periodType === 'day' ? 'day' : periodType === 'month' ? 'month' : 'year'}-wise data for the selected period.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(185,70%,40%)]" />
              <h4 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
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
                        <linearGradient id="chemActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(185, 70%, 40%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(185, 70%, 35%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="chemProjectedFill" x1="0" y1="0" x2="0" y2="1">
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
                      <Tooltip formatter={(value: number) => [`${Number(value).toFixed(2)} kg`, '']} />
                      <Legend />
                      <Area type="monotone" dataKey="Actual" stroke="hsl(185, 70%, 35%)" fill="url(#chemActualFill)" strokeWidth={2} name="Actual (kg)" />
                      <Area type="monotone" dataKey="Projected" stroke="hsl(220, 60%, 25%)" fill="url(#chemProjectedFill)" strokeWidth={2} name="Projected (kg)" />
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
                        <linearGradient id="chemCostActualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(38, 92%, 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(38, 92%, 40%)" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="chemCostProjFill" x1="0" y1="0" x2="0" y2="1">
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
                      <Area type="monotone" dataKey="Actual cost" stroke="hsl(38, 92%, 40%)" fill="url(#chemCostActualFill)" strokeWidth={2} name="Actual cost (₹)" />
                      <Area type="monotone" dataKey="Projected opex" stroke="hsl(220, 60%, 25%)" fill="url(#chemCostProjFill)" strokeWidth={2} name="Projected opex (₹)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
