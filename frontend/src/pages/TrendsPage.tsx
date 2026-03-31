import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from '@/components/layout/Header';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { Printer } from 'lucide-react';
import { chillerLogAPI, boilerLogAPI, compressorLogAPI } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type LogType = 'chiller' | 'boiler' | 'compressor';

const TRENDS_FILTERS_STORAGE_KEY = 'logbook.trends.filters.v1';

const CHILLER_PARAMS: { key: string; label: string }[] = [
  { key: 'evap_water_inlet_pressure', label: 'Evap water inlet pressure (kg/cm²)' },
  { key: 'evap_water_outlet_pressure', label: 'Evap water outlet pressure (kg/cm²)' },
  { key: 'evap_entering_water_temp', label: 'Evap entering water temp (°C)' },
  { key: 'evap_leaving_water_temp', label: 'Evap leaving water temp (°C)' },
  { key: 'evap_approach_temp', label: 'Evap approach temp (°C)' },
  { key: 'cond_water_inlet_pressure', label: 'Cond water inlet pressure (kg/cm²)' },
  { key: 'cond_water_outlet_pressure', label: 'Cond water outlet pressure (kg/cm²)' },
  { key: 'cond_entering_water_temp', label: 'Cond entering water temp (°C)' },
  { key: 'cond_leaving_water_temp', label: 'Cond leaving water temp (°C)' },
  { key: 'cond_approach_temp', label: 'Cond approach temp (°C)' },
  { key: 'chiller_control_signal', label: 'Chiller control signal (%)' },
  { key: 'avg_motor_current', label: 'Avg motor current (A)' },
  { key: 'compressor_running_time_min', label: 'Compressor running time (min)' },
  { key: 'starter_energy_kwh', label: 'Starter energy (kWh)' },
  { key: 'cooling_tower_blowdown_time_min', label: 'CT blowdown time (min)' },
  { key: 'daily_water_consumption_ct1_liters', label: 'Daily water consumption CT1 (L)' },
  { key: 'daily_water_consumption_ct2_liters', label: 'Daily water consumption CT2 (L)' },
  { key: 'daily_water_consumption_ct3_liters', label: 'Daily water consumption CT3 (L)' },
  { key: 'cooling_tower_chemical_qty_per_day', label: 'CT chemical qty/day' },
  { key: 'chilled_water_pump_chemical_qty_kg', label: 'Chilled pump chemical qty (kg)' },
  { key: 'cooling_tower_fan_chemical_qty_kg', label: 'CT fan chemical qty (kg)' },
];

const BOILER_PARAMS: { key: string; label: string }[] = [
  { key: 'feed_water_temp', label: 'Feed water temp (°C)' },
  { key: 'oil_temp', label: 'Oil temp (°C)' },
  { key: 'steam_temp', label: 'Steam temp (°C)' },
  { key: 'steam_pressure', label: 'Steam pressure (bar)' },
  { key: 'steam_flow_lph', label: 'Steam flow (LPH)' },
  { key: 'fo_hsd_ng_day_tank_level', label: 'FO/HSD/NG day tank level (L)' },
  { key: 'feed_water_tank_level', label: 'Feed water tank level (KL)' },
  { key: 'fo_pre_heater_temp', label: 'FO pre heater temp (°C)' },
  { key: 'burner_oil_pressure', label: 'Burner oil pressure (kg/cm²)' },
  { key: 'burner_heater_temp', label: 'Burner heater temp (°C)' },
  { key: 'boiler_steam_pressure', label: 'Boiler steam pressure (bar)' },
  { key: 'stack_temperature', label: 'Stack temp (°C)' },
  { key: 'steam_pressure_after_prv', label: 'Steam pressure after PRV (bar)' },
  { key: 'feed_water_hardness_ppm', label: 'Feed water hardness (ppm)' },
  { key: 'feed_water_tds_ppm', label: 'Feed water TDS (ppm)' },
  { key: 'fo_hsd_ng_consumption', label: 'FO/HSD/NG consumption' },
  { key: 'diesel_stock_liters', label: 'Diesel stock (L)' },
  { key: 'diesel_cost_rupees', label: 'Diesel cost (Rs)' },
  { key: 'furnace_oil_stock_liters', label: 'Furnace oil stock (L)' },
  { key: 'furnace_oil_cost_rupees', label: 'Furnace oil cost (Rs)' },
  { key: 'brigade_stock_kg', label: 'Brigade stock (kg)' },
  { key: 'brigade_cost_rupees', label: 'Brigade cost (Rs)' },
  { key: 'daily_power_consumption_kwh', label: 'Daily power consumption (kWh)' },
  { key: 'daily_water_consumption_liters', label: 'Daily water consumption (L)' },
  { key: 'daily_chemical_consumption_kg', label: 'Daily chemical consumption (kg)' },
  { key: 'daily_diesel_consumption_liters', label: 'Daily diesel consumption (L)' },
  { key: 'daily_furnace_oil_consumption_liters', label: 'Daily furnace oil consumption (L)' },
  { key: 'daily_brigade_consumption_kg', label: 'Daily brigade consumption (kg)' },
  { key: 'steam_consumption_kg_hr', label: 'Steam consumption (kg/hr)' },
];

