import React, { useId } from 'react';
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  LineChart,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { RowStatus } from './dashboard-status';

export interface InsightMetricLine {
  label: string;
  value: string;
}

export interface InsightTableRow {
  period: string;
  actual: string;
  target: string;
  forecast: string;
  status: RowStatus;
}

interface ChartPoint {
  name: string;
  actual: number;
  target: number;
}

/** Middle chart visualization — each dashboard can pick a different type */
export type InsightChartType =
  | 'bar-line'
  | 'grouped-bar'
  | 'area-dual'
  | 'line-dual'
  /** Dual pie: single period = actual vs target; multi = side-by-side mix by category */
  | 'pie-split';

/** Row chrome — visual variety between sections */
export type InsightRowVariant = 'standard' | 'elevated' | 'soft' | 'card';

/** Left KPI column: ring gauge vs rectangular stat card + progress bar */
export type LeftKpiLayout = 'donut' | 'stat-box';

interface DashboardInsightRowProps {
  subtitle: string;
  /** HSL triplet e.g. `185,70%,40%` */
  accentHsl: string;
  /** Second series color for grouped / line / area (HSL triplet) */
  comparisonHsl?: string;
  donutCenterTitle: string;
  donutCenterValue: string;
  donutFillPct: number | null;
  metrics: InsightMetricLine[];
  chartData: ChartPoint[];
  barLabel: string;
  lineLabel: string;
  formatTooltip: (value: number, dataKey: string) => [string, string];
  tableRows: InsightTableRow[];
  emptyMessage?: string;
  chartHeight?: number;
  chartType?: InsightChartType;
  rowVariant?: InsightRowVariant;
  /** Zebra-strip table body rows */
  tableZebra?: boolean;
  /** Table header: tinted accent (default) vs muted gray uppercase (admin-style) */
  tableHeaderTone?: 'accent' | 'neutral';
  /** Status column: dot vs rounded pill */
  statusDisplay?: 'dot' | 'pill';
  /** Left column: donut chart (default) or rectangular KPI + bar */
  leftKpiLayout?: LeftKpiLayout;
}

function StatusDot({ status }: { status: RowStatus }) {
  return (
    <span
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        status === 'on_target' && 'bg-emerald-500',
        status === 'over' && 'bg-red-500',
        status === 'unknown' && 'bg-muted-foreground/50'
      )}
      title={status === 'on_target' ? 'On target' : status === 'over' ? 'Over target' : 'No target'}
    />
  );
}

function StatusPill({ status }: { status: RowStatus }) {
  const label = status === 'on_target' ? 'On target' : status === 'over' ? 'Over target' : 'No target';
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[2.75rem] items-center justify-center rounded-full px-2',
        status === 'on_target' && 'bg-emerald-500/15 ring-1 ring-emerald-600/25',
        status === 'over' && 'bg-red-500/15 ring-1 ring-red-600/25',
        status === 'unknown' && 'bg-muted ring-1 ring-border'
      )}
      title={label}
      aria-label={label}
    />
  );
}

const NEUTRAL_SLICE = 'hsl(220, 14%, 88%)';
const DEFAULT_COMPARISON = '220, 15%, 22%';

