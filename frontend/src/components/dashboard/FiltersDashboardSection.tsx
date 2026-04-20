import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { filtersDashboardAPI, filterScheduleAPI, type FiltersDashboardSummary } from '@/lib/api';
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
import { Loader2 } from 'lucide-react';
import { DashboardSectionShell } from './DashboardSectionShell';
import { DashboardInsightRow } from './DashboardInsightRow';
import { formatDiffPct, rowStatus } from './dashboard-status';
import { cn } from '@/lib/utils';

type PeriodType = 'week' | 'month';
export type FiltersPeriodType = PeriodType;

interface FiltersDashboardSectionProps {
  periodType?: FiltersPeriodType;
  onPeriodTypeChange?: (value: FiltersPeriodType) => void;
  date?: string;
  onDateChange?: (value: string) => void;
  selectedEquipmentId?: string;
  onSelectedEquipmentIdChange?: (value: string) => void;
  showToolbar?: boolean;
  className?: string;
  onEquipmentOptionsChange?: (options: { value: string; label: string }[]) => void;
}

const ACCENT = '262,60%,45%';

const MAINTENANCE_TYPES = [
  { key: 'replacement_count' as const, label: 'Replacement', projKey: 'projected_replacement_count' as const },
  { key: 'cleaning_count' as const, label: 'Cleaning', projKey: 'projected_cleaning_count' as const },
  { key: 'integrity_count' as const, label: 'Integrity', projKey: 'projected_integrity_count' as const },
];

function getDefaultDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function periodLabel(summary: FiltersDashboardSummary): string {
  const start = summary.period_start;
  const end = summary.period_end;
  if (summary.period_type === 'week') {
    return `${format(new Date(start), 'd MMM')} – ${format(new Date(end), 'd MMM yyyy')}`;
  }
  return format(new Date(start), 'MMM yyyy');
}

function costDonutPct(actual: number, projected: number): number | null {
  if (projected <= 0) return null;
  return Math.min(100, Math.max(0, (actual / projected) * 100));
}

