import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Thermometer, Gauge, Activity, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashboardSummaryAPI } from '@/lib/api';

interface Equipment {
  id: string;
  name: string;
  equipment_number?: string;
  type: 'chiller' | 'boiler' | 'compressor';
  status: 'running' | 'idle' | 'alert';
  t1: number | null;
  t2: number | null;
  p1: number | null;
  p2: number | null;
}

const statusConfig = {
  running: { variant: 'success' as const, label: 'Running' },
  idle: { variant: 'secondary' as const, label: 'Idle' },
  alert: { variant: 'danger' as const, label: 'Alert' },
};

function formatReading(value: number | null, unit: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value}${unit}`;
}

export function EquipmentStatus() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardSummaryAPI
      .getEquipmentStatus()
      .then((raw) => {
        if (cancelled) return;
        setEquipment(
          raw.map((item) => ({
            id: item.id,
            name: item.name,
            equipment_number: item.equipment_number,
            type: item.type,
            status: item.status,
            t1: item.t1,
            t2: item.t2,
            p1: item.p1,
            p2: item.p2,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load equipment status');
          setEquipment([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Equipment Status</h3>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive text-sm">{error}</div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No equipment data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {equipment.map((eq) => (
            <div
              key={eq.id}
              className={cn(
                'p-4 rounded-lg border transition-all',
                eq.status === 'alert' ? 'border-danger/50 bg-danger/5' : 'border-border bg-muted/30'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{eq.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {eq.equipment_number ?? eq.id}
                  </p>
                </div>
                <Badge variant={statusConfig[eq.status].variant}>
                  <Activity className={cn(
                    'w-3 h-3 mr-1',
                    eq.status === 'running' && 'animate-pulse'
                  )} />
                  {statusConfig[eq.status].label}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">T1:</span>
                  <span className="text-xs font-mono font-medium">{formatReading(eq.t1, '°C')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">T2:</span>
                  <span className="text-xs font-mono font-medium">{formatReading(eq.t2, '°C')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">P1:</span>
                  <span className="text-xs font-mono font-medium">{formatReading(eq.p1, ' bar')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">P2:</span>
                  <span className="text-xs font-mono font-medium">{formatReading(eq.p2, ' bar')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
