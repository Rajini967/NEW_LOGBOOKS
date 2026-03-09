import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Beaker, Wind, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { dashboardSummaryAPI } from '@/lib/api';

interface Activity {
  id: string;
  type: 'utility' | 'chemical' | 'validation';
  action: string;
  operator: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected';
}

const typeIcons = {
  utility: ClipboardList,
  chemical: Beaker,
  validation: Wind,
};

const statusConfig = {
  pending: { icon: Clock, variant: 'pending' as const, label: 'Pending' },
  approved: { icon: CheckCircle2, variant: 'success' as const, label: 'Approved' },
  rejected: { icon: XCircle, variant: 'danger' as const, label: 'Rejected' },
};

export function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardSummaryAPI
      .getRecentActivity(20)
      .then((raw) => {
        if (cancelled) return;
        const mapped: Activity[] = raw.map((item) => ({
          id: item.id,
          type: item.type,
          action: item.action,
          operator: item.operator,
          timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
          status: item.status,
        }));
        setActivities(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load recent activity');
          setActivities([]);
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
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive text-sm">{error}</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => {
          const TypeIcon = typeIcons[activity.type];
          const statusInfo = statusConfig[activity.status];
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <TypeIcon className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {activity.action}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{activity.operator}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {format(activity.timestamp, 'HH:mm')}
                  </span>
                </div>
              </div>
              <Badge variant={statusInfo.variant} className="shrink-0">
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusInfo.label}
              </Badge>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
