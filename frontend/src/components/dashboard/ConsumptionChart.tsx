import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { dashboardSummaryAPI } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type ChartPoint = { day: string; chemical: number; steam: number; fuel: number };

const CHEMICAL = 'hsl(185, 70%, 40%)';
const STEAM = 'hsl(220, 60%, 32%)';
const FUEL = 'hsl(38, 88%, 48%)';

export function ConsumptionChart() {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardSummaryAPI
      .getWeeklyConsumption()
      .then((raw) => {
        if (cancelled) return;
        const mapped: ChartPoint[] = raw.map((row) => ({
          day: row.day_label,
          chemical: row.chemical_kg,
          steam: row.steam_kg,
          fuel: row.fuel_liters,
        }));
        setData(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load weekly consumption');
          setData([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tooltipFmt = (value: number, name: string) => {
    if (name === 'Fuel (L)') return [`${Number(value).toFixed(1)} L`, name];
    return [`${Number(value).toFixed(1)} kg`, name];
  };

  return (
    <div className="space-y-4">
      {loading && (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      )}
      {!loading && !error && data.length === 0 && (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          No data for this period.
        </div>
      )}
      {!loading && !error && data.length > 0 && (
        <>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 16, right: 12, left: 4, bottom: 8 }}
                barCategoryGap="14%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={tooltipFmt}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="chemical"
                  name="Chemical (kg)"
                  fill={CHEMICAL}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="steam"
                  name="Steam (kg)"
                  fill={STEAM}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="fuel"
                  name="Fuel (L)"
                  fill={FUEL}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHEMICAL }} />
              <span className="text-xs text-muted-foreground">Chemical (kg)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: STEAM }} />
              <span className="text-xs text-muted-foreground">Steam (kg)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: FUEL }} />
              <span className="text-xs text-muted-foreground">Fuel (L)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
