import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';
import { DashboardSectionShell } from './DashboardSectionShell';
import { DashboardInsightRow } from './DashboardInsightRow';
import { formatDiffPct, rowStatus, utilizationDonutPct } from './dashboard-status';
import { cn } from '@/lib/utils';

type PeriodType = 'day' | 'month' | 'year';

/** Chiller section chrome + actual bars (~#26A69A) */
const POWER_ACCENT_HSL = '174, 42%, 46%';
/** Projected line — deep navy (~#1A237E) */
const POWER_LIMIT_BAR_HSL = '239, 48%, 32%';
/** Cost row actual bar + donut (Bold BI expenses warm) */
const COST_ACCENT_HSL = '34, 90%, 46%';
/** Projected opex line */
const COST_PROJECTED_LINE_HSL = '16, 78%, 44%';

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function costDonutPct(actual: number, projected: number): number | null {
  if (projected <= 0) return null;
  return Math.min(100, Math.max(0, (actual / projected) * 100));
}

export function ChillerDashboardSection() {
  const [periodType, setPeriodType] = useState<PeriodType>('day');
  const [date, setDate] = useState<string>(getDefaultDate());
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<ChillerDashboardSummary | null>(null);
  const [series, setSeries] = useState<
    { date: string; label: string; limit_power_kwh: number; actual_power_kwh: number; projected_power_kwh?: number | null; actual_cost_rs?: number | null; projected_cost_rs?: number | null }[]
  >([]);
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
          .filter((e: { is_active?: boolean; status?: string }) => e?.is_active !== false && e?.status === 'approved')
          .map((e: { equipment_number: string; name?: string }) => ({
            value: e.equipment_number,
            label: `${e.equipment_number}${e.name ? ` – ${e.name}` : ''}`,
          }));
        if (!cancelled) setEquipmentOptions(opts);
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
    },
    [periodType, date, selectedEquipmentId]
  );

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

  const energyChartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.label,
        actual: p.actual_power_kwh,
        target: p.projected_power_kwh ?? 0,
      })),
    [series]
  );

  const energyTableRows = useMemo(
    () =>
      series.map((p) => ({
        period: p.label,
        actual: p.actual_power_kwh.toFixed(1),
        target: '—',
        forecast: p.projected_power_kwh != null ? Number(p.projected_power_kwh).toFixed(1) : '—',
        status: rowStatus(
          p.actual_power_kwh,
          0,
          p.projected_power_kwh ?? 0
        ),
      })),
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
        status: rowStatus(
          p.actual_cost_rs ?? 0,
          0,
          p.projected_cost_rs ?? 0
        ),
      })),
    [series]
  );

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost =
    summary?.actual_cost_rs != null ||
    summary?.projected_cost_rs != null ||
    series.some((p) => p.actual_cost_rs != null || p.projected_cost_rs != null);

  const toolbar = (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="chiller-period-date" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          Date
        </Label>
        <Input
          id="chiller-period-date"
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
        <Select value={selectedEquipmentId || 'all'} onValueChange={(v) => setSelectedEquipmentId(v === 'all' ? '' : v)}>
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
      title="Chiller dashboard"
      accentHsl={POWER_ACCENT_HSL}
      variant="gradient"
      accentEdge="subtle"
      className="bg-muted/35"
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
          {(periodType === 'month' || periodType === 'year') && (
            <p className="text-xs text-muted-foreground -mb-2">
              {periodType === 'month' ? 'Month total (aligned with summary cards)' : 'Year total (aligned with summary cards)'}
            </p>
          )}

          <DashboardInsightRow
            subtitle="Power consumption (kWh) — actual vs projected"
            accentHsl={POWER_ACCENT_HSL}
            donutCenterTitle="% of projected"
            donutCenterValue={
              utilizationDonutPct(
                hasProjected && summary.projected_power_kwh! > 0
                  ? (summary.actual_power_kwh / summary.projected_power_kwh!) * 100
                  : null,
                hasProjected && summary.projected_power_kwh! > 0
              ) != null
                ? `${Math.round(
                    utilizationDonutPct(
                      hasProjected && summary.projected_power_kwh! > 0
                        ? (summary.actual_power_kwh / summary.projected_power_kwh!) * 100
                        : null,
                      hasProjected && summary.projected_power_kwh! > 0
                    )!
                  )}%`
                : '—'
            }
            donutFillPct={utilizationDonutPct(
              hasProjected && summary.projected_power_kwh! > 0
                ? (summary.actual_power_kwh / summary.projected_power_kwh!) * 100
                : null,
              hasProjected && summary.projected_power_kwh! > 0
            )}
            metrics={[
              { label: 'Actual (kWh)', value: summary.actual_power_kwh.toFixed(1) },
              {
                label: 'Projected (kWh)',
                value:
                  hasProjected
                    ? summary.projected_power_kwh!.toFixed(1)
                    : '—',
              },
              ...(hasProjected
                ? [
                    {
                      label: 'Δ vs projected',
                      value: formatDiffPct(summary.actual_power_kwh, summary.projected_power_kwh!),
                    } as const,
                  ]
                : []),
            ]}
            chartData={energyChartData}
            barLabel="Actual (kWh)"
            lineLabel="Projected (kWh)"
            formatTooltip={(value, name) => [`${Number(value).toFixed(1)} kWh`, name]}
            tableRows={energyTableRows}
            emptyMessage="No data for this period."
            chartType="bar-line"
            rowVariant="card"
            comparisonHsl={POWER_LIMIT_BAR_HSL}
            tableZebra
            tableHeaderTone="neutral"
            statusDisplay="pill"
            leftKpiLayout="stat-box"
          />

          {hasCost && (
            <DashboardInsightRow
              subtitle="Operating cost (₹) — actual vs projected"
              accentHsl={COST_ACCENT_HSL}
              donutCenterTitle="% of projected opex"
              donutCenterValue={
                costDonutPct(summary.actual_cost_rs ?? 0, summary.projected_cost_rs ?? 0) != null
                  ? `${Math.round(costDonutPct(summary.actual_cost_rs ?? 0, summary.projected_cost_rs ?? 0)!)}%`
                  : '—'
              }
              donutFillPct={costDonutPct(summary.actual_cost_rs ?? 0, summary.projected_cost_rs ?? 0)}
              metrics={[
                {
                  label: 'Actual (₹)',
                  value:
                    summary.actual_cost_rs != null
                      ? `₹${summary.actual_cost_rs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                      : '—',
                },
                {
                  label: 'Projected (₹)',
                  value:
                    summary.projected_cost_rs != null
                      ? `₹${summary.projected_cost_rs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                      : '—',
                },
                {
                  label: 'Δ vs projected',
                  value:
                    summary.projected_cost_rs != null && summary.projected_cost_rs !== 0
                      ? formatDiffPct(summary.actual_cost_rs ?? 0, summary.projected_cost_rs)
                      : '—',
                },
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
              chartType="bar-line"
              rowVariant="card"
              comparisonHsl={COST_PROJECTED_LINE_HSL}
              tableZebra
              tableHeaderTone="neutral"
              statusDisplay="pill"
              leftKpiLayout="stat-box"
            />
          )}

          {!selectedEquipmentId && summary.by_equipment && summary.by_equipment.length > 0 && (
            <Collapsible defaultOpen className="rounded-lg border border-border bg-muted/10">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 [&[data-state=open]_svg]:rotate-180">
                By equipment
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto border-t border-border px-4 pb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border" style={{ backgroundColor: `hsl(${POWER_ACCENT_HSL} / 0.12)` }}>
                        <th className="text-left py-2 px-2 font-semibold">Equipment</th>
                        <th className="text-right py-2 px-2 font-semibold">Actual (kWh)</th>
                        <th className="text-right py-2 px-2 font-semibold">Limit (kWh)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_equipment.map((row, idx) => (
                        <tr
                          key={row.equipment_id}
                          className={cn('border-b border-border/50', idx % 2 === 1 && 'bg-muted/25')}
                        >
                          <td className="py-2 px-2 font-mono">{row.equipment_id}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{row.actual_power_kwh.toFixed(1)}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{row.limit_power_kwh.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.by_equipment.some((row) => row.limit_power_kwh === 0) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Limit 0? Set daily power limit in Settings → Chiller daily limits for each equipment.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
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
