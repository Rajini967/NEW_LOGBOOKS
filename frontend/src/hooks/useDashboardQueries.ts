import { useQuery } from "@tanstack/react-query";
import { dashboardSummaryAPI, filterScheduleAPI } from "@/lib/api";

type OverdueSummary = {
  replacement?: number;
  cleaning?: number;
  integrity?: number;
};

type DashboardSummary = {
  active_chillers_count: number;
  avg_pressure_bar?: number | null;
  pending_approvals_count: number;
  approved_today_count: number;
  total_log_entries: number;
  hvac_validations_pending_count?: number;
  active_alerts: number;
  compliance_score: number | null;
};

export function useOverdueSummaryQuery(enabled: boolean) {
  return useQuery<OverdueSummary>({
    queryKey: ["dashboard", "overdue-summary"],
    queryFn: filterScheduleAPI.overdueSummary,
    enabled,
    staleTime: 60_000,
  });
}

export function useDashboardSummaryQuery(enabled: boolean) {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardSummaryAPI.getSummary,
    enabled,
    staleTime: 30_000,
  });
}
