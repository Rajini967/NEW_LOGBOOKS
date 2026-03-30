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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';
import { DashboardSectionShell } from './DashboardSectionShell';
import { DashboardInsightRow } from './DashboardInsightRow';
import { formatDiffPct, rowStatus, utilizationDonutPct } from './dashboard-status';

type PeriodType = 'day' | 'month' | 'year';
type FuelType = 'diesel' | 'furnace_oil' | 'brigade';

const ACCENT = '25,95%,45%';

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

  const hasProjected = summary?.projected_power_kwh != null;
  const hasCost =
    summary?.actual_cost_rs != null ||
    summary?.projected_cost_rs != null ||
    series.some((p) => p.actual_cost_rs != null || p.projected_cost_rs != null);

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

  const toolbar = (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="boiler-period-date" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          Date
        </Label>
        <Input
          id="boiler-period-date"
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
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">Fuel</Label>
        <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
          <SelectTrigger className="h-9 w-[130px] sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="diesel">Diesel</SelectItem>
            <SelectItem value="furnace_oil">Furnace oil</SelectItem>
            <SelectItem value="brigade">Brigade</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <DashboardSectionShell
      title="Boiler dashboard"
      accentHsl={ACCENT}
      variant="rail"
      accentEdge="strong"
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

      {!loading && !error && summary && summary.has_boiler_equipment === false && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground text-sm">
          <p>
            No boiler limit or consumption data found for the selected filters/date.
          </p>
        </div>
      )}

      {!loading && !error && summary && summary.has_boiler_equipment !== false && (
        <>
          {(periodType === 'month' || periodType === 'year') && (
            <p className="text-xs text-muted-foreground -mb-2">
              {periodType === 'month' ? 'Month total (aligned with summary)' : 'Year total (aligned with summary)'}
            </p>
          )}

          <DashboardInsightRow
            subtitle="Power consumption (kWh) — actual vs projected"
            accentHsl={ACCENT}
            donutCenterTitle="% of power limit"
            donutCenterValue={
              utilizationDonutPct(summary.utilization_pct, (summary.limit_power_kwh ?? 0) > 0) != null
                ? `${Math.round(utilizationDonutPct(summary.utilization_pct, (summary.limit_power_kwh ?? 0) > 0)!)}%`
                : '—'
            }
            donutFillPct={utilizationDonutPct(summary.utilization_pct, (summary.limit_power_kwh ?? 0) > 0)}
            metrics={[
              { label: 'Actual (kWh)', value: summary.actual_power_kwh.toFixed(1) },
              {
                label: 'Limit (kWh)',
                value: (summary.limit_power_kwh ?? 0) > 0 ? summary.limit_power_kwh!.toFixed(1) : '—',
              },
              {
                label: 'Δ vs limit',
                value:
                  (summary.limit_power_kwh ?? 0) > 0
                    ? formatDiffPct(summary.actual_power_kwh, summary.limit_power_kwh!)
                    : '—',
              },
              ...(hasProjected
                ? [{ label: 'Projected (kWh)', value: summary.projected_power_kwh!.toFixed(1) }]
                : []),
            ]}
            chartData={consumptionChartData}
            barLabel="Actual (kWh)"
            lineLabel="Projected (kWh)"
            formatTooltip={(value, name) => [`${Number(value).toFixed(1)} kWh`, name]}
            tableRows={consumptionTableRows}
            emptyMessage="No data for this period."
            chartType="pie-split"
            rowVariant="standard"
            comparisonHsl="220, 45%, 36%"
          />

          {hasCost && (
            <DashboardInsightRow
              subtitle="Operating cost (₹) — actual vs projected"
              accentHsl={ACCENT}
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
              chartType="pie-split"
              rowVariant="elevated"
              comparisonHsl="38, 55%, 45%"
            />
          )}

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
            chartType="pie-split"
            rowVariant="soft"
            comparisonHsl="220, 18%, 30%"
          />

          <DashboardInsightRow
            subtitle="Steam (kg/hr) — actual vs projected"
            accentHsl={ACCENT}
            donutCenterTitle="% of steam limit"
            donutCenterValue={
              steamDonutPct(summary.actual_steam_kg_hr ?? 0, summary.limit_steam_kg_hr ?? 0) != null
                ? `${Math.round(steamDonutPct(summary.actual_steam_kg_hr ?? 0, summary.limit_steam_kg_hr ?? 0)!)}%`
                : '—'
            }
            donutFillPct={steamDonutPct(summary.actual_steam_kg_hr ?? 0, summary.limit_steam_kg_hr ?? 0)}
            metrics={[
              { label: 'Actual (kg/hr)', value: (summary.actual_steam_kg_hr ?? 0).toFixed(1) },
              { label: 'Limit (kg/hr)', value: (summary.limit_steam_kg_hr ?? 0).toFixed(1) },
              {
                label: 'Δ vs limit',
                value:
                  (summary.limit_steam_kg_hr ?? 0) !== 0
                    ? formatDiffPct(summary.actual_steam_kg_hr ?? 0, summary.limit_steam_kg_hr ?? 0)
                    : '—',
              },
            ]}
            chartData={steamChartData}
            barLabel="Actual (kg/hr)"
            lineLabel="Projected (kg/hr)"
            formatTooltip={(value) => [`${Number(value).toFixed(1)} kg/hr`, '']}
            tableRows={steamTableRows}
            emptyMessage="No steam data for this period."
            chartType="pie-split"
            rowVariant="standard"
            comparisonHsl="185, 50%, 36%"
          />

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
                      <tr className="border-b border-border" style={{ backgroundColor: `hsl(${ACCENT} / 0.12)` }}>
                        <th className="text-left py-2 px-2 font-semibold">Equipment</th>
                        <th className="text-right py-2 px-2 font-semibold">Actual (kWh)</th>
                        <th className="text-right py-2 px-2 font-semibold">Limit (kWh)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_equipment.map((row) => (
                        <tr key={row.equipment_id} className="border-b border-border/50">
                          <td className="py-2 px-2 font-mono">{row.equipment_id}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{row.actual_power_kwh.toFixed(1)}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{row.limit_power_kwh.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.by_equipment.some((row) => row.limit_power_kwh === 0) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Limit 0? Set daily power limit in Settings → Boiler daily limits for each equipment.
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
