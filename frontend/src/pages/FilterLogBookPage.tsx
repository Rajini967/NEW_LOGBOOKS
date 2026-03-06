import React, { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  equipmentAPI,
  filterAssignmentAPI,
  filterCategoryAPI,
  filterLogAPI,
  filterScheduleAPI,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Save, Filter, X, Plus, Trash2, CheckCircle, XCircle, Edit, History, ArrowLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

type FilterCategory = string;

interface FilterCategoryOption {
  value: string;
  label: string;
}

interface EquipmentOption {
  id: string;
  equipment_number: string;
  name: string;
}

interface FilterAssignmentRow {
  id: string;
  filter: string;
  filter_id: string;
  filter_micron_size?: string;
  filter_size_l?: number | null;
  filter_size_w?: number | null;
  filter_size_h?: number | null;
  tag_info?: string | null;
}

interface FilterLog {
  id: string;
  equipmentId: string;
  category: FilterCategory;
  filterNo: string;
  filterMicron?: string;
  filterSize?: string;
  tagInfo?: string;
  installedDate: string;
  integrityDoneDate?: string | null;
  integrityDueDate: string;
  cleaningDoneDate?: string | null;
  cleaningDueDate: string;
  replacementDueDate: string;
  remarks: string;
  checkedBy: string;
  timestamp: Date;
  status: "pending" | "approved" | "rejected" | "draft" | "pending_secondary_approval";
  operator_id?: string;
  approved_by_id?: string;
  corrects_id?: string;
  has_corrections?: boolean;
}

const FilterLogBookPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<FilterLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<FilterLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveCommentOpen, setApproveCommentOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectCommentOpen, setRejectCommentOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [approvalComment, setApprovalComment] = useState("");
  const [editingCommentLogId, setEditingCommentLogId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState("");
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<FilterCategoryOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [selectedEquipmentUuid, setSelectedEquipmentUuid] = useState<string>("");

  const [formData, setFormData] = useState({
    equipmentId: "",
    category: "hvac" as FilterCategory,
    filterNo: "",
    filterMicron: "",
    filterSize: "",
    tagInfo: "",
    installedDate: "",
    integrityDoneDate: "",
    cleaningDoneDate: "",
    integrityDueDate: "",
    cleaningDueDate: "",
    replacementDueDate: "",
    remarks: "",
    date: "",
    time: "",
  });

  const updateInstalledAndDueDates = (installedDate: string) => {
    if (!installedDate) {
      setFormData((prev) => ({
        ...prev,
        installedDate: "",
      }));
      return;
    }

    const base = new Date(installedDate);
    if (Number.isNaN(base.getTime())) {
      setFormData((prev) => ({ ...prev, installedDate }));
      return;
    }

    const addDays = (d: Date, days: number) => {
      const copy = new Date(d.getTime());
      copy.setDate(copy.getDate() + days);
      return copy;
    };

    const addMonths = (d: Date, months: number) => {
      const copy = new Date(d.getTime());
      const day = copy.getDate();
      copy.setMonth(copy.getMonth() + months);
      if (copy.getDate() !== day) {
        copy.setDate(0);
      }
      return copy;
    };

    const addYears = (d: Date, years: number) => {
      const copy = new Date(d.getTime());
      const day = copy.getDate();
      copy.setFullYear(copy.getFullYear() + years);
      if (copy.getDate() !== day) {
        copy.setDate(0);
      }
      return copy;
    };

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const integrityDue = addDays(addMonths(base, 6), 15);
    const cleaningDue = addDays(addMonths(base, 6), 15);
    const replacementDue = addDays(addYears(base, 1), 30);

    setFormData((prev) => ({
      ...prev,
      installedDate,
      integrityDueDate: prev.integrityDueDate || fmt(integrityDue),
      cleaningDueDate: prev.cleaningDueDate || fmt(cleaningDue),
      replacementDueDate: prev.replacementDueDate || fmt(replacementDue),
    }));
  };

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    status: "all" as "all" | "pending" | "approved" | "rejected" | "pending_secondary_approval",
    equipmentId: "",
    category: "all" as "all" | FilterCategory,
    checkedBy: "",
    fromTime: "",
    toTime: "",
  });

  const loadCategories = async () => {
    try {
      const data = await filterCategoryAPI.list();
      const options: FilterCategoryOption[] = (data as any[])
        .filter((c) => c.is_active)
        .map((c) => ({
          value: c.name as string,
          label: c.name as string,
        }));
      setCategoryOptions(options);
    } catch (error) {
      console.error("Error loading filter categories:", error);
    }
  };

  const loadEquipment = async () => {
    try {
      const data = await equipmentAPI.list();
      const options: EquipmentOption[] = (data as any[])
        .filter((e) => e.is_active !== false)
        .map((e) => ({
          id: e.id,
          equipment_number: e.equipment_number,
          name: e.name,
        }));
      setEquipmentOptions(options);
    } catch (error) {
      console.error("Error loading equipment:", error);
    }
  };

  const formatFilterSize = (a: FilterAssignmentRow) => {
    const parts = [a.filter_size_l, a.filter_size_w, a.filter_size_h].filter(
      (v) => v != null
    );
    if (parts.length === 3) return `${parts[0]} × ${parts[1]} × ${parts[2]}`;
    return "";
  };

  const onEquipmentSelected = async (equipmentUuid: string) => {
    setSelectedEquipmentUuid(equipmentUuid);
    const eq = equipmentOptions.find((e) => e.id === equipmentUuid);
    setFormData((prev) => ({
      ...prev,
      equipmentId: eq?.equipment_number || prev.equipmentId,
    }));

    try {
      const assignments = (await filterAssignmentAPI.list({
        equipment: equipmentUuid,
      })) as FilterAssignmentRow[];
      const active = assignments?.[0];
      if (active) {
        setFormData((prev) => ({
          ...prev,
          filterNo: prev.filterNo?.trim() ? prev.filterNo : active.filter_id || "",
          filterMicron:
            prev.filterMicron?.trim() ? prev.filterMicron : active.filter_micron_size || "",
          filterSize: prev.filterSize?.trim() ? prev.filterSize : formatFilterSize(active),
          tagInfo: prev.tagInfo?.trim() ? prev.tagInfo : active.tag_info || "",
        }));
      }
    } catch {
      // ignore
    }

    try {
      const overdue = await filterScheduleAPI.list({
        equipment: equipmentUuid,
        overdue: true,
      });
      if (Array.isArray(overdue) && overdue.length > 0) {
        const types = Array.from(new Set(overdue.map((s: any) => s.schedule_type))).join(", ");
        toast.warning(`Maintenance overdue for this equipment: ${types}`);
      }
    } catch {
      // ignore
    }
  };

  const refreshLogs = async () => {
    try {
      setIsLoading(true);
      const apiLogs = await filterLogAPI.list().catch((err) => {
        console.error("Error fetching filter logs:", err);
        return [];
      });

      const allLogs: FilterLog[] = [];
      apiLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentId: log.equipment_id,
          category: log.category,
          filterNo: log.filter_no,
          filterMicron: log.filter_micron || "",
          filterSize: log.filter_size || "",
          tagInfo: log.tag_info || "",
          installedDate: log.installed_date,
          integrityDoneDate: log.integrity_done_date,
          integrityDueDate: log.integrity_due_date,
          cleaningDoneDate: log.cleaning_done_date,
          cleaningDueDate: log.cleaning_due_date,
          replacementDueDate: log.replacement_due_date,
          remarks: log.remarks || "",
          checkedBy: log.operator_name,
          timestamp,
          status: log.status as FilterLog["status"],
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
        });
      });

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      setFilteredLogs(allLogs);
    } catch (error) {
      console.error("Error refreshing filter logs:", error);
      toast.error("Failed to refresh filter log entries");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
    void loadEquipment();
    void refreshLogs();
  }, []);

  const uniqueCheckedBy = useMemo(() => {
    if (!logs.length) return [];
    return Array.from(new Set(logs.map((log) => log.checkedBy).filter(Boolean))).sort();
  }, [logs]);

  const applyFilters = () => {
    let result = [...logs];
    if (filters.fromDate) {
      result = result.filter((log) => format(log.timestamp, "yyyy-MM-dd") >= filters.fromDate);
    }
    if (filters.toDate) {
      result = result.filter((log) => format(log.timestamp, "yyyy-MM-dd") <= filters.toDate);
    }
    if (filters.status !== "all") {
      result = result.filter((log) => log.status === filters.status);
    }
    if (filters.equipmentId) {
      result = result.filter((log) =>
        log.equipmentId.toLowerCase().includes(filters.equipmentId.toLowerCase()),
      );
    }
    if (filters.category !== "all") {
      result = result.filter((log) => log.category === filters.category);
    }
    if (filters.checkedBy) {
      result = result.filter((log) => log.checkedBy === filters.checkedBy);
    }
    if (filters.fromTime) {
      result = result.filter((log) => {
        const dateStr = format(log.timestamp, "yyyy-MM-dd");
        const timeStr = format(log.timestamp, "HH:mm:ss");
        if (dateStr !== filters.fromDate) return dateStr > (filters.fromDate || "");
        return timeStr >= filters.fromTime;
      });
    }
    if (filters.toTime) {
      result = result.filter((log) => {
        const dateStr = format(log.timestamp, "yyyy-MM-dd");
        const timeStr = format(log.timestamp, "HH:mm:ss");
        if (dateStr !== filters.toDate) return dateStr < (filters.toDate || "");
        return timeStr <= filters.toTime;
      });
    }
    setFilteredLogs(result);
    setIsFilterOpen(false);
    toast.success(`Filtered ${result.length} entries`);
  };

  const clearFilters = () => {
    const cleared = {
      fromDate: "",
      toDate: "",
      status: "all" as const,
      equipmentId: "",
      category: "all" as "all" | FilterCategory,
      checkedBy: "",
      fromTime: "",
      toTime: "",
    };
    setFilters(cleared);
    setFilteredLogs(logs);
    setIsFilterOpen(false);
    toast.success("Filters cleared");
  };

  const activeFilterCount = useMemo(() => {
    return [
      filters.fromDate,
      filters.toDate,
      filters.status !== "all" ? 1 : 0,
      filters.equipmentId,
      filters.category !== "all" ? 1 : 0,
      filters.checkedBy,
      filters.fromTime,
      filters.toTime,
    ].filter(Boolean).length;
  }, [filters]);

  const pendingDraftLogs = useMemo(
    () =>
      filteredLogs.filter(
        (log) =>
          log.status === "pending" ||
          log.status === "draft" ||
          log.status === "pending_secondary_approval",
      ),
    [filteredLogs],
  );
  const pendingDraftIds = useMemo(() => pendingDraftLogs.map((log) => log.id), [pendingDraftLogs]);
  const allPendingSelected =
    pendingDraftIds.length > 0 && pendingDraftIds.every((id) => selectedLogIds.includes(id));
  const handleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedLogIds((prev) => prev.filter((id) => !pendingDraftIds.includes(id)));
    } else {
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        pendingDraftIds.forEach((id) => next.add(id));
        return Array.from(next);
      });
    }
  };

  const draftCount = useMemo(
    () => logs.filter((log) => log.status === "draft").length,
    [logs],
  );
  const pendingCount = useMemo(
    () =>
      logs.filter(
        (log) => log.status === "pending" || log.status === "pending_secondary_approval",
      ).length,
    [logs],
  );
  const approvedCount = useMemo(
    () => logs.filter((log) => log.status === "approved").length,
    [logs],
  );
  const rejectedCount = useMemo(
    () => logs.filter((log) => log.status === "rejected").length,
    [logs],
  );

  const resetForm = () => {
    setSelectedEquipmentUuid("");
    setFormData({
      equipmentId: "",
      category: "hvac",
      filterNo: "",
      filterMicron: "",
      filterSize: "",
      tagInfo: "",
      installedDate: "",
      integrityDoneDate: "",
      cleaningDoneDate: "",
      integrityDueDate: "",
      cleaningDueDate: "",
      replacementDueDate: "",
      remarks: "",
      date: "",
      time: "",
    });
    setEditingLogId(null);
  };

  const handleOpenNewEntry = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEditLog = (log: FilterLog) => {
    const timestampStr = format(log.timestamp, "yyyy-MM-dd'T'HH:mm");
    const [datePart, timePart] = timestampStr.split("T");
    const match = equipmentOptions.find((e) => e.equipment_number === log.equipmentId);
    setSelectedEquipmentUuid(match?.id || "");
    setFormData({
      equipmentId: log.equipmentId,
      category: log.category,
      filterNo: log.filterNo,
      filterMicron: log.filterMicron || "",
      filterSize: log.filterSize || "",
      tagInfo: log.tagInfo || "",
      installedDate: log.installedDate,
      integrityDoneDate: log.integrityDoneDate || "",
      cleaningDoneDate: log.cleaningDoneDate || "",
      integrityDueDate: log.integrityDueDate,
      cleaningDueDate: log.cleaningDueDate,
      replacementDueDate: log.replacementDueDate,
      remarks: log.remarks || "",
      date: datePart,
      time: timePart,
    });
    setEditingLogId(log.id);
    setIsDialogOpen(true);
  };

  const isSupervisor = user?.role === "supervisor" || user?.role === "super_admin" || user?.role === "manager";
  const isOperator = user?.role === "operator";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error("You must be logged in to submit entries");
      return;
    }

    try {
      const timestampStr =
        formData.date && formData.time
          ? new Date(`${formData.date}T${formData.time}:00`)
          : new Date();

      const payload: any = {
        equipment_id: formData.equipmentId,
        category: formData.category,
        filter_no: formData.filterNo,
        filter_micron: formData.filterMicron || null,
        filter_size: formData.filterSize || null,
        tag_info: formData.tagInfo || null,
        installed_date: formData.installedDate || format(timestampStr, "yyyy-MM-dd"),
        integrity_done_date: formData.integrityDoneDate || null,
        cleaning_done_date: formData.cleaningDoneDate || null,
        integrity_due_date: formData.integrityDueDate || null,
        cleaning_due_date: formData.cleaningDueDate || null,
        replacement_due_date: formData.replacementDueDate || null,
        remarks: formData.remarks || "",
        timestamp: timestampStr.toISOString(),
      };

      const existing = logs.find((log) => log.id === editingLogId) || null;

      if (editingLogId && existing) {
        if (
          (existing.status === "rejected" || existing.status === "pending_secondary_approval") &&
          isSupervisor
        ) {
          await filterLogAPI.correct(editingLogId, payload);
          toast.success("Correction entry created successfully");
        } else {
          await filterLogAPI.update(editingLogId, payload);
          toast.success("Filter log updated successfully");
        }
      } else {
        const created = await filterLogAPI.create(payload);
        if (created && created.status === "pending") {
          toast.success("Filter log submitted for approval");
        } else {
          toast.success("Filter log saved as draft");
        }
      }

      setIsDialogOpen(false);
      resetForm();
      await refreshLogs();
    } catch (error: any) {
      console.error("Error saving filter log:", error);
      toast.error(error?.message || "Failed to save filter log entry");
    }
  };

  const handleApproveClick = (logId: string, log: FilterLog) => {
    if (!user) return;

    // Disallow approving own entries
    if (log.operator_id && log.operator_id === user.id) {
      toast.error("The log book entry must be approved by a different user than the operator (Log Book Done By).");
      return;
    }

    // Allow only for pending, draft or pending secondary approval
    if (
      log.status !== "pending" &&
      log.status !== "draft" &&
      log.status !== "pending_secondary_approval"
    ) {
      return;
    }

    // For secondary approval, ensure different approver than the first approver
    if (log.status === "pending_secondary_approval" && log.approved_by_id === user.id) {
      toast.error("A different person must approve this corrected entry.");
      return;
    }

    setSelectedLogIds([logId]);
    setSelectedLogId(logId);
    setApprovalComment("");
    setApproveConfirmOpen(true);
  };

  const handleBulkApproveClick = () => {
    if (!selectedLogIds.length) {
      toast.error("Please select at least one entry to approve.");
      return;
    }
    setApproveConfirmOpen(true);
  };

  const performApprove = async (ids: string[], comment: string) => {
    try {
      for (const id of ids) {
        await filterLogAPI.approve(id, "approve", comment || undefined);
      }
      toast.success("Selected entries approved successfully");
      setSelectedLogIds([]);
      await refreshLogs();
    } catch (error: any) {
      console.error("Error approving entries:", error);
      toast.error(error?.message || "Failed to approve entries");
    }
  };

  const handleRejectClick = (logId: string) => {
    setSelectedLogId(logId);
    setRejectComment("");
    setRejectConfirmOpen(true);
  };

  const performReject = async (id: string, comment: string) => {
    try {
      await filterLogAPI.approve(id, "reject", comment || undefined);
      toast.success("Entry rejected successfully");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error rejecting entry:", error);
      toast.error(error?.message || "Failed to reject entry");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry? This action cannot be undone.")) {
      return;
    }
    try {
      await filterLogAPI.delete(id);
      toast.success("Entry deleted successfully");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error deleting entry:", error);
      toast.error(error?.message || "Failed to delete entry");
    }
  };

  const getStatusBadgeVariant = (status: FilterLog["status"]) => {
    switch (status) {
      case "approved":
        return "success" as const;
      case "rejected":
        return "destructive" as const;
      case "pending":
      case "pending_secondary_approval":
        return "warning" as const;
      case "draft":
      default:
        return "outline" as const;
    }
  };

  const getStatusLabel = (status: FilterLog["status"]) => {
    switch (status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "pending_secondary_approval":
        return "Pending";
      case "pending":
        return "Pending";
      case "draft":
      default:
        return "Draft";
    }
  };

  const isSelectableForApproval = (log: FilterLog) => {
    if (log.status === "approved" || log.status === "rejected") return false;
    if (!user) return false;
    if (log.operator_id && log.operator_id === user.id) return false;
    return true;
  };

  const toggleSelectLog = (log: FilterLog) => {
    if (!isSelectableForApproval(log)) {
      toast.error("You cannot approve your own entries.");
      return;
    }
    setSelectedLogIds((prev) =>
      prev.includes(log.id) ? prev.filter((id) => id !== log.id) : [...prev, log.id],
    );
  };

  const draftLogs = filteredLogs.filter((log) => log.status === "draft");
  const pendingLogs = filteredLogs.filter(
    (log) =>
      log.status === "pending" || log.status === "pending_secondary_approval",
  );
  const approvedLogs = filteredLogs.filter((log) => log.status === "approved");
  const rejectedLogs = filteredLogs.filter((log) => log.status === "rejected");

  const isFilterAdmin =
    user && (user.role === "manager" || user.role === "super_admin");

  return (
    <>
      <Header
        title="Filter Log Book"
        subtitle="Manage filter installation, integrity, cleaning and replacement logs"
      />
      <div className="px-4 pt-2">
        <button
          type="button"
          onClick={() =>
            navigate(isFilterAdmin ? "/e-log-book/filter" : "/e-log-book")
          }
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>
      <main className="p-4 space-y-4">
        {/* Header + status counters + actions (one line, like other logbooks) */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              Manage filter installation, integrity, cleaning and replacement logs.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">
                {draftCount} Draft
              </Badge>
              <Badge variant="pending">
                {pendingCount} Pending
              </Badge>
              <Badge variant="success">
                {approvedCount} Approved
              </Badge>
              <Badge variant="destructive">
                {rejectedCount} Rejected
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFilterOpen(true)}
              className={cn(
                "flex items-center gap-1",
                activeFilterCount > 0 && "border-amber-500 text-amber-700",
              )}
            >
              <Filter className="w-4 h-4 mr-2" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-xs text-white px-1.5 py-0.5">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) setEditingLogId(null);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="accent" size="sm" onClick={handleOpenNewEntry}>
                  <Plus className="w-4 h-4 mr-1" />
                  New Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingLogId ? "Edit Filter Log Entry" : "New Filter Log Entry"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(), "PPP")} · {format(new Date(), "p")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Done By: {user?.name || user?.email || "Unknown"}
                      </p>
                    </div>
                  </div>

                  {/* Editable Date/Time when correcting rejected or pending-secondary-approval */}
                  {editingLogId && (() => {
                    const editingLog = logs.find((l) => l.id === editingLogId);
                    const canEditDateTime =
                      editingLog &&
                      (editingLog.status === "rejected" ||
                        editingLog.status === "pending_secondary_approval");
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) =>
                              setFormData({ ...formData, date: e.target.value })
                            }
                            disabled={!canEditDateTime}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Time</Label>
                          <Input
                            type="time"
                            step={1}
                            value={formData.time}
                            onChange={(e) =>
                              setFormData({ ...formData, time: e.target.value })
                            }
                            disabled={!canEditDateTime}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Equipment Name *</Label>
                      <Select
                        value={selectedEquipmentUuid}
                        onValueChange={(value) => void onEquipmentSelected(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select equipment" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {equipmentOptions.map((eq) => (
                            <SelectItem key={eq.id} value={eq.id}>
                              {eq.equipment_number} – {eq.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.equipmentId ? (
                        <div className="text-xs text-muted-foreground">
                          Selected: {formData.equipmentId}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            category: value as FilterCategory,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {categoryOptions.length > 0 &&
                            categoryOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Filter No *</Label>
                    <Input
                      type="text"
                      value={formData.filterNo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          filterNo: e.target.value,
                        })
                      }
                      placeholder="e.g., F-001"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tag Information (auto-fetched)</Label>
                    <Input
                      type="text"
                      value={formData.tagInfo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tagInfo: e.target.value,
                        })
                      }
                      placeholder="Auto-filled from assignment (editable)"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Filter Micron</Label>
                      <Input
                        type="text"
                        value={formData.filterMicron}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            filterMicron: e.target.value,
                          })
                        }
                        placeholder="e.g., 0.2 µm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Filter Size</Label>
                      <Input
                        type="text"
                        value={formData.filterSize}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            filterSize: e.target.value,
                          })
                        }
                        placeholder="e.g., 10 inch"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Filter Installed Date *</Label>
                      <Input
                        type="date"
                        value={formData.installedDate}
                        onChange={(e) => updateInstalledAndDueDates(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Integrity Done Date</Label>
                      <Input
                        type="date"
                        value={formData.integrityDoneDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            integrityDoneDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cleaning Done Date</Label>
                      <Input
                        type="date"
                        value={formData.cleaningDoneDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cleaningDoneDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Integrity Due Date</Label>
                      <Input
                        type="date"
                        value={formData.integrityDueDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            integrityDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Auto from installed date (6 months + 15 days); you may override.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Cleaning Due Date</Label>
                      <Input
                        type="date"
                        value={formData.cleaningDueDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cleaningDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Auto from installed date (6 months + 15 days); you may override.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Replacement Due Date</Label>
                      <Input
                        type="date"
                        value={formData.replacementDueDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            replacementDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Target 1 year ±30 days from installed date; you may override.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      value={formData.remarks}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          remarks: e.target.value,
                        })
                      }
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                      }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button type="submit" variant="accent">
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filter dialog */}
        <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Entries</DialogTitle>
              <DialogDescription>
                Filter entries by date range, status, equipment, category, checked by user, and time range.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <Label className="text-base font-semibold">Date Range</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input
                      type="date"
                      value={filters.fromDate}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input
                      type="date"
                      value={filters.toDate}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, toDate: e.target.value }))
                      }
                      min={filters.fromDate}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: value as typeof prev.status,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="pending_secondary_approval">
                      Pending secondary approval
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Equipment Name</Label>
                <Input
                  type="text"
                  value={filters.equipmentId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, equipmentId: e.target.value }))
                  }
                  placeholder="e.g., Equipment name"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Category</Label>
                <Select
                  value={filters.category}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      category: value as typeof prev.category,
                    }))
                  }
                >
                 <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                 <SelectContent className="max-h-48 overflow-y-auto">
                    <SelectItem value="all">All</SelectItem>
                  {categoryOptions.length > 0 &&
                    categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Checked By</Label>
                <Select
                  value={filters.checkedBy || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      checkedBy: value === "all" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {uniqueCheckedBy.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Time Range (Optional)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Time</Label>
                    <Input
                      type="time"
                      value={filters.fromTime}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, fromTime: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>To Time</Label>
                    <Input
                      type="time"
                      value={filters.toTime}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, toTime: e.target.value }))
                      }
                      min={filters.fromTime}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFilterOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="accent" onClick={applyFilters}>
                Apply Filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Step 1: Approve confirmation alert (match other logbooks) */}
        <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedLogIds.length <= 1
                  ? "Are you sure you want to approve this filter entry? This action cannot be undone."
                  : `Are you sure you want to approve these ${selectedLogIds.length} filter entries? This action cannot be undone.`}
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

        {/* Step 2: Approval comment dialog (mandatory, like other logbooks) */}
        <Dialog
          open={approveCommentOpen}
          onOpenChange={(open) => {
            setApproveCommentOpen(open);
            if (!open) {
              setApprovalComment("");
              setSelectedLogIds([]);
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
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="approval-comment-filter">
                  Comment <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="approval-comment-filter"
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
                    setSelectedLogIds([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={async () => {
                    const comment = approvalComment.trim();
                    if (!comment) {
                      toast.error("Comment is required for approval");
                      return;
                    }
                    const ids =
                      selectedLogId && !selectedLogIds.includes(selectedLogId)
                        ? [selectedLogId]
                        : selectedLogIds.length
                        ? selectedLogIds
                        : selectedLogId
                        ? [selectedLogId]
                        : [];
                    if (!ids.length) {
                      toast.error("No entries selected to approve.");
                      return;
                    }
                    await performApprove(ids, comment);
                    setApproveCommentOpen(false);
                    setApprovalComment("");
                    setSelectedLogId(null);
                    setSelectedLogIds([]);
                  }}
                >
                  Approve
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reject: Step 1 – Confirm */}
        <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject this filter entry? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setRejectConfirmOpen(false);
                  setRejectCommentOpen(true);
                }}
                className="bg-destructive hover:bg-destructive/90 text-white"
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject: Step 2 – Mandatory comment (match other logbooks) */}
        <Dialog
          open={rejectCommentOpen}
          onOpenChange={(open) => {
            setRejectCommentOpen(open);
            if (!open) {
              setRejectComment("");
              setSelectedLogId(null);
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
            <div className="space-y-4 py-4">
              <Textarea
                id="reject-comment-filter"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
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
                    setRejectComment("");
                    setSelectedLogId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={async () => {
                    if (!rejectComment.trim()) {
                      toast.error("Comment is required when rejecting.");
                      return;
                    }
                    if (!selectedLogId) {
                      toast.error("No entry selected to reject.");
                      return;
                    }
                    await performReject(selectedLogId, rejectComment.trim());
                    setRejectCommentOpen(false);
                    setSelectedLogId(null);
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="border-b px-4 py-2 flex justify-between items-center">
            <span className="text-sm font-medium">
              {isLoading ? "Loading filter entries..." : `${filteredLogs.length} entries`}
            </span>
            {selectedLogIds.length > 0 && user?.role !== "operator" && (
              <Button
                type="button"
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setApproveCommentOpen(true)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve selected ({selectedLogIds.length})
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm" style={{ minWidth: '1320px' }}>
              <thead className="bg-muted">
                <tr className="border-b">
                  <th className="px-3 py-2 text-center align-middle w-12">
                    {pendingDraftIds.length > 0 && user?.role !== "operator" && (
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAllPending}
                        aria-label="Select all pending/draft"
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[110px]">
                    Date
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[100px]">
                    Time
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[150px]">
                    Equipment name
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[130px]">
                    Category
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[160px]">
                    Filter number
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[120px]">
                    Filter micron
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[180px]">
                    Filter size
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[140px]">
                    <span className="whitespace-nowrap">Installed date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[170px]">
                    <span className="block whitespace-nowrap">Integrity done</span>
                    <span className="block whitespace-nowrap">date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[170px]">
                    <span className="block whitespace-nowrap">Integrity due</span>
                    <span className="block whitespace-nowrap">date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[170px]">
                    <span className="block whitespace-nowrap">Cleaning done</span>
                    <span className="block whitespace-nowrap">date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[170px]">
                    <span className="block whitespace-nowrap">Cleaning due</span>
                    <span className="block whitespace-nowrap">date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[180px]">
                    <span className="block whitespace-nowrap">Replacement due</span>
                    <span className="block whitespace-nowrap">date</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle min-w-[180px]">
                    Remarks
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[140px]">
                    Done by
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[110px]">
                    Status
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[140px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={18} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {isLoading ? "Loading entries..." : "No entries found"}
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => {
                  const dateStr = format(log.timestamp, "yyyy-MM-dd");
                  const timeStr = format(log.timestamp, "HH:mm:ss");
                  const isSelected = selectedLogIds.includes(log.id);

                  return (
                    <tr key={log.id} className="border-b hover:bg-muted/40">
                      <td className="px-3 py-2 align-top">
                        {(log.status === "pending" ||
                          log.status === "draft" ||
                          log.status === "pending_secondary_approval") &&
                          user?.role !== "operator" &&
                          (!log.operator_id || log.operator_id !== user?.id) && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectLog(log)}
                              aria-label="Select row"
                            />
                          )}
                      </td>
                      <td className="px-3 py-2 align-top">{dateStr}</td>
                      <td className="px-3 py-2 align-top">{timeStr}</td>
                      <td className="px-3 py-2 align-top">{log.equipmentId}</td>
                      <td className="px-3 py-2 align-top text-center text-sm whitespace-nowrap min-w-[150px]">
                        {log.category === "hvac" && "HVAC"}
                        {log.category === "water_system" && "Water system"}
                        {log.category === "compressed_air" && "Compressed air"}
                        {log.category === "nitrogen_air" && "Nitrogen air"}
                        {log.category &&
                          !["hvac", "water_system", "compressed_air", "nitrogen_air"].includes(
                            log.category,
                          ) &&
                          log.category}
                      </td>
                      <td className="px-3 py-2 align-top text-center text-sm whitespace-nowrap min-w-[150px]">
                        {log.filterNo}
                      </td>
                      <td className="px-3 py-2 align-top text-center text-sm whitespace-nowrap min-w-[100px]">
                        {log.filterMicron}
                      </td>
                      <td className="px-3 py-2 align-top text-center text-xs whitespace-nowrap min-w-[160px]">
                        {log.filterSize}
                      </td>
                      <td className="px-3 py-2 align-top">{log.installedDate}</td>
                      <td className="px-3 py-2 align-top">
                        {log.integrityDoneDate || <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2 align-top">{log.integrityDueDate}</td>
                      <td className="px-3 py-2 align-top">
                        {log.cleaningDoneDate || <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2 align-top">{log.cleaningDueDate}</td>
                      <td className="px-3 py-2 align-top">{log.replacementDueDate}</td>
                      <td className="px-3 py-2 align-top max-w-xs">
                        <div className="whitespace-pre-wrap break-words text-xs">
                          {log.remarks || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">{log.checkedBy}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              log.has_corrections && !log.corrects_id
                                ? "destructive"
                                : log.corrects_id
                                ? "warning"
                                : getStatusBadgeVariant(log.status)
                            }
                            className="w-fit text-xs"
                          >
                            {log.has_corrections && !log.corrects_id
                              ? "Rejected"
                              : log.corrects_id
                              ? "Pending"
                              : getStatusLabel(log.status)}
                          </Badge>
                          {log.corrects_id && (
                            <span className="text-[10px] text-amber-700 whitespace-nowrap">
                              Correction entry
                            </span>
                          )}
                          {log.has_corrections && !log.corrects_id && (
                            <span className="text-[10px] text-emerald-700 whitespace-nowrap">
                              Has corrections
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          {user?.role !== "operator" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "h-7 w-7",
                                  (log.status === "pending" ||
                                    log.status === "draft" ||
                                    log.status === "pending_secondary_approval") &&
                                  !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id)
                                    ? "text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                    : "opacity-40 cursor-not-allowed",
                                )}
                                title={
                                  log.status === "pending_secondary_approval" && log.approved_by_id === user?.id
                                    ? "A different person must approve this corrected entry."
                                    : log.status === "pending" ||
                                      log.status === "draft" ||
                                      log.status === "pending_secondary_approval"
                                    ? "Approve"
                                    : "Approved"
                                }
                                onClick={() => handleApproveClick(log.id, log)}
                                disabled={
                                  (log.status !== "pending" &&
                                    log.status !== "draft" &&
                                    log.status !== "pending_secondary_approval") ||
                                  (log.status === "pending_secondary_approval" &&
                                    log.approved_by_id === user?.id)
                                }
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>

                              <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "h-7 w-7",
                                  (log.status === "pending" ||
                                    log.status === "draft" ||
                                    log.status === "pending_secondary_approval")
                                    ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                                    : "opacity-40 cursor-not-allowed",
                                )}
                                title={
                                  log.status === "pending" ||
                                  log.status === "draft" ||
                                  log.status === "pending_secondary_approval"
                                    ? "Reject"
                                    : "Rejected"
                                }
                                onClick={() => {
                                  if (
                                    log.status === "pending" ||
                                    log.status === "draft" ||
                                    log.status === "pending_secondary_approval"
                                  ) {
                                    handleRejectClick(log.id);
                                  }
                                }}
                                disabled={
                                  log.status !== "pending" &&
                                  log.status !== "draft" &&
                                  log.status !== "pending_secondary_approval"
                                }
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>

                              <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "h-7 w-7",
                                  log.status === "rejected" ||
                                    log.status === "pending_secondary_approval"
                                    ? ""
                                    : "opacity-40 cursor-not-allowed",
                                )}
                                title={
                                  log.status === "rejected" ||
                                  log.status === "pending_secondary_approval"
                                    ? "Edit entry"
                                    : "Edit only available after reject"
                                }
                                onClick={() => {
                                  if (
                                    log.status === "rejected" ||
                                    log.status === "pending_secondary_approval"
                                  ) {
                                    handleEditLog(log);
                                  }
                                }}
                                disabled={
                                  log.status !== "rejected" &&
                                  log.status !== "pending_secondary_approval"
                                }
                              >
                                <Edit className="w-4 h-4" />
                              </Button>

                              <Button
                                asChild
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="View history (old/new values)"
                              >
                                <Link
                                  to={`/reports?tab=audit-trail&object_type=filter_log&object_id=${log.id}`}
                                >
                                  <History className="w-4 h-4" />
                                </Link>
                              </Button>
                            </>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete entry"
                            onClick={() => handleDelete(log.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
};

export default FilterLogBookPage;