const COMPRESSOR_PARAMS: { key: string; label: string }[] = [
  { key: 'compressor_supply_temp', label: 'Supply temp (°C)' },
  { key: 'compressor_return_temp', label: 'Return temp (°C)' },
  { key: 'compressor_pressure', label: 'Pressure (bar)' },
  { key: 'compressor_flow', label: 'Flow (L/min)' },
];

const PARAMS_BY_TYPE: Record<LogType, { key: string; label: string }[]> = {
  chiller: CHILLER_PARAMS,
  boiler: BOILER_PARAMS,
  compressor: COMPRESSOR_PARAMS,
};

const COLORS = [
  'hsl(220, 70%, 50%)',
  'hsl(160, 60%, 40%)',
  'hsl(38, 92%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 65%, 50%)',
  'hsl(185, 70%, 40%)',
  'hsl(45, 90%, 45%)',
  'hsl(320, 60%, 50%)',
  'hsl(180, 50%, 45%)',
  'hsl(30, 80%, 50%)',
  'hsl(260, 55%, 55%)',
];

function computeStats(
  data: Record<string, unknown>[],
  paramKey: string
): { avg: number; min: number; max: number } | null {
  const values = data
    .map((row) => {
      const v = row[paramKey];
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export default function TrendsPage() {
  const { user } = useAuth();
  const fetchSeqRef = useRef(0);

  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, 'yyyy-MM-dd');
  }, []);
  const defaultTo = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const loadSavedFilters = (): {
    logType: LogType;
    equipmentId: string;
    dateFrom: string;
    dateTo: string;
  } | null => {
    try {
      const raw = localStorage.getItem(TRENDS_FILTERS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      const logType = (parsed?.logType as LogType) || 'chiller';
      if (!['chiller', 'boiler', 'compressor'].includes(logType)) return null;
      const equipmentId = typeof parsed?.equipmentId === 'string' ? parsed.equipmentId : '';
      const dateFrom = typeof parsed?.dateFrom === 'string' ? parsed.dateFrom : defaultFrom;
      const dateTo = typeof parsed?.dateTo === 'string' ? parsed.dateTo : defaultTo;
      return { logType, equipmentId, dateFrom, dateTo };
    } catch {
      return null;
    }
  };

  // Applied filters (drive fetch + chart/summary)
  const saved = loadSavedFilters();
  const [logType, setLogType] = useState<LogType>(saved?.logType ?? 'chiller');
  const [equipmentId, setEquipmentId] = useState<string>(saved?.equipmentId ?? '');
  const [dateFrom, setDateFrom] = useState<string>(saved?.dateFrom ?? defaultFrom);
  const [dateTo, setDateTo] = useState<string>(saved?.dateTo ?? defaultTo);

  // Draft filters (bound to inputs; only applied when clicking Apply)
  const [draftLogType, setDraftLogType] = useState<LogType>(saved?.logType ?? 'chiller');
  const [draftEquipmentId, setDraftEquipmentId] = useState<string>(saved?.equipmentId ?? '');
  const [draftDateFrom, setDraftDateFrom] = useState<string>(saved?.dateFrom ?? defaultFrom);
  const [draftDateTo, setDraftDateTo] = useState<string>(saved?.dateTo ?? defaultTo);

  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [chartTab, setChartTab] = useState<'all' | 'individual'>('all');
  const [selectedParamKey, setSelectedParamKey] = useState<string>('');
  const [yAxisMin, setYAxisMin] = useState<string>('');
  const [yAxisMax, setYAxisMax] = useState<string>('');

  const params = PARAMS_BY_TYPE[logType];
  const selectedParam = params.find((p) => p.key === selectedParamKey) ?? params[0];
  useEffect(() => {
    const keys = params.map((p) => p.key);
    if (!keys.includes(selectedParamKey)) setSelectedParamKey(keys[0] ?? '');
  }, [logType, params, selectedParamKey]);

  const fetchLogs = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const paramsObj: { date_from?: string; date_to?: string; equipment_id?: string } = {};
      if (dateFrom) paramsObj.date_from = `${dateFrom}T00:00:00`;
      if (dateTo) paramsObj.date_to = `${dateTo}T23:59:59`;
      if (equipmentId) paramsObj.equipment_id = equipmentId;

      let list: any[] = [];
      if (logType === 'chiller') {
        list = await chillerLogAPI.list(paramsObj);
      } else if (logType === 'boiler') {
        list = await boilerLogAPI.list(paramsObj);
      } else {
        list = await compressorLogAPI.list(paramsObj);
      }

      const sorted = (list || []).slice().sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return ta - tb;
      });
      if (seq === fetchSeqRef.current) setRawLogs(sorted);
    } catch (err) {
      console.error('Failed to fetch trend data', err);
      toast.error('Failed to load trend data');
      if (seq === fetchSeqRef.current) setRawLogs([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [logType, dateFrom, dateTo, equipmentId]);

  const applyFilters = () => {
    // Normalize equipment selection when switching log types
    const next: { logType: LogType; equipmentId: string; dateFrom: string; dateTo: string } = {
      logType: draftLogType,
      equipmentId: draftEquipmentId,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
    };
    setLogType(next.logType);
    setEquipmentId(next.equipmentId);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    try {
      localStorage.setItem(TRENDS_FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  const equipmentOptions = useMemo(() => {
    // Avoid showing stale equipment options when draft log type differs from applied log type
    if (draftLogType !== logType) return [];
    const ids = Array.from(new Set(rawLogs.map((l) => l.equipment_id).filter(Boolean))) as string[];
    return ids.sort();
  }, [rawLogs, draftLogType, logType]);

  const chartData = useMemo(() => {
    return rawLogs.map((log) => {
      const time = format(new Date(log.timestamp), 'MM/dd HH:mm');
      const point: Record<string, string | number> = { time, timestamp: log.timestamp };
      params.forEach(({ key }) => {
        const v = log[key];
        if (v != null && Number.isFinite(Number(v))) {
          point[key] = Number(v);
        }
      });
      return point;
    });
  }, [rawLogs, params]);

  const summaryStats = useMemo(() => {
    return params.map(({ key, label }) => {
      const stats = computeStats(rawLogs, key);
      return { key, label, stats };
    }).filter((s) => s.stats !== null);
  }, [rawLogs, params]);

  const yDomain = useMemo(() => {
    const min = yAxisMin.trim() === '' ? null : Number(yAxisMin);
    const max = yAxisMax.trim() === '' ? null : Number(yAxisMax);
    if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) return [min, max] as [number, number];
    return undefined;
  }, [yAxisMin, yAxisMax]);

  const handlePrint = () => {
    try {
      window.print();
      toast.success('Opening print dialog...');
    } catch (e) {
      console.error('Print failed', e);
      toast.error('Print failed');
    }
  };

  const formatTooltipLabel = (label: string) => {
    const point = chartData.find((d) => d.time === label);
    const ts = point?.timestamp;
    if (ts) return format(new Date(ts), 'dd-MMM-yyyy HH:mm');
    return label;
  };

  return (
    <div className="min-h-screen bg-background trends-page">
      <Header user={user} />
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-6">Trends</h1>

        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <h2 className="text-sm font-medium text-foreground mb-3">Filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Log type</Label>
              <Select
                value={draftLogType}
                onValueChange={(v) => {
                  const next = v as LogType;
                  setDraftLogType(next);
                  setDraftEquipmentId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chiller">Chiller</SelectItem>
                  <SelectItem value="boiler">Boiler</SelectItem>
                  <SelectItem value="compressor">Compressor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Equipment (optional)</Label>
              <Select
                value={draftEquipmentId || '_all'}
                onValueChange={(v) => setDraftEquipmentId(v === '_all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All</SelectItem>
                  {equipmentOptions.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From date</Label>
              <Input
                type="date"
                value={draftDateFrom}
                onChange={(e) => setDraftDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To date</Label>
              <Input
                type="date"
                value={draftDateTo}
                onChange={(e) => setDraftDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={applyFilters} disabled={loading}>
                {loading ? 'Loading...' : 'Apply'}
              </Button>
            </div>
          </div>
        </div>

        {summaryStats.length > 0 && (
          <div className="bg-card rounded-lg border border-border p-4 mb-6">
            <h2 className="text-sm font-medium text-foreground mb-3">Summary – AVG / Min / Max</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-foreground">Parameter</th>
                    <th className="text-right py-2 px-3 font-medium text-foreground">AVG</th>
                    <th className="text-right py-2 px-3 font-medium text-foreground">Min</th>
                    <th className="text-right py-2 px-3 font-medium text-foreground">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryStats.map(({ label, stats }) =>
                    stats ? (
                      <tr key={label} className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">{label}</td>
                        <td className="text-right py-2 px-3 text-muted-foreground">
                          {stats.avg.toFixed(2)}
                        </td>
                        <td className="text-right py-2 px-3 text-muted-foreground">
                          {stats.min.toFixed(2)}
                        </td>
                        <td className="text-right py-2 px-3 text-muted-foreground">
                          {stats.max.toFixed(2)}
                        </td>
                      </tr>
                    ) : null
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg border border-border p-4 trends-print-content">
          <div className="hidden print:block text-sm font-medium text-foreground mb-2">
            Trends – {logType} – {dateFrom} to {dateTo}
          </div>
          <h2 className="hidden print:block text-sm font-medium text-foreground mb-2">Trend chart</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 trends-no-print">
            <h2 className="text-sm font-medium text-foreground">Trend chart</h2>
            <div className="flex items-center gap-2">
              <Label htmlFor="y-min" className="text-xs text-muted-foreground whitespace-nowrap">Y-axis min</Label>
              <Input
                id="y-min"
                type="number"
                placeholder="Auto"
                className="w-20 h-8 text-sm"
                value={yAxisMin}
                onChange={(e) => setYAxisMin(e.target.value)}
              />
              <Label htmlFor="y-max" className="text-xs text-muted-foreground whitespace-nowrap">Y-axis max</Label>
              <Input
                id="y-max"
                type="number"
                placeholder="Auto"
                className="w-20 h-8 text-sm"
                value={yAxisMax}
                onChange={(e) => setYAxisMax(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
          <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as 'all' | 'individual')}>
            <TabsList className="mb-3 trends-no-print">
              <TabsTrigger value="all">All Parameters</TabsTrigger>
              <TabsTrigger value="individual">Individual Parameter</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-0">
              {chartData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No data for selected filters.</p>
              ) : (
                <div className="h-[400px] trends-chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        label={{ value: 'Date & time', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        domain={yDomain}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        labelFormatter={formatTooltipLabel}
                      />
                      <Legend />
                      {params.map(({ key, label }, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={label}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>
            <TabsContent value="individual" className="mt-0">
              <div className="flex items-center gap-2 mb-3 trends-no-print">
                <Label className="text-sm text-muted-foreground">Parameter</Label>
                <Select
                  value={selectedParamKey || params[0]?.key}
                  onValueChange={setSelectedParamKey}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select parameter" />
                  </SelectTrigger>
                  <SelectContent>
                    {params.map(({ key, label }) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {chartData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No data for selected filters.</p>
              ) : selectedParam ? (
                <div className="h-[400px] trends-chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        label={{ value: 'Date & time', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        domain={yDomain}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        labelFormatter={formatTooltipLabel}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey={selectedParam.key}
                        name={selectedParam.label}
                        stroke={COLORS[0]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
