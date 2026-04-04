import React, { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { filterScheduleAPI } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessFilterHub, canApproveFilterSchedule } from "@/lib/auth/role";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ScheduleType = "replacement" | "cleaning" | "integrity";

interface FilterScheduleRow {
  id: string;
  schedule_type: ScheduleType;
  frequency_days?: number | null;
  next_due_date?: string | null;
  is_approved: boolean;
  status?: "active" | "overdue" | "completed" | "rejected";
  assignment_info?: {
    equipment_id: string;
    equipment_number: string;
    equipment_name: string;
    area_category?: string | null;
    tag_info?: string | null;
    /** User who assigned filter to equipment; cannot approve/reject own assignment schedules. */
    assigned_by_id?: string | null;
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

  const canViewSchedules = canAccessFilterHub(user?.role);
  const canApproveSchedules = canApproveFilterSchedule(user?.role);
  const [rows, setRows] = useState<FilterScheduleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveCommentOpen, setApproveCommentOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectCommentOpen, setRejectCommentOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectionComment, setRejectionComment] = useState("");

  const pendingCount = useMemo(
    () => rows.filter((r) => !r.is_approved).length,
    [rows]
  );

  const userIsAssignmentAssigner = (row: FilterScheduleRow) => {
    const aid = row.assignment_info?.assigned_by_id;
    const uid = user?.id != null ? String(user.id) : "";
    return !!(aid && uid && aid === uid);
  };

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
    if (!canViewSchedules) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewSchedules]);

  const doApprove = async (id: string, comment: string) => {
    setWorkingId(id);
    try {
      await filterScheduleAPI.approve(id, comment);
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

  const doReject = async (id: string, comment: string) => {
    setWorkingId(id);
    try {
      await filterScheduleAPI.reject(id, comment);
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

  if (!authLoading && !canViewSchedules) {
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
                      Area Category
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
                        colSpan={7}
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
                        colSpan={7}
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
                          {(() => {
                            const isRejected = row.status === "rejected";
                            const label = isRejected
                              ? "Rejected"
                              : row.is_approved
                                ? "Approved"
                                : "Pending";
                            const badgeClass = isRejected
                              ? "inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                              : row.is_approved
                                ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
                            return (
                              <span className={badgeClass}>
                                {label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2">
                          {row.frequency_days ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {row.assignment_info?.area_category || "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {row.assignment_info?.tag_info || "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {canApproveSchedules ? (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 text-emerald-600"
                                disabled={workingId === row.id || row.is_approved || row.status === "rejected"}
                                onClick={() => {
                                  if (userIsAssignmentAssigner(row)) {
                                    toast({
                                      title: "Cannot approve your own assignment",
                                      description:
                                        "Someone else must approve schedules for equipment you assigned the filter to.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (!row.is_approved && row.status !== "rejected") {
                                    setSelectedScheduleId(row.id);
                                    setApproveConfirmOpen(true);
                                  }
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
                                disabled={workingId === row.id || row.is_approved || row.status === "rejected"}
                                onClick={() => {
                                  if (userIsAssignmentAssigner(row)) {
                                    toast({
                                      title: "Cannot reject your own assignment",
                                      description:
                                        "Someone else must reject schedules for equipment you assigned the filter to.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (!row.is_approved && row.status !== "rejected") {
                                    setSelectedScheduleId(row.id);
                                    setRejectConfirmOpen(true);
                                  }
                                }}
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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

      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this maintenance schedule? This will start tracking due dates and overdue alerts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setApproveConfirmOpen(false);
                setApproveCommentOpen(true);
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={approveCommentOpen}
        onOpenChange={(open) => {
          setApproveCommentOpen(open);
          if (!open) {
            setApprovalComment("");
            setSelectedScheduleId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Approval Comment (Required)</DialogTitle>
            <DialogDescription>
              Please enter a comment for this approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-schedule-approval-comment">
                Comment <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="filter-schedule-approval-comment"
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Enter approval comment..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setApproveCommentOpen(false);
                  setApprovalComment("");
                  setSelectedScheduleId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!selectedScheduleId || workingId === selectedScheduleId}
                onClick={async () => {
                  const comment = approvalComment.trim();
                  if (!comment) {
                    toast({
                      title: "Comment required",
                      description: "Please enter an approval comment.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!selectedScheduleId) return;
                  await doApprove(selectedScheduleId, comment);
                  setApproveCommentOpen(false);
                  setApprovalComment("");
                  setSelectedScheduleId(null);
                }}
              >
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this maintenance schedule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                setRejectConfirmOpen(false);
                setRejectCommentOpen(true);
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rejectCommentOpen}
        onOpenChange={(open) => {
          setRejectCommentOpen(open);
          if (!open) {
            setRejectionComment("");
            setSelectedScheduleId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rejection Comment (Required)</DialogTitle>
            <DialogDescription>
              Please enter a comment for this rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              id="filter-schedule-reject-comment"
              value={rejectionComment}
              onChange={(e) => setRejectionComment(e.target.value)}
              placeholder="Enter rejection comment..."
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejectCommentOpen(false);
                  setRejectionComment("");
                  setSelectedScheduleId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!selectedScheduleId || workingId === selectedScheduleId}
                onClick={async () => {
                  const comment = rejectionComment.trim();
                  if (!comment) {
                    toast({
                      title: "Comment required",
                      description: "Please enter a rejection comment.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!selectedScheduleId) return;
                  await doReject(selectedScheduleId, comment);
                  setRejectCommentOpen(false);
                  setRejectionComment("");
                  setSelectedScheduleId(null);
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FilterScheduleApprovalsPage;

