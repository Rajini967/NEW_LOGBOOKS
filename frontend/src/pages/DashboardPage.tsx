import React from 'react';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ChillerDashboardSection } from '@/components/dashboard/ChillerDashboardSection';
import { BoilerDashboardSection } from '@/components/dashboard/BoilerDashboardSection';
import { ChemicalDashboardSection } from '@/components/dashboard/ChemicalDashboardSection';
import { FiltersDashboardSection } from '@/components/dashboard/FiltersDashboardSection';
import { DashboardSectionShell } from '@/components/dashboard/DashboardSectionShell';
import { EquipmentStatus } from '@/components/dashboard/EquipmentStatus';
import { ScheduledReadingsStatus } from '@/components/dashboard/ScheduledReadingsStatus';
import { useMissedReadingsByType } from '@/hooks/useMissedReadingsByType';
import { useDashboardSummaryQuery } from '@/hooks/useDashboardQueries';
import { useAuth } from '@/contexts/AuthContext';
import {
  Thermometer,
  FlaskConical,
  Filter,
  Zap,
  Droplets,
  Fuel,
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const { missedByLogType, loading: missedReadingsLoading } = useMissedReadingsByType();

  const isOperator = user?.role === 'operator';
  const isManagerRole = user?.role === 'manager';

  const { data: dashboardSummary } = useDashboardSummaryQuery(!isManagerRole);

  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name || user?.email || 'User'}`}
      />

      <div className="p-4 sm:p-6 space-y-8">
        <DashboardSectionShell title="Operations overview" accentHsl="220,60%,35%">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Active Chillers"
              value={dashboardSummary?.active_chillers_count ?? '—'}
              unit="units"
              icon={Thermometer}
              status="normal"
            />
            <MetricCard
              title="Active Boilers"
              value={
                dashboardSummary?.active_boilers_count != null
                  ? dashboardSummary.active_boilers_count
                  : '—'
              }
              unit="units"
              icon={Zap}
              status="normal"
            />
            <MetricCard
              title="Active Chemicals"
              value={dashboardSummary?.active_chemicals_count ?? '—'}
              unit="units"
              icon={FlaskConical}
              status="normal"
            />
            <MetricCard
              title="Active Filters"
              value={dashboardSummary?.active_filters_count ?? '—'}
              unit="units"
              icon={Filter}
              status="normal"
            />
            <MetricCard
              title="Power"
              value={dashboardSummary?.power_today_kwh ?? 0}
              unit="kWh"
              icon={Zap}
              status="normal"
            />
            <MetricCard
              title="Water"
              value={dashboardSummary?.water_today_liters ?? 0}
              unit="L"
              icon={Droplets}
              status="normal"
            />
            <MetricCard
              title="Fuel"
              value={dashboardSummary?.fuel_today_liters ?? 0}
              unit="L"
              icon={Fuel}
              status="normal"
            />
            <MetricCard
              title="Diesel"
              value={dashboardSummary?.diesel_today_liters ?? 0}
              unit="L"
              icon={Fuel}
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
