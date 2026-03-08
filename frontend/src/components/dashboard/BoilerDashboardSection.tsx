import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { boilerDashboardAPI, type BoilerDashboardSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, TrendingUp, IndianRupee, BarChart3, Flame } from 'lucide-react';

type PeriodType = 'day' | 'month' | 'year';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function periodLabel(summary: BoilerDashboardSummary): string {
  const start = summary.period_start;
  if (summary.period_type === 'day') return format(new Date(start), 'd MMM yyyy');
  if (summary.period_type === 'month') return format(new Date(start), 'MMM yyyy');
  return format(new Date(start), 'yyyy');
}

export function BoilerDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('day');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [summary, setSummary] = useState<BoilerDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await boilerDashboardAPI.getSummary({ periodType, date });
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
  }, [periodType, date]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const interval = setInterval(() => fetchSummary(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const chartData = summary
    ? [
        {
          name: periodLabel(summary),
          Limit: summary.limit_power_kwh,
          Actual: summary.actual_power_kwh,
        },
      ]
    : [];

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost = summary?.actual_cost_rs != null || summary?.projected_cost_rs != null;

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
          <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(220,60%,35%)] to-[hsl(25,95%,45%)]" />
            <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(25,95%,45%)/15] text-[hsl(25,95%,38%)]">
                <BarChart3 className="h-4 w-4" />
              </span>
              Power consumption (kWh)
            </h4>
            {summary.actual_power_kwh === 0 && summary.limit_power_kwh === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No data for this period.</p>
            ) : (
              <>
                <div
                  className="h-[300px] rounded-lg p-2 bg-gradient-to-r from-[hsl(220,40%,94%)] via-[hsl(25,40%,94%)] to-[hsl(38,40%,96%)]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="boilerLimitGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="boilerActualGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(25, 95%, 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(25, 95%, 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(220, 10%, 45%)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(0, 0%, 100%)',
                          border: '1px solid hsl(220, 15%, 88%)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px hsl(220, 30%, 10%, 0.1)',
                        }}
                        formatter={(value: number) => [`${Number(value).toFixed(1)} kWh`, '']}
                        labelFormatter={(label) => label}
                      />
                      <Area
                        type="monotone"
                        dataKey="Limit"
                        stroke="hsl(220, 60%, 25%)"
                        fillOpacity={1}
                        fill="url(#boilerLimitGradient)"
                        strokeWidth={2}
                        name="Limit (kWh)"
                      />
                      <Area
                        type="monotone"
                        dataKey="Actual"
                        stroke="hsl(25, 95%, 40%)"
                        fillOpacity={1}
                        fill="url(#boilerActualGradient)"
                        strokeWidth={2}
                        name="Actual (kWh)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-xs text-muted-foreground">Limit (kWh)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[hsl(25,95%,45%)]" />
                    <span className="text-xs text-muted-foreground">Actual (kWh)</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(25,95%,45%)]" />
              <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(25,95%,45%)]" />
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(25,95%,45%)/15] text-[hsl(25,95%,38%)]">
                  <Flame className="h-4 w-4" />
                </span>
                Efficiency (Steam/Oil)
              </h4>
              {summary.efficiency_ratio != null ? (
                <p className="text-2xl font-semibold text-[hsl(25,60%,28%)]">
                  {summary.efficiency_ratio.toFixed(2)}
                </p>
              ) : (
                <p className="text-2xl font-semibold text-foreground">—</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {summary.limit_power_kwh > 0 && summary.utilization_pct != null
                  ? `${summary.utilization_pct.toFixed(1)}% power utilization`
                  : (summary.kwh_per_day ?? 0).toFixed(1) + ' kWh/day'}
              </p>
            </div>

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
                <p className="text-sm text-muted-foreground">Set electricity/oil rate to see cost.</p>
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
