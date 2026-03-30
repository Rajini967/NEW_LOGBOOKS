import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ChillerDashboardSection } from '@/components/dashboard/ChillerDashboardSection';
import { BoilerDashboardSection } from '@/components/dashboard/BoilerDashboardSection';
import { ChemicalDashboardSection } from '@/components/dashboard/ChemicalDashboardSection';
import { FiltersDashboardSection } from '@/components/dashboard/FiltersDashboardSection';
import { DashboardSectionShell } from '@/components/dashboard/DashboardSectionShell';
import { EquipmentStatus } from '@/components/dashboard/EquipmentStatus';
import { Separator } from '@/components/ui/separator';
import { ScheduledReadingsStatus } from '@/components/dashboard/ScheduledReadingsStatus';
import { useMissedReadingsByType } from '@/hooks/useMissedReadingsByType';
import { useAuth } from '@/contexts/AuthContext';
import { filterScheduleAPI, dashboardSummaryAPI } from '@/lib/api';
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
  const { missedByLogType, loading: missedReadingsLoading } = useMissedReadingsByType();

  const isOperator = user?.role === 'operator';
  const isManagerRole = user?.role === 'manager';

  const [overdueCounts, setOverdueCounts] = useState<{
    replacement?: number;
    cleaning?: number;
    integrity?: number;
  } | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<{
    active_chillers_count: number;
    avg_pressure_bar?: number | null;
    pending_approvals_count: number;
    approved_today_count: number;
    total_log_entries: number;
    hvac_validations_pending_count?: number;
    active_alerts: number;
    compliance_score: number | null;
  } | null>(null);

  const overdueTotal = useMemo(() => {
    if (!overdueCounts) return 0;
    return (
      (overdueCounts.replacement || 0) +
      (overdueCounts.cleaning || 0) +
      (overdueCounts.integrity || 0)
    );
  }, [overdueCounts]);

  useEffect(() => {
    if (isManagerRole) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await filterScheduleAPI.overdueSummary();
        if (cancelled) return;
        setOverdueCounts(data);
      } catch {
        // Non-blocking: dashboard should still render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isManagerRole]);

  useEffect(() => {
    if (isManagerRole) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await dashboardSummaryAPI.getSummary();
        if (cancelled) return;
        setDashboardSummary(data);
      } catch {
        // Non-blocking: dashboard should still render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isManagerRole]);

  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name || user?.email || 'User'}`}
      />

      <div className="p-4 sm:p-6 space-y-8">
        <DashboardSectionShell title="Operations overview" accentHsl="220,60%,35%">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fleet and readings
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Active Chillers"
              value={dashboardSummary?.active_chillers_count ?? '—'}
              unit="units"
              icon={Thermometer}
              status="normal"
            />
            <MetricCard
              title="Avg Pressure"
              value={
                dashboardSummary?.avg_pressure_bar != null
                  ? dashboardSummary.avg_pressure_bar
                  : '—'
              }
              unit="bar"
              icon={Gauge}
              status="normal"
            />
            <MetricCard
              title="E Log Book"
              value={dashboardSummary?.total_log_entries ?? 0}
              unit="entries"
              icon={Thermometer}
              status="normal"
            />
            <MetricCard
              title="HVAC Validations"
              value={dashboardSummary?.hvac_validations_pending_count ?? '—'}
              unit="pending"
              icon={Wind}
              status="normal"
            />
          </div>
          <Separator className="my-1" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workflow and compliance
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Pending Approvals"
              value={dashboardSummary?.pending_approvals_count ?? 0}
              icon={Clock}
              status="warning"
            />
            <MetricCard
              title="Approved Today"
              value={dashboardSummary?.approved_today_count ?? 0}
              icon={CheckCircle2}
              status="normal"
            />
            <MetricCard
              title="Active Alerts"
              value={dashboardSummary?.active_alerts ?? overdueTotal ?? 0}
              icon={AlertTriangle}
              status={(dashboardSummary?.active_alerts ?? overdueTotal ?? 0) > 0 ? 'critical' : 'normal'}
            />
            <MetricCard
              title="Compliance Score"
              value={dashboardSummary?.compliance_score != null ? `${dashboardSummary.compliance_score}%` : '—'}
              icon={ClipboardCheck}
              status="normal"
            />
          </div>
        </DashboardSectionShell>

        {/* Chiller dashboard */}
        <ChillerDashboardSection />

        {/* Boiler dashboard */}
        <BoilerDashboardSection />

        {/* Chemical dashboard */}
        <ChemicalDashboardSection />

        {/* Filters dashboard */}
        <FiltersDashboardSection />

        {/* Scheduled readings status & Equipment Status */}
        {!isManagerRole && (
          <div className="grid lg:grid-cols-1 gap-6">
            <ScheduledReadingsStatus missedByLogType={missedByLogType} loading={missedReadingsLoading} />
            <EquipmentStatus />
          </div>
        )}

        {/* Quick Actions for Operator */}
        {isOperator && (
          <DashboardSectionShell title="Quick actions" accentHsl="185,70%,40%">
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
          </DashboardSectionShell>
        )}
      </div>
    </div>
  );
}
