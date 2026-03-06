import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { ConsumptionChart } from '@/components/dashboard/ConsumptionChart';
import { EquipmentStatus } from '@/components/dashboard/EquipmentStatus';
import { useAuth } from '@/contexts/AuthContext';
import { filterScheduleAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Thermometer,
  Gauge,
  Wind,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const isOperator = user?.role === 'operator';
  const isCustomer = user?.role === 'customer' || user?.role === 'client';

  const [overdueCounts, setOverdueCounts] = useState<{
    replacement?: number;
    cleaning?: number;
    integrity?: number;
  } | null>(null);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);

  const overdueTotal = useMemo(() => {
    if (!overdueCounts) return 0;
    return (
      (overdueCounts.replacement || 0) +
      (overdueCounts.cleaning || 0) +
      (overdueCounts.integrity || 0)
    );
  }, [overdueCounts]);

  useEffect(() => {
    if (isCustomer) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await filterScheduleAPI.overdueSummary();
        if (cancelled) return;
        setOverdueCounts(data);
        const total =
          (data.replacement || 0) + (data.cleaning || 0) + (data.integrity || 0);
        if (total > 0) {
          toast.warning(
            `Filter maintenance overdue: ${total} (Replacement ${data.replacement || 0}, Cleaning ${data.cleaning || 0}, Integrity ${data.integrity || 0})`
          );
          setOverdueDialogOpen(true);
        }
      } catch {
        // Non-blocking: dashboard should still render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCustomer]);

  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name || user?.email || 'User'}`}
      />

      <Dialog open={overdueDialogOpen} onOpenChange={setOverdueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter maintenance overdue</DialogTitle>
            <DialogDescription>
              {overdueCounts
                ? `Replacement: ${overdueCounts.replacement || 0}, Cleaning: ${
                    overdueCounts.cleaning || 0
                  }, Integrity: ${overdueCounts.integrity || 0}`
                : 'Some filter maintenance schedules are overdue.'}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Active Chillers"
            value={3}
            unit="units"
            icon={Thermometer}
            trend={{ value: 12, direction: 'up' }}
            status="normal"
          />
          <MetricCard
            title="Avg Pressure"
            value="6.5"
            unit="bar"
            icon={Gauge}
            trend={{ value: 3, direction: 'down' }}
            status="normal"
          />
          <MetricCard
            title="E Log Book"
            value="0"
            unit="entries"
            icon={Thermometer}
            trend={{ value: 5, direction: 'up' }}
            status="normal"
          />
          <MetricCard
            title="HVAC Validations"
            value={12}
            unit="pending"
            icon={Wind}
            status="normal"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Pending Approvals"
            value={8}
            icon={Clock}
            status="warning"
          />
          <MetricCard
            title="Approved Today"
            value={24}
            icon={CheckCircle2}
            status="normal"
          />
          <MetricCard
            title="Active Alerts"
            value={overdueTotal || 0}
            icon={AlertTriangle}
            status={overdueTotal > 0 ? 'critical' : 'normal'}
          />
          <MetricCard
            title="Compliance Score"
            value="98%"
            icon={ClipboardCheck}
            status="normal"
          />
        </div>

        {/* Charts & Activity */}
        <div className="grid lg:grid-cols-2 gap-6">
          <ConsumptionChart />
          <RecentActivity />
        </div>

        {/* Equipment Status */}
        {!isCustomer && (
          <div className="grid lg:grid-cols-1 gap-6">
            <EquipmentStatus />
          </div>
        )}

        {/* Quick Actions for Operator */}
        {isOperator && (
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'New E Log Book', path: '/e-log-book', icon: Thermometer },
                { label: 'HVAC Validation', path: '/hvac-validation', icon: Wind },
                { label: 'View Reports', path: '/reports', icon: ClipboardCheck },
              ].map((action) => (
                <a
                  key={action.label}
                  href={action.path}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-muted transition-colors group"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <action.icon className="w-6 h-6 text-accent" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