export function FiltersDashboardSection({
  periodType: periodTypeProp,
  onPeriodTypeChange,
  date: dateProp,
  onDateChange,
  selectedEquipmentId: selectedEquipmentIdProp,
  onSelectedEquipmentIdChange,
  showToolbar = true,
  className,
  onEquipmentOptionsChange,
}: FiltersDashboardSectionProps = {}) {
  const [periodTypeState, setPeriodTypeState] = useState<PeriodType>('month');
  const [dateState, setDateState] = useState<string>(getDefaultDate());
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedEquipmentIdState, setSelectedEquipmentIdState] = useState<string>('');
  const periodType = periodTypeProp ?? periodTypeState;
  const setPeriodType = onPeriodTypeChange ?? setPeriodTypeState;
  const date = dateProp ?? dateState;
  const setDate = onDateChange ?? setDateState;
  const selectedEquipmentId = selectedEquipmentIdProp ?? selectedEquipmentIdState;
  const setSelectedEquipmentId = onSelectedEquipmentIdChange ?? setSelectedEquipmentIdState;
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [summary, setSummary] = useState<FiltersDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayDate = getDefaultDate();
  const isRangeActive = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const requestDate = date || (isRangeActive ? dateTo || dateFrom : '') || todayDate;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const schedules = await filterScheduleAPI.list({ approval: 'approved' });
        const list = Array.isArray(schedules) ? schedules : (schedules as { results?: unknown })?.results ?? [];
        type Item = { assignment_info?: { equipment_id?: string; equipment_number?: string; equipment_name?: string } };
        const seen = new Set<string>();
        const opts = (list as Item[])
          .map((s) => s?.assignment_info)
          .filter((info): info is NonNullable<Item['assignment_info']> => Boolean(info?.equipment_id))
          .filter((info) => {
            if (seen.has(info.equipment_id!)) return false;
            seen.add(info.equipment_id!);
            return true;
          })
          .map((info) => ({
            value: info.equipment_id!,
            label: `${info.equipment_number ?? info.equipment_id}${info.equipment_name ? ` – ${info.equipment_name}` : ''}`,
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
        const data = await filtersDashboardAPI.getSummary({
          periodType,
          date: requestDate,
          equipmentId: selectedEquipmentId || undefined,
          dateFrom: isRangeActive ? dateFrom : undefined,
          dateTo: isRangeActive ? dateTo : undefined,
        });
        setSummary(data);
      } catch (e: unknown) {
        if (!background) {
          const message = e instanceof Error ? e.message : 'Failed to load filters dashboard';
          setError(message);
          setSummary(null);
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [periodType, requestDate, selectedEquipmentId, isRangeActive, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const interval = setInterval(() => fetchSummary(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const hasProjectedConsumption = summary?.projected_consumption != null;
  const hasProjectedCost = summary?.projected_cost_rs != null;

  const activityChartData = useMemo(() => {
    if (!summary) return [];
    return MAINTENANCE_TYPES.map(({ key, label, projKey }) => ({
      name: label,
      actual: summary[key],
      target: (summary[projKey] as number | undefined) ?? 0,
    }));
  }, [summary]);

  const activityTableRows = useMemo(() => {
    if (!summary) return [];
    return MAINTENANCE_TYPES.map(({ key, label, projKey }) => {
      const actual = summary[key];
      const projected = (summary[projKey] as number | undefined) ?? 0;
      return {
        period: label,
        actual: String(actual),
        target: projected > 0 ? String(projected) : '—',
        forecast: projected > 0 ? String(projected) : '—',
        status: rowStatus(actual, projected, projected),
      };
    });
  }, [summary]);

  const costChartData = useMemo(() => {
    if (!summary) return [];
    return [
      {
        name: 'Period total',
        actual: summary.total_cost_rs,
        target: summary.projected_cost_rs ?? 0,
      },
    ];
  }, [summary]);

  const costTableRows = useMemo(() => {
    if (!summary) return [];
    return [
      {
        period: periodLabel(summary),
        actual: `₹${summary.total_cost_rs.toLocaleString('en-IN')}`,
        target:
          summary.projected_cost_rs != null
            ? `₹${summary.projected_cost_rs.toLocaleString('en-IN')}`
            : '—',
        forecast:
          summary.projected_cost_rs != null
            ? `₹${summary.projected_cost_rs.toLocaleString('en-IN')}`
            : '—',
        status: rowStatus(summary.total_cost_rs, 0, summary.projected_cost_rs ?? 0),
      },
    ];
  }, [summary]);

  const toolbar = (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="filters-period-date" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          Date
        </Label>
        <Input
          id="filters-period-date"
          type="date"
          max={todayDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-[150px] sm:w-[160px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="filters-date-from" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          From
        </Label>
        <Input
          id="filters-date-from"
          type="date"
          max={todayDate}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 w-[150px] sm:w-[160px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="filters-date-to" className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">
          To
        </Label>
        <Input
          id="filters-date-to"
          type="date"
          max={todayDate}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 w-[150px] sm:w-[160px]"
        />
      </div>
      <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
        {(['week', 'month'] as const).map((p) => (
          <Button
            key={p}
            variant={periodType === p ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-md px-2.5 text-xs"
            onClick={() => setPeriodType(p)}
          >
            {p === 'week' ? 'W' : 'M'}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap sm:text-sm">Equipment</Label>
        <Select
          value={selectedEquipmentId || 'all'}
          onValueChange={(v) => setSelectedEquipmentId(v === 'all' ? '' : v)}
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
      title="Filters dashboard"
      accentHsl={ACCENT}
      variant="framed"
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

      {!loading && !error && summary && (
        <>
          <p className="text-xs text-muted-foreground -mb-2">
            Period: {periodLabel(summary)}
            {isRangeActive ? ` · Exact range (${dateFrom} to ${dateTo})` : ''}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DashboardInsightRow
              subtitle="Maintenance activity (counts) — actual vs projected"
              accentHsl={ACCENT}
              donutCenterTitle="% of projected acts"
              donutCenterValue={
                hasProjectedConsumption && summary.projected_consumption! > 0
                  ? `${Math.round(costDonutPct(summary.total_consumption, summary.projected_consumption!)!)}%`
                  : '—'
              }
              donutFillPct={
                hasProjectedConsumption ? costDonutPct(summary.total_consumption, summary.projected_consumption!) : null
              }
              metrics={[
                { label: 'Actual (activities)', value: String(summary.total_consumption) },
                ...(hasProjectedConsumption
                  ? [
                      { label: 'Projected', value: String(summary.projected_consumption) },
                      {
                        label: 'Δ vs projected',
                        value:
                          summary.projected_consumption! !== 0
                            ? formatDiffPct(summary.total_consumption, summary.projected_consumption!)
                            : '—',
                      },
                    ]
                  : [{ label: 'Projected', value: 'Set in config' }]),
              ]}
              chartData={activityChartData}
              barLabel="Actual count"
              lineLabel="Projected count"
              formatTooltip={(value) => [String(value), '']}
              tableRows={activityTableRows}
              emptyMessage="No activity data."
              chartHeight={260}
              chartType="line-dual"
              rowVariant="standard"
              comparisonHsl="262, 38%, 38%"
            />

            <DashboardInsightRow
              subtitle="Maintenance cost (₹) — actual vs projected"
              accentHsl={ACCENT}
              donutCenterTitle="% of projected cost"
              donutCenterValue={
                hasProjectedCost && summary.projected_cost_rs! > 0
                  ? `${Math.round(costDonutPct(summary.total_cost_rs, summary.projected_cost_rs!)!)}%`
                  : '—'
              }
              donutFillPct={
                hasProjectedCost ? costDonutPct(summary.total_cost_rs, summary.projected_cost_rs!) : null
              }
              metrics={[
                { label: 'Actual (₹)', value: `₹${summary.total_cost_rs.toLocaleString('en-IN')}` },
                ...(hasProjectedCost
                  ? [
                      { label: 'Projected (₹)', value: `₹${summary.projected_cost_rs!.toLocaleString('en-IN')}` },
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
              lineLabel="Projected (₹)"
              formatTooltip={(value) => [
                `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
                '',
              ]}
              tableRows={costTableRows}
              emptyMessage="No cost data."
              chartHeight={260}
              chartType="line-dual"
              rowVariant="soft"
              comparisonHsl="38, 58%, 42%"
            />
          </div>
        </>
      )}
    </DashboardSectionShell>
  );
}
