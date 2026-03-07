import React, { useState, useEffect, useMemo } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
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

const CHILLER_PARAMS: { key: string; label: string }[] = [
  { key: 'chiller_supply_temp', label: 'Chiller supply temp (°C)' },
  { key: 'chiller_return_temp', label: 'Chiller return temp (°C)' },
  { key: 'cooling_tower_supply_temp', label: 'CT supply temp (°C)' },
  { key: 'cooling_tower_return_temp', label: 'CT return temp (°C)' },
  { key: 'ct_differential_temp', label: 'CT differential temp (°C)' },
  { key: 'chiller_water_inlet_pressure', label: 'Chiller water inlet pressure' },
  { key: 'evap_entering_water_temp', label: 'Evap entering water temp (°C)' },
  { key: 'evap_leaving_water_temp', label: 'Evap leaving water temp (°C)' },
  { key: 'cond_entering_water_temp', label: 'Cond entering water temp (°C)' },
  { key: 'cond_leaving_water_temp', label: 'Cond leaving water temp (°C)' },
  { key: 'avg_motor_current', label: 'Avg motor current (A)' },
];

const BOILER_PARAMS: { key: string; label: string }[] = [
  { key: 'feed_water_temp', label: 'Feed water temp (°C)' },
  { key: 'oil_temp', label: 'Oil temp (°C)' },
  { key: 'steam_temp', label: 'Steam temp (°C)' },
  { key: 'steam_pressure', label: 'Steam pressure (bar)' },
  { key: 'steam_flow_lph', label: 'Steam flow (LPH)' },
  { key: 'fo_pre_heater_temp', label: 'FO pre heater temp (°C)' },
  { key: 'burner_oil_pressure', label: 'Burner oil pressure' },
  { key: 'burner_heater_temp', label: 'Burner heater temp (°C)' },
  { key: 'boiler_steam_pressure', label: 'Boiler steam pressure' },
  { key: 'stack_temperature', label: 'Stack temp (°C)' },
  { key: 'steam_pressure_after_prv', label: 'Steam pressure after PRV' },
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
  const [logType, setLogType] = useState<LogType>('chiller');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const params = PARAMS_BY_TYPE[logType];

  const fetchLogs = async () => {
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
        list = await compressorLogAPI.list();
      }

      const sorted = (list || []).slice().sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return ta - tb;
      });
      if (logType === 'compressor' && (dateFrom || dateTo || equipmentId)) {
        const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : 0;
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER;
        const filtered = sorted.filter((log) => {
          const t = new Date(log.timestamp).getTime();
          if (t < from || t > to) return false;
          if (equipmentId && log.equipment_id !== equipmentId) return false;
          return true;
        });
        setRawLogs(filtered);
      } else {
        setRawLogs(sorted);
      }
    } catch (err) {
      console.error('Failed to fetch trend data', err);
      toast.error('Failed to load trend data');
      setRawLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [logType, dateFrom, dateTo, equipmentId]);

  const equipmentOptions = useMemo(() => {
    const ids = Array.from(new Set(rawLogs.map((l) => l.equipment_id).filter(Boolean))) as string[];
    return ids.sort();
  }, [rawLogs]);

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

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-6">Trends</h1>

        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <h2 className="text-sm font-medium text-foreground mb-3">Filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Log type</Label>
              <Select value={logType} onValueChange={(v) => setLogType(v as LogType)}>
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
              <Select value={equipmentId || '_all'} onValueChange={(v) => setEquipmentId(v === '_all' ? '' : v)}>
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
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => fetchLogs()} disabled={loading}>
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

        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">Trend chart</h2>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No data for selected filters.</p>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
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
        </div>
      </main>
    </div>
  );
}
