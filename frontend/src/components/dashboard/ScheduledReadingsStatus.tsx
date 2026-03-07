import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Thermometer, Gauge, Filter, FlaskConical, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { MissedByLogType } from '@/hooks/useMissedReadingsByType';

const LOG_TYPES: {
  key: keyof MissedByLogType;
  label: string;
  path: string;
  icon: React.ElementType;
}[] = [
  { key: 'chiller', label: 'Chiller', path: '/e-log-book/chiller', icon: Thermometer },
  { key: 'boiler', label: 'Boiler', path: '/e-log-book/boiler', icon: Gauge },
  { key: 'filter', label: 'Filter', path: '/e-log-book/filter/entry', icon: Filter },
  { key: 'chemical', label: 'Chemical', path: '/e-log-book/chemical/entry', icon: FlaskConical },
];

interface ScheduledReadingsStatusProps {
  missedByLogType: MissedByLogType;
  loading?: boolean;
}

/**
 * Shows scheduled reading status per log type with red indication when missed.
 */
export function ScheduledReadingsStatus({ missedByLogType, loading }: ScheduledReadingsStatusProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Scheduled readings status</h3>
      {loading ? (
        <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          {LOG_TYPES.map(({ key, label, path, icon: Icon }) => {
            const missed = missedByLogType[key];
            return (
              <Link
                key={key}
                to={path}
                className={cn(
                  'flex items-center justify-between p-4 rounded-lg border transition-all hover:opacity-90',
                  missed ? 'border-danger/50 bg-danger/5' : 'border-border bg-muted/30'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      missed ? 'bg-danger/10 text-danger' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">Log book</p>
                  </div>
                </div>
                {missed ? (
                  <Badge variant="danger">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Missed
                  </Badge>
                ) : (
                  <Badge variant="success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    On time
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