function KpiStatBox({
  title,
  value,
  fillPct,
  barColor,
}: {
  title: string;
  value: string;
  fillPct: number | null;
  barColor: string;
}) {
  const hasPct = fillPct != null && !Number.isNaN(fillPct);
  const pct = hasPct ? Math.min(100, Math.max(0, fillPct!)) : 0;

  return (
    <div className="w-full rounded-lg border border-border bg-muted/20 p-3 shadow-sm dark:bg-muted/10">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      <div className="mt-3">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {hasPct ? (
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function hslTriplet(comparisonHsl: string | undefined) {
  return comparisonHsl ?? DEFAULT_COMPARISON;
}

/** Compact labels on bars when few categories (reference-style) */
function shortBarLabel(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n == null || Number.isNaN(n) || n === 0) return '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return abs % 1 < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

const PIE_EPS = 1e-9;

/** Distinct slice colors for multi-category pies (HSL triplet e.g. `185,70%,40%`) */
function hslPaletteFromTriplet(triplet: string, count: number): string[] {
  const parts = triplet.split(',').map((p) => parseFloat(p.trim().replace(/%/g, '')));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n)) || count <= 0) {
    return Array.from({ length: Math.max(count, 1) }, () => `hsl(${triplet})`);
  }
  const [h, s, l] = parts;
  return Array.from({ length: count }, (_, i) => {
    const hi = (h + (i * 300) / Math.max(count, 1)) % 360;
    return `hsl(${Math.round(hi)}, ${Math.min(92, s)}%, ${Math.min(56, Math.max(38, l - i * 1.5))}%)`;
  });
}

/** Recharts default tooltip is tall/padded; use a dense popover so hover/click feels compact */
export function makeCompactChartTooltip(
  formatTooltip: (value: number, name: string) => [string, string]
): React.FC<{
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: unknown; dataKey?: string | number }>;
  label?: string;
}> {
  return function CompactChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="max-w-[220px] rounded-md border border-border bg-popover px-2 py-1 shadow-md"
        style={{ pointerEvents: 'none' }}
      >
        {label != null && String(label) !== '' && (
          <div className="text-[10px] font-semibold leading-tight text-foreground">{String(label)}</div>
        )}
        <div className={label != null && String(label) !== '' ? 'mt-0.5 space-y-0.5' : 'space-y-0.5'}>
          {payload.map((entry, idx) => {
            const v = entry.value;
            if (typeof v !== 'number' || Number.isNaN(v)) return null;
            const nameKey = String(entry.name ?? entry.dataKey ?? '');
            const [text] = formatTooltip(v, nameKey);
            return (
              <div key={idx} className="text-[10px] leading-tight tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground/90">{entry.name ?? nameKey}:</span> {text}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
}

function InsightChart({
  chartType,
  chartData,
  chartHeight,
  barColor,
  comparisonColorCss,
  barLabel,
  lineLabel,
  formatTooltip,
  emptyMessage,
  uid,
  accentHslTriplet,
}: {
  chartType: InsightChartType;
  chartData: ChartPoint[];
  chartHeight: number;
  barColor: string;
  comparisonColorCss: string;
  barLabel: string;
  lineLabel: string;
  formatTooltip: (value: number, dataKey: string) => [string, string];
  emptyMessage: string;
  uid: string;
  accentHslTriplet: string;
}) {
  const yMax =
    chartData.length > 0
      ? Math.max(1, ...chartData.flatMap((d) => [d.actual, d.target]))
      : 1;

  const marginBottom = chartData.length > 1 ? 36 : 8;
  const showBarLabels = chartData.length > 0 && chartData.length <= 12;
  const marginTop = showBarLabels ? 30 : 8;
  const yTop = showBarLabels ? Math.max(yMax * 1.24, yMax + 1e-9) : yMax;

  const commonAxis = {
    x: (
      <XAxis
        dataKey="name"
        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        axisLine={false}
        tickLine={false}
        interval={0}
        tickMargin={6}
        padding={{ left: 14, right: 12 }}
        angle={chartData.length > 1 ? -30 : 0}
        textAnchor={chartData.length > 1 ? ('end' as const) : ('middle' as const)}
        height={chartData.length > 1 ? 56 : 30}
      />
    ),
    y: (
      <YAxis
        domain={[0, yTop]}
        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        axisLine={false}
        tickLine={false}
        width={44}
      />
    ),
  };

  const CompactTooltip = makeCompactChartTooltip(formatTooltip);
  const tt = (
    <Tooltip
      content={CompactTooltip}
      cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.35)', strokeWidth: 1, strokeDasharray: '4 3' }}
      wrapperStyle={{ outline: 'none', zIndex: 50 }}
      allowEscapeViewBox={{ x: true, y: true }}
    />
  );

  const pieTooltip = (
    <Tooltip
      content={CompactTooltip}
      wrapperStyle={{ outline: 'none', zIndex: 50 }}
      allowEscapeViewBox={{ x: true, y: true }}
    />
  );

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">{emptyMessage}</p>;
  }

  const gidActual = `insActual-${uid}`;
  const gidTarget = `insTarget-${uid}`;

  switch (chartType) {
    case 'grouped-bar':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: marginTop, right: 12, left: 4, bottom: marginBottom }}
            barCategoryGap="18%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            {commonAxis.x}
            {commonAxis.y}
            {tt}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="actual"
              name={barLabel}
              fill={barColor}
              radius={[5, 5, 0, 0]}
              maxBarSize={44}
              minPointSize={4}
            >
              {showBarLabels ? (
                <LabelList
                  dataKey="actual"
                  position="top"
                  formatter={shortBarLabel}
                  style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
              ) : null}
            </Bar>
            <Bar
              dataKey="target"
              name={lineLabel}
              fill={comparisonColorCss}
              radius={[5, 5, 0, 0]}
              maxBarSize={44}
              minPointSize={4}
            >
              {showBarLabels ? (
                <LabelList
                  dataKey="target"
                  position="top"
                  formatter={shortBarLabel}
                  style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
              ) : null}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    case 'area-dual':
      {
      const areaData =
        chartData.length === 1
          ? [
              { ...chartData[0], name: '' },
              { ...chartData[0], name: chartData[0].name },
            ]
          : chartData;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={areaData} margin={{ top: 8, right: 12, left: 4, bottom: marginBottom }}>
            <defs>
              <linearGradient id={gidActual} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={barColor} stopOpacity={0.75} />
                <stop offset="100%" stopColor={barColor} stopOpacity={0.22} />
              </linearGradient>
              <linearGradient id={gidTarget} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={comparisonColorCss} stopOpacity={0.65} />
                <stop offset="100%" stopColor={comparisonColorCss} stopOpacity={0.18} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            {commonAxis.x}
            {commonAxis.y}
            {tt}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="actual"
              name={barLabel}
              stackId="total"
              stroke={barColor}
              strokeWidth={1}
              fill={`url(#${gidActual})`}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="target"
              name={lineLabel}
              stackId="total"
              stroke={comparisonColorCss}
              strokeWidth={1}
              fill={`url(#${gidTarget})`}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
      }

    case 'line-dual':
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: marginBottom }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            {commonAxis.x}
            {commonAxis.y}
            {tt}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="actual"
              name={barLabel}
              stroke={barColor}
              strokeWidth={3}
              dot={{ r: 4, fill: barColor }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="target"
              name={lineLabel}
              stroke={comparisonColorCss}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, fill: comparisonColorCss }}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    case 'pie-split': {
      const multi = chartData.length > 1;
      if (!multi) {
        const d0 = chartData[0];
        const a = Math.max(0, d0.actual);
        const t = Math.max(0, d0.target);
        if (a <= PIE_EPS && t <= PIE_EPS) {
          return <p className="text-sm text-muted-foreground py-10 text-center">{emptyMessage}</p>;
        }
        // Pie hides tiny slices when actual ≪ target (e.g. 10 vs 300 kWh); grouped bars show both clearly.
        const barRow = [{ name: d0.name || 'Period', actual: a, target: t }];
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barRow}
              margin={{ top: marginTop, right: 12, left: 4, bottom: marginBottom }}
              barCategoryGap="24%"
              barGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              {commonAxis.x}
              {commonAxis.y}
              {tt}
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="actual"
                name={barLabel}
                fill={barColor}
                radius={[5, 5, 0, 0]}
                maxBarSize={56}
                minPointSize={4}
              >
                {showBarLabels ? (
                  <LabelList
                    dataKey="actual"
                    position="top"
                    formatter={shortBarLabel}
                    style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                ) : null}
              </Bar>
              <Bar
                dataKey="target"
                name={lineLabel}
                fill={comparisonColorCss}
                radius={[5, 5, 0, 0]}
                maxBarSize={56}
                minPointSize={4}
              >
                {showBarLabels ? (
                  <LabelList
                    dataKey="target"
                    position="top"
                    formatter={shortBarLabel}
                    style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                ) : null}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      }

      const totalA = chartData.reduce((s, d) => s + Math.max(0, d.actual), 0);
      const totalT = chartData.reduce((s, d) => s + Math.max(0, d.target), 0);
      const palette = hslPaletteFromTriplet(accentHslTriplet, chartData.length);

      const halfPie = (key: 'actual' | 'target', caption: string, total: number) => (
        <div className="flex h-full min-h-0 w-1/2 flex-col">
          <div className="min-h-[160px] flex-1 w-full">
            {total > PIE_EPS ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    data={chartData.map((d) => ({ name: d.name, value: Math.max(0, d[key]) }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="36%"
                    outerRadius="68%"
                    paddingAngle={1}
                    stroke="hsl(var(--background))"
                    strokeWidth={1}
                    minAngle={2}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={`${uid}-${key}-${i}`} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  {pieTooltip}
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                No {caption.toLowerCase()}
              </div>
            )}
          </div>
          <p className="shrink-0 pt-1 text-center text-[11px] font-medium text-muted-foreground">{caption}</p>
        </div>
      );

      if (totalA <= PIE_EPS && totalT <= PIE_EPS) {
        return <p className="text-sm text-muted-foreground py-10 text-center">{emptyMessage}</p>;
      }

      return (
        <div className="flex h-full w-full items-stretch gap-2" style={{ minHeight: chartHeight - 16 }}>
          {halfPie('actual', barLabel, totalA)}
          {halfPie('target', lineLabel, totalT)}
        </div>
      );
    }

    case 'bar-line':
    default:
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: marginTop, right: 12, left: 4, bottom: marginBottom }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            {commonAxis.x}
            {commonAxis.y}
            {tt}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="actual"
              name={barLabel}
              fill={barColor}
              radius={[6, 6, 0, 0]}
              maxBarSize={52}
              minPointSize={4}
            >
              {showBarLabels ? (
                <LabelList
                  dataKey="actual"
                  position="top"
                  formatter={shortBarLabel}
                  style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
              ) : null}
            </Bar>
            <Line
              type="monotone"
              dataKey="target"
              name={lineLabel}
              stroke={comparisonColorCss}
              strokeWidth={2}
              dot={{ r: 3, fill: comparisonColorCss }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      );
  }
}

