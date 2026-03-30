import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';
import { DashboardSectionShell } from './DashboardSectionShell';
import { DashboardInsightRow } from './DashboardInsightRow';
import { formatDiffPct, rowStatus } from './dashboard-status';

type PeriodType = 'day' | 'month' | 'year';

const ACCENT = '265,55%,45%';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function costDonutPct(actual: number, projected: number): number | null {
  if (projected <= 0) return null;
  return Math.min(100, Math.max(0, (actual / projected) * 100));
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
          setEquipmentOptions((equipment_names || []).map((name) => ({ value: name, label: name })));
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

  const consumptionChartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.label,
        actual: p.actual_consumption_kg ?? 0,
        target: p.projected_consumption_kg ?? 0,
      })),
    [series]
  );

  const consumptionTableRows = useMemo(
    () =>
      series.map((p) => {
        const a = p.actual_consumption_kg ?? 0;
        const t = p.projected_consumption_kg ?? 0;
        return {
          period: p.label,
          actual: a.toFixed(2),
          target: '—',
          forecast: t.toFixed(2),
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

  const toolbar = (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="chemical-period-date" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          Date
        </Label>
        <Input
          id="chemical-period-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-[150px] sm:w-[160px]"
        />
      </div>
      <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
        {(['day', 'month', 'year'] as const).map((p) => (
          <Button
            key={p}
            variant={periodType === p ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-md px-2.5 text-xs"
            onClick={() => setPeriodType(p)}
          >
            {p === 'day' ? 'D' : p === 'month' ? 'M' : 'Y'}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">Equipment</Label>
        <Select
          value={selectedEquipmentName || 'all'}
          onValueChange={(v) => setSelectedEquipmentName(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-[180px] sm:w-[200px]">
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
    </>
  );

  return (
    <DashboardSectionShell
      title="Chemical dashboard"
      accentHsl={ACCENT}
      variant="plain"
      accentEdge="subtle"
      toolbar={toolbar}
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

      {!loading && !error && summary && (
        <>
          <p className="text-xs text-muted-foreground -mb-2">
            Period: {periodLabel(summary)} · Charts show {periodType === 'day' ? 'day' : periodType === 'month' ? 'month' : 'year'}-wise buckets.
          </p>

          <DashboardInsightRow
            subtitle="Consumption (kg) — actual vs projected"
            accentHsl={ACCENT}
            donutCenterTitle="% of projected (kg)"
            donutCenterValue={
              hasProjectedConsumption && summary.projected_consumption_kg != null && summary.projected_consumption_kg > 0
                ? `${Math.round(costDonutPct(summary.total_consumption_kg, summary.projected_consumption_kg)!)}%`
                : '—'
            }
            donutFillPct={
              hasProjectedConsumption && summary.projected_consumption_kg != null
                ? costDonutPct(summary.total_consumption_kg, summary.projected_consumption_kg)
                : null
            }
            metrics={[
              { label: 'Actual (kg)', value: summary.total_consumption_kg.toFixed(2) },
              ...(hasProjectedConsumption
                ? [
                    { label: 'Projected (kg)', value: summary.projected_consumption_kg!.toFixed(2) },
                    {
                      label: 'Δ vs projected',
                      value:
                        summary.projected_consumption_kg! !== 0
                          ? formatDiffPct(summary.total_consumption_kg, summary.projected_consumption_kg!)
                          : '—',
                    },
                  ]
                : [{ label: 'Projected (kg)', value: 'Set in config' }]),
            ]}
            chartData={consumptionChartData}
            barLabel="Actual (kg)"
            lineLabel="Projected (kg)"
            formatTooltip={(value) => [`${Number(value).toFixed(2)} kg`, '']}
            tableRows={consumptionTableRows}
            emptyMessage="No consumption data for this period."
            chartType="area-dual"
            rowVariant="soft"
            tableZebra
            comparisonHsl="220, 48%, 40%"
          />

          <DashboardInsightRow
            subtitle="Cost (₹) — actual vs projected opex"
            accentHsl={ACCENT}
            donutCenterTitle="% of projected opex"
            donutCenterValue={
              hasProjectedCost && summary.projected_cost_rs != null && summary.projected_cost_rs > 0
                ? `${Math.round(costDonutPct(summary.total_cost_rs, summary.projected_cost_rs)!)}%`
                : '—'
            }
            donutFillPct={
              hasProjectedCost && summary.projected_cost_rs != null
                ? costDonutPct(summary.total_cost_rs, summary.projected_cost_rs)
                : null
            }
            metrics={[
              {
                label: 'Actual (₹)',
                value: `₹${summary.total_cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              },
              ...(hasProjectedCost
                ? [
                    {
                      label: 'Projected (₹)',
                      value: `₹${summary.projected_cost_rs!.toLocaleString('en-IN')}`,
                    },
                    {
                      label: 'Δ vs projected',
                      value:
                        summary.projected_cost_rs! !== 0
                          ? formatDiffPct(summary.total_cost_rs, summary.projected_cost_rs!)
                          : '—',
                    },
                  ]
                : [{ label: 'Projected (₹)', value: 'Set in config' }]),
            ]}
            chartData={costChartData}
            barLabel="Actual cost (₹)"
            lineLabel="Projected opex (₹)"
            formatTooltip={(value) => [
              `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
              '',
            ]}
            tableRows={costTableRows}
            emptyMessage="No cost data for this period."
            chartType="area-dual"
            rowVariant="elevated"
            comparisonHsl="38, 62%, 44%"
          />

          {summary.by_chemical.length > 0 && (
            <Collapsible defaultOpen className="rounded-lg border border-border bg-muted/10">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 [&[data-state=open]_svg]:rotate-180">
                Individual chemical cost ({periodLabel(summary)})
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto border-t border-border px-4 pb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border" style={{ backgroundColor: `hsl(${ACCENT} / 0.12)` }}>
                        <th className="text-left py-2 px-2 font-semibold">Chemical</th>
                        <th className="text-right py-2 px-2 font-semibold">Consumption (kg)</th>
                        <th className="text-right py-2 px-2 font-semibold">Cost (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_chemical.map((row, i) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="py-2 px-2">{row.chemical_name}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{row.consumption_kg.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {row.cost_rs != null
                              ? `₹${row.cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-sm font-medium text-foreground mt-4 pt-2 border-t border-border">
                    Total cost (period): ₹
                    {summary.total_cost_rs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </DashboardSectionShell>
  );
}
