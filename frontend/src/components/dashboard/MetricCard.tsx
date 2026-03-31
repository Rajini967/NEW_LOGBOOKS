import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  status?: 'normal' | 'warning' | 'critical';
  className?: string;
  sparklineData?: Array<{ value: number }>;
}

export function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'normal',
  className,
  sparklineData,
}: MetricCardProps) {
  const statusColors = {
    normal: 'from-accent to-accent/70',
    warning: 'from-warning to-warning/70',
    critical: 'from-danger to-danger/70',
  };

  return (
    <div className={cn('metric-card group min-h-[96px]', className)}>
      <div
        className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--${status === 'normal' ? 'accent' : status === 'warning' ? 'warning' : 'danger'})), hsl(var(--${status === 'normal' ? 'accent' : status === 'warning' ? 'warning' : 'danger'}) / 0.7))`,
        }}
      />
      
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="data-label">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="reading-display text-2xl">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        </div>
        
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
          status === 'normal' && 'bg-accent/10 text-accent',
          status === 'warning' && 'bg-warning/10 text-warning',
          status === 'critical' && 'bg-danger/10 text-danger'
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {trend && (
        <div className="flex items-center gap-1 mt-3">
          {trend.direction === 'up' ? (
            <TrendingUp className="w-4 h-4 text-success" />
          ) : (
            <TrendingDown className="w-4 h-4 text-danger" />
          )}
          <span
            className={cn(
              'text-xs font-medium',
              trend.direction === 'up' ? 'text-success' : 'text-danger'
            )}
          >
            {trend.value}%
          </span>
          <span className="text-xs text-muted-foreground">vs last period</span>
        </div>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-2 h-7">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--accent))"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
