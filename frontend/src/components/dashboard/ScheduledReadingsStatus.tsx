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
    <div className="rounded-xl border border-border/70 bg-white/80 p-6 shadow-sm backdrop-blur dark:bg-card/90">
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
                  'flex items-center justify-between p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                  missed
                    ? 'border-danger/50 bg-gradient-to-r from-danger/10 to-danger/5'
                    : 'border-border/70 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/20 dark:to-card'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shadow-sm',
                      missed ? 'bg-danger/15 text-danger' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
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
