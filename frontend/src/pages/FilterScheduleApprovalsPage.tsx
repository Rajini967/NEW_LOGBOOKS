import React, { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { filterScheduleAPI } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type ScheduleType = "replacement" | "cleaning" | "integrity";

interface FilterScheduleRow {
  id: string;
  schedule_type: ScheduleType;
  frequency_days?: number | null;
  next_due_date?: string | null;
  is_approved: boolean;
  assignment_info?: {
    equipment_id: string;
    equipment_number: string;
    equipment_name: string;
    tag_info?: string | null;
  };
  created_at: string;
}

const typeLabel: Record<ScheduleType, string> = {
  replacement: "Replacement",
  cleaning: "Cleaning",
  integrity: "Integrity",
};

const FilterScheduleApprovalsPage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isAdmin = user?.role === "manager" || user?.role === "super_admin";
  const [rows, setRows] = useState<FilterScheduleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => rows.filter((r) => !r.is_approved).length,
    [rows]
  );

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await filterScheduleAPI.list();
      setRows(data as any);
    } catch (error: any) {
      toast({
        title: "Failed to load schedules",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const doApprove = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to approve this maintenance schedule? This will start tracking due dates and overdue alerts."
      )
    ) {
      return;
    }
    setWorkingId(id);
    try {
      await filterScheduleAPI.approve(id);
      toast({ title: "Schedule approved" });
      await load();
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorkingId(null);
    }
  };

  const doReject = async (id: string) => {
    if (!window.confirm("Reject this schedule?")) return;
    setWorkingId(id);
    try {
      await filterScheduleAPI.reject(id);
      toast({ title: "Schedule rejected" });
      await load();
    } catch (error: any) {
      toast({
        title: "Rejection failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorkingId(null);
    }
  };

  if (!authLoading && !isAdmin) {
    return <Navigate to="/e-log-book/filter/entry" replace />;
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Filter Schedule Approvals"
        subtitle={`Approve maintenance schedules to start tracking. Pending: ${pendingCount}`}
      />

      <div className="px-6 pt-2">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/filter/settings")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>

      <main className="p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Equipment
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Frequency (days)
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Tag Info
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading schedules...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No schedules pending approval.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.assignment_info?.equipment_number || "—"} –{" "}
                              {row.assignment_info?.equipment_name || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(row.created_at).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {typeLabel[row.schedule_type]}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              row.is_approved
                                ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            }
                          >
                            {row.is_approved ? "Approved" : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {row.frequency_days ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {row.assignment_info?.tag_info || "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-emerald-600"
                              disabled={workingId === row.id || row.is_approved}
                              onClick={() => {
                                if (!row.is_approved) void doApprove(row.id);
                              }}
                              title="Approve"
                            >
                              {workingId === row.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-rose-600"
                              disabled={workingId === row.id || row.is_approved}
                              onClick={() => {
                                if (!row.is_approved) void doReject(row.id);
                              }}
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FilterScheduleApprovalsPage;