export function DashboardInsightRow({
  subtitle,
  accentHsl,
  comparisonHsl,
  donutCenterTitle,
  donutCenterValue,
  donutFillPct,
  metrics,
  chartData,
  barLabel,
  lineLabel,
  formatTooltip,
  tableRows,
  emptyMessage = 'No data for this period.',
  chartHeight = 170,
  chartType = 'bar-line',
  rowVariant = 'standard',
  tableZebra = false,
  tableHeaderTone = 'accent',
  statusDisplay = 'dot',
  leftKpiLayout = 'donut',
}: DashboardInsightRowProps) {
  const uid = useId().replace(/:/g, '');
  const barColor = `hsl(${accentHsl})`;
  const comparisonColorCss = `hsl(${hslTriplet(comparisonHsl)})`;

  const rowShell = cn(
    'rounded-lg border overflow-hidden',
    rowVariant === 'standard' && 'border-border bg-muted/20',
    rowVariant === 'elevated' && 'border-border/80 bg-card shadow-sm',
    rowVariant === 'soft' && 'border-transparent bg-gradient-to-br from-muted/40 to-card ring-1 ring-border/60',
    rowVariant === 'card' &&
    'rounded-xl border border-border bg-card shadow-[0_1px_3px_hsl(220_15%_10%/0.08)] dark:shadow-[0_1px_3px_hsl(0_0%_0%/0.4)]'
  );

  const subtitleBar = cn(
    'border-b border-border px-2.5 py-2 text-xs font-medium text-foreground',
    rowVariant === 'soft' && 'bg-muted/50',
    rowVariant === 'card' && 'bg-muted/50'
  );

  return (
    <div className={rowShell}>
      <div
        className={subtitleBar}
        style={{
          backgroundColor:
            rowVariant === 'soft' || rowVariant === 'card'
              ? undefined
              : `hsl(${accentHsl} / 0.1)`,
        }}
      >
        {subtitle}
      </div>

      <div className="grid grid-cols-1 gap-2.5 p-2.5 lg:grid-cols-12 lg:gap-3">
        <div className="lg:col-span-7 min-h-[180px]">
          <div
            style={{ height: chartHeight }}
            className={cn(
              'w-full rounded-md p-1.5',
              rowVariant === 'elevated' && 'bg-muted/30',
              rowVariant === 'card' && 'border border-border/70 bg-card',
              rowVariant !== 'elevated' && rowVariant !== 'card' && 'bg-background/80'
            )}
          >
            <InsightChart
              chartType={chartType}
              chartData={chartData}
              chartHeight={chartHeight}
              barColor={barColor}
              comparisonColorCss={comparisonColorCss}
              barLabel={barLabel}
              lineLabel={lineLabel}
              formatTooltip={formatTooltip}
              emptyMessage={emptyMessage}
              uid={uid}
              accentHslTriplet={accentHsl}
            />
          </div>
        </div>

        <div
          className={cn(
            'lg:col-span-5 overflow-x-auto rounded-lg border',
            rowVariant === 'card' ? 'border-border/80 bg-card' : 'border-border bg-background/80'
          )}
        >
          <div className="border-b border-border/70 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{donutCenterTitle}</p>
            <div className="mt-0.5 flex items-end justify-between gap-2">
              <p className="text-lg font-semibold tabular-nums">{donutCenterValue}</p>
              {donutFillPct != null && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(donutFillPct)}%</span>
              )}
            </div>
            {donutFillPct != null && (
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, donutFillPct))}%`, backgroundColor: barColor }}
                />
              </div>
            )}
          </div>
          <dl className="space-y-1 border-b border-border/60 px-2 py-1.5 text-[11px]">
            {metrics.map((m) => (
              <div key={m.label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{m.label}</dt>
                <dd className="font-medium tabular-nums text-right">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
