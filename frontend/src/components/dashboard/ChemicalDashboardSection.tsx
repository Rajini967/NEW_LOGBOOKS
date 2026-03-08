import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chemicalDashboardAPI, type ChemicalDashboardSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FlaskConical, TrendingUp, IndianRupee, BarChart3 } from 'lucide-react';

type PeriodType = 'week' | 'month';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function periodLabel(summary: ChemicalDashboardSummary): string {
  const start = summary.period_start;
  const end = summary.period_end;
  if (summary.period_type === 'week') {
    return `${format(new Date(start), 'd MMM')} – ${format(new Date(end), 'd MMM yyyy')}`;
  }
  return format(new Date(start), 'MMM yyyy');
}

export function ChemicalDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [summary, setSummary] = useState<ChemicalDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await chemicalDashboardAPI.getSummary({ periodType, date });
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
  }, [periodType, date]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const interval = setInterval(() => fetchSummary(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const hasProjectedConsumption = summary?.projected_consumption_kg != null;
  const hasProjectedCost = summary?.projected_cost_rs != null;

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
          {(['week', 'month'] as const).map((p) => (
            <Button
              key={p}
              variant={periodType === p ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-md"
              onClick={() => setPeriodType(p)}
            >
              {p === 'week' ? 'W' : 'M'}
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
          {/* Consumption by chemical – bar chart */}
          {summary.by_chemical.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(220,60%,35%)] to-[hsl(185,70%,40%)]" />
              <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,35%)]">
                  <BarChart3 className="h-4 w-4" />
                </span>
                Consumption by chemical ({periodLabel(summary)})
              </h4>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary.by_chemical.map((r) => ({
                      name: r.chemical_name.length > 14 ? r.chemical_name.slice(0, 14) + '…' : r.chemical_name,
                      consumption_kg: r.consumption_kg,
                      fullName: r.chemical_name,
                    }))}
                    margin={{ top: 8, right: 16, left: 8, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={summary.by_chemical.length > 4 ? -25 : 0}
                      textAnchor={summary.by_chemical.length > 4 ? 'end' : 'middle'}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit=" kg" />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(2)} kg`, 'Consumption']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                    />
                    <Bar dataKey="consumption_kg" fill="hsl(185,70%,40%)" radius={[4, 4, 0, 0]} name="Consumption (kg)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Individual consumption & cost table */}
          <div className="bg-card rounded-lg border border-border p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(220,60%,35%)] to-[hsl(185,70%,40%)]" />
            <h4 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(185,70%,40%)/15] text-[hsl(185,70%,35%)]">
                <FlaskConical className="h-4 w-4" />
              </span>
              Individual chemical consumption & cost ({periodLabel(summary)})
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
                          {row.cost_rs != null ? `₹${row.cost_rs.toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {summary.by_chemical.length > 0 && (
              <p className="text-sm font-medium text-foreground mt-4 pt-2 border-t border-border">
                Total cost (period): ₹{summary.total_cost_rs.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          {/* Metric cards: Consumption and Cost */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Actual vs projected consumption */}
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(185,70%,40%)]" />
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-[hsl(185,70%,40%)]" />
                Consumption
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

            {/* Actual vs projected cost */}
            <div className="bg-card rounded-lg border border-border p-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(38,92%,50%)]" />
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <IndianRupee className="h-4 w-4 text-[hsl(38,92%,50%)]" />
                Cost
              </h4>
              {hasProjectedCost ? (
                <div className="space-y-1">
                  <p className="text-foreground">
                    Actual: ₹{summary.total_cost_rs.toLocaleString('en-IN')}
                  </p>
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
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Set projected cost in config to compare.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
