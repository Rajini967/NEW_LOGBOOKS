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
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { chemicalPrepAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Clock, Save, Filter, X, Plus, Trash2, CheckCircle, XCircle, Edit, History } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface ChemicalPrepLog {
  id: string;
  equipmentName: string;
  chemicalName: string;
  chemicalPercent?: number;
  chemicalCategory?: "major" | "minor" | null;
  chemicalConcentration?: number | null;
  solutionConcentration?: number | null;
  waterQty?: number | null;
  chemicalQty: number;
  batchNo?: string;
  doneBy?: string;
  date: string;
  time: string;
  remarks: string;
  comment?: string;
  checkedBy: string;
  timestamp: Date;
  status: "pending" | "approved" | "rejected" | "draft" | "pending_secondary_approval";
  /** User who approved or rejected (rejector for rejected / pending_secondary_approval entries) */
  operator_id?: string;
  approved_by_id?: string;
  corrects_id?: string;
  has_corrections?: boolean;
}

const CHEMICAL_NAMES = [
  "NaOCl – Sodium Hypochlorite",
  "NaOH – Sodium Hydroxide",
  "SMBS – Sodium Metabisulfite",
  "NaCl – Sodium Chloride",
  "HCl – Hydrochloric Acid",
  "Citric Acid (C₆H₈O₇) – Citric Acid",
  "Nitric Acid (HNO₃) – Nitric Acid",
  "Hydrogen Peroxide (H₂O₂) – Hydrogen Peroxide",
  "Antiscalant",
];

const ChemicalLogBookPage: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ChemicalPrepLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ChemicalPrepLog[]>([]);
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

  const [formData, setFormData] = useState({
    equipmentName: "",
    chemicalName: "",
    chemicalCategory: "major" as "major" | "minor",
    chemicalConcentration: "",
    solutionConcentration: "",
    waterQty: "",
    chemicalQty: "",
    batchNo: "",
    doneBy: "",
    remarks: "",
    date: "",
    time: "",
  });

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    status: "all" as "all" | "pending" | "approved" | "rejected" | "pending_secondary_approval",
    equipmentName: "",
    checkedBy: "",
    fromTime: "",
    toTime: "",
  });

  const refreshLogs = async () => {
    try {
      setIsLoading(true);
      const chemicalPreps = await chemicalPrepAPI.list().catch((err) => {
        console.error("Error fetching chemical preps:", err);
        return [];
      });

      const allLogs: ChemicalPrepLog[] = [];
      chemicalPreps.forEach((prep: any) => {
        const timestamp = new Date(prep.timestamp);
        allLogs.push({
          id: prep.id,
          equipmentName: prep.equipment_name,
          chemicalName: prep.chemical_name,
          chemicalPercent: prep.chemical_percent ?? undefined,
          chemicalCategory: prep.chemical_category ?? null,
          chemicalConcentration: prep.chemical_concentration ?? null,
          solutionConcentration: prep.solution_concentration,
          waterQty: prep.water_qty,
          chemicalQty: prep.chemical_qty,
          batchNo: prep.batch_no || "",
          doneBy: prep.done_by || prep.checked_by || prep.operator_name,
          date: format(timestamp, "yyyy-MM-dd"),
          time: format(timestamp, "HH:mm:ss"),
          remarks: prep.remarks || "",
          comment: prep.comment || "",
          checkedBy: prep.checked_by || prep.operator_name,
          timestamp,
          status: prep.status as ChemicalPrepLog["status"],
          operator_id: prep.operator_id,
          approved_by_id: prep.approved_by_id,
          corrects_id: prep.corrects_id,
          has_corrections: prep.has_corrections,
        });
      });

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      setFilteredLogs(allLogs);
    } catch (error) {
      console.error("Error refreshing chemical logs:", error);
      toast.error("Failed to refresh chemical preparation entries");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  const uniqueCheckedBy = useMemo(() => {
    if (!logs.length) return [];
    return Array.from(new Set(logs.map((log) => log.checkedBy).filter(Boolean))).sort();
  }, [logs]);

  const applyFilters = () => {
    let result = [...logs];
    if (filters.fromDate) {
      result = result.filter((log) => log.date >= filters.fromDate);
    }
    if (filters.toDate) {
      result = result.filter((log) => log.date <= filters.toDate);
    }
    if (filters.status !== "all") {
      result = result.filter((log) => log.status === filters.status);
    }
    if (filters.equipmentName) {
      result = result.filter((log) =>
        log.equipmentName
          .toLowerCase()
          .includes(filters.equipmentName.toLowerCase()),
      );
    }
    if (filters.checkedBy) {
      result = result.filter((log) => log.checkedBy === filters.checkedBy);
    }
    if (filters.fromTime) {
      result = result.filter((log) => {
        if (log.date !== filters.fromDate) return log.date > (filters.fromDate || "");
        return log.time >= filters.fromTime;
      });
    }
    if (filters.toTime) {
      result = result.filter((log) => {
        if (log.date !== filters.toDate) return log.date < (filters.toDate || "");
        return log.time <= filters.toTime;
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
      equipmentName: "",
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
      filters.equipmentName,
      filters.checkedBy,
      filters.fromTime,
      filters.toTime,
    ].filter(Boolean).length;
  }, [filters]);

  const pendingDraftLogs = useMemo(
    () => filteredLogs.filter((log) => log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval"),
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
  const handleToggleLogSelection = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.equipmentName) {
        toast.error("Please enter Equipment Name.");
        return;
      }
      if (!formData.chemicalName) {
        toast.error("Please enter Chemical Name.");
        return;
      }
      const numericFields: { key: keyof typeof formData; label: string }[] = [
        { key: "chemicalQty", label: "Chemical quantity" },
      ];
      if (formData.chemicalCategory === "major") {
        numericFields.unshift(
          { key: "waterQty", label: "Water quantity" },
          { key: "solutionConcentration", label: "Solution concentration" },
        );
      }
      for (const field of numericFields) {
        const raw = formData[field.key];
        if (!raw) {
          toast.error(`Please enter ${field.label}.`);
          return;
        }
        const value = parseFloat(raw);
        if (Number.isNaN(value)) {
          toast.error(`${field.label} must be numeric.`);
          return;
        }
      }

      // For Minor category, Solution concentration and Water Qty are optional but must be numeric if provided
      if (formData.chemicalCategory === "minor") {
        if (formData.solutionConcentration) {
          const value = parseFloat(formData.solutionConcentration);
          if (Number.isNaN(value)) {
            toast.error("Solution concentration must be numeric.");
            return;
          }
        }
        if (formData.waterQty) {
          const value = parseFloat(formData.waterQty);
          if (Number.isNaN(value)) {
            toast.error("Water quantity must be numeric.");
            return;
          }
        }
      }

      const solutionConcentrationValue =
        formData.solutionConcentration !== "" ? parseFloat(formData.solutionConcentration) : undefined;
      const waterQtyValue =
        formData.waterQty !== "" ? parseFloat(formData.waterQty) : undefined;
      const chemicalConcentrationValue =
        formData.chemicalConcentration !== "" ? parseFloat(formData.chemicalConcentration) : undefined;

      const prepData: Record<string, unknown> = {
        equipment_name: formData.equipmentName,
        chemical_name: formData.chemicalName,
        chemical_percent: undefined,
        chemical_concentration: chemicalConcentrationValue,
        chemical_category: formData.chemicalCategory,
        solution_concentration: solutionConcentrationValue,
        water_qty: waterQtyValue,
        chemical_qty: parseFloat(formData.chemicalQty),
        batch_no: formData.batchNo || undefined,
        done_by: formData.doneBy || user?.name || user?.email || "Unknown",
        remarks: formData.remarks || undefined,
        checked_by: user?.name || user?.email || "Unknown",
      };
      const editingChemicalLog = editingLogId ? logs.find((l) => l.id === editingLogId) : null;
      const canChangeTimestamp =
        editingChemicalLog &&
        (editingChemicalLog.status === "rejected" || editingChemicalLog.status === "pending_secondary_approval");
      if (canChangeTimestamp && formData.date && formData.time) {
        prepData.timestamp = new Date(`${formData.date}T${formData.time}`).toISOString();
      }

      if (editingLogId && editingChemicalLog) {
        const isCorrection =
          (editingChemicalLog.status === "rejected" || editingChemicalLog.status === "pending_secondary_approval") &&
          user?.role !== "operator";
        if (isCorrection) {
          await chemicalPrepAPI.correct(editingLogId, prepData as any);
          toast.success("Chemical entry corrected as new entry.");
        } else {
          await chemicalPrepAPI.update(editingLogId, prepData as any);
          toast.success("Chemical entry updated successfully.");
        }
        setEditingLogId(null);
        setFormData({
          equipmentName: "",
          chemicalName: "",
          chemicalCategory: "major",
          chemicalConcentration: "",
          solutionConcentration: "",
          waterQty: "",
          chemicalQty: "",
          batchNo: "",
          doneBy: "",
          remarks: "",
          date: "",
          time: "",
        });
        setIsDialogOpen(false);
        await refreshLogs();
      } else {
        await chemicalPrepAPI.create(prepData as any);
        toast.success("Chemical preparation entry saved successfully");

        setFormData({
          equipmentName: "",
          chemicalName: "",
          chemicalCategory: "major",
          chemicalConcentration: "",
          solutionConcentration: "",
          waterQty: "",
          chemicalQty: "",
          batchNo: "",
          doneBy: "",
          remarks: "",
          date: "",
          time: "",
        });
        setIsDialogOpen(false);
        await refreshLogs();
      }
    } catch (error: any) {
      console.error("Error saving chemical entry:", error);
      toast.error(error?.message || "Failed to save chemical preparation entry");
    }
  };

  const handleSaveComment = async (logId: string, comment: string) => {
    if (editingCommentLogId !== logId) return;
    setEditingCommentLogId(null);
    try {
      await chemicalPrepAPI.patch(logId, { comment: comment || "" });
      toast.success("Comment updated");
      await refreshLogs();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail?.[0] || error?.message || "Failed to update comment");
      setEditingCommentLogId(logId);
      setEditingCommentValue(comment);
    }
  };

  const handleEditLog = (log: ChemicalPrepLog) => {
    setEditingLogId(log.id);
    setFormData({
      equipmentName: log.equipmentName ?? "",
      chemicalName: log.chemicalName ?? "",
      chemicalCategory: (log.chemicalCategory as "major" | "minor") || "major",
      chemicalConcentration:
        log.chemicalConcentration != null
          ? String(log.chemicalConcentration)
          : log.chemicalPercent != null
          ? String(log.chemicalPercent)
          : "",
      solutionConcentration: log.solutionConcentration != null ? String(log.solutionConcentration) : "",
      waterQty: log.waterQty != null ? String(log.waterQty) : "",
      chemicalQty: log.chemicalQty != null ? String(log.chemicalQty) : "",
      batchNo: log.batchNo ?? "",
      doneBy: log.doneBy ?? "",
      remarks: log.remarks ?? "",
      date: log.date ?? "",
      time: log.time ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleApprove = async (id: string, remarks: string) => {
    setApproveCommentOpen(false);
    setApprovalComment("");
    try {
      await chemicalPrepAPI.approve(id, "approve", remarks);
      toast.success("Chemical entry approved successfully");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error approving chemical entry:", error);
      toast.error(error?.response?.data?.error || error?.message || "Failed to approve chemical entry");
    }
  };

  const handleReject = async (id: string, remarks: string) => {
    setRejectCommentOpen(false);
    setRejectComment("");
    try {
      await chemicalPrepAPI.approve(id, "reject", remarks);
      toast.error("Chemical entry rejected");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error rejecting chemical entry:", error);
      toast.error(error?.response?.data?.remarks?.[0] || error?.message || "Failed to reject chemical entry");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry? This action cannot be undone.")) {
      return;
    }
    try {
      await chemicalPrepAPI.delete(id);
      toast.success("Chemical entry deleted");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error deleting chemical entry:", error);
      toast.error(error?.message || "Failed to delete chemical entry");
    }
  };

  return (
    <>
      <Header
        title="Chemical Log Book"
        subtitle="Manage chemical preparations"
      />
      <main className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              Record and review chemical preparation details.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">
                {logs.filter((log) => log.status === "draft").length} Draft
              </Badge>
              <Badge variant="pending">
                {logs.filter((log) => log.status === "pending" || log.status === "pending_secondary_approval").length} Pending
              </Badge>
              <Badge variant="success">
                {logs.filter((log) => log.status === "approved").length} Approved
              </Badge>
              <Badge variant="destructive">
                {logs.filter((log) => log.status === "rejected").length} Rejected
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter Button - dialog like Chiller */}
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="relative">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Filter className="w-5 h-5" />
                    Filter Chemical Log Entries
                  </DialogTitle>
                  <DialogDescription>
                    Filter entries by date range, status, equipment, checked by user, and time range.
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
                          onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>To Date</Label>
                        <Input
                          type="date"
                          value={filters.toDate}
                          onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                          min={filters.fromDate}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Status</Label>
                    <Select
                      value={filters.status}
                      onValueChange={(v) => setFilters({ ...filters, status: v as typeof filters.status })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="pending_secondary_approval">Pending secondary approval</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Equipment Name</Label>
                    <Input
                      type="text"
                      value={filters.equipmentName}
                      onChange={(e) => setFilters({ ...filters, equipmentName: e.target.value })}
                      placeholder="e.g., Equipment name"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Checked By</Label>
                    <Select
                      value={filters.checkedBy || "all"}
                      onValueChange={(v) => setFilters({ ...filters, checkedBy: v === "all" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {uniqueCheckedBy.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
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
                          onChange={(e) => setFilters({ ...filters, fromTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>To Time</Label>
                        <Input
                          type="time"
                          value={filters.toTime}
                          onChange={(e) => setFilters({ ...filters, toTime: e.target.value })}
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
                  <Button type="button" variant="outline" onClick={() => setIsFilterOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" variant="accent" onClick={applyFilters}>
                    Apply Filters
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) setEditingLogId(null);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="accent" onClick={() => setEditingLogId(null)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingLogId ? "Edit Chemical Entry" : "New Chemical Preparation Entry"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(), "PPP")} · {format(new Date(), "p")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checked By:{" "}
                        {user?.name || user?.email || "Unknown"}
                      </p>
                    </div>
                  </div>

                  {/* Equipment & Chemical */}
                  {/* Date and Time (editable when correcting rejected or pending-secondary-approval entry) */}
                  {editingLogId && (() => {
                    const editingLog = logs.find((l) => l.id === editingLogId);
                    const canEditDateTime = editingLog && (editingLog.status === "rejected" || editingLog.status === "pending_secondary_approval");
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} disabled={!canEditDateTime} />
                        </div>
                        <div className="space-y-2">
                          <Label>Time</Label>
                          <Input type="time" step={1} value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} disabled={!canEditDateTime} />
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Equipment Name *</Label>
                      <Input
                        type="text"
                        value={formData.equipmentName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            equipmentName: e.target.value,
                          })
                        }
                        placeholder="e.g., EN0001-MGF"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chemical Category</Label>
                      <Select
                        value={formData.chemicalCategory}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            chemicalCategory: v as "major" | "minor",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="major">Major</SelectItem>
                          <SelectItem value="minor">Minor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Chemical Name *</Label>
                    <Select
                      value={formData.chemicalName}
                      onValueChange={(v) =>
                        setFormData({ ...formData, chemicalName: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select chemical..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CHEMICAL_NAMES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Batch No</Label>
                    <Input
                      type="text"
                      value={formData.batchNo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          batchNo: e.target.value,
                        })
                      }
                      placeholder="e.g., B-001"
                    />
                  </div>

                  {/* Quantity Details */}
                  <div className="space-y-3 pt-2 border-t mt-2">
                    <h3 className="text-sm font-semibold">Quantity Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Row 1: Solution Concentration & Chemical Concentration */}
                      <div className="space-y-2">
                        {formData.chemicalCategory === "major" && (
                          <>
                            <Label>
                              Solution Concentration (%)
                              <span className="text-destructive ml-1">*</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.solutionConcentration}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  solutionConcentration: e.target.value,
                                })
                              }
                              placeholder="e.g., 1.0"
                            />
                          </>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Chemical Concentration (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.chemicalConcentration}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              chemicalConcentration: e.target.value,
                            })
                          }
                          placeholder="e.g., 5.0"
                        />
                      </div>

                      {/* Row 2: Water Quantity & Chemical Quantity */}
                      <div className="space-y-2">
                        {formData.chemicalCategory === "major" && (
                          <>
                            <Label>
                              Water Quantity (L)
                              <span className="text-destructive ml-1">*</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.waterQty}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  waterQty: e.target.value,
                                })
                              }
                              placeholder="e.g., 100"
                            />
                          </>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Chemical Quantity (Kg)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.chemicalQty}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              chemicalQty: e.target.value,
                            })
                          }
                          placeholder="e.g., 0.32"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t mt-2">
                    <div className="space-y-2">
                      <Label>Done By</Label>
                      <Input
                        type="text"
                        value={formData.doneBy || user?.name || user?.email || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            doneBy: e.target.value,
                          })
                        }
                        placeholder="Operator name"
                      />
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
                        placeholder="Add any observations or notes..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      <Save className="w-4 h-4 mr-2" />
                      {editingLogId ? "Update Entry" : "Save Entry"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="border-b px-4 py-2 flex justify-between items-center">
            <span className="text-sm font-medium">
              {isLoading
                ? "Loading chemical preparations..."
                : `${filteredLogs.length} entries`}
            </span>
            {selectedLogIds.length > 0 && user?.role !== "operator" && (
              <Button
                type="button"
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setApproveConfirmOpen(true)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve selected ({selectedLogIds.length})
              </Button>
            )}
          </div>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-sm" style={{ minWidth: "1200px" }}>
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold w-12">
                    {pendingDraftIds.length > 0 && user?.role !== "operator" && (
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAllPending}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Time</th>
                  <th className="px-3 py-2 text-left font-semibold">Equipment</th>
                  <th className="px-3 py-2 text-left font-semibold">Chemical</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[130px]">Readings</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Batch No</th>
                  <th className="px-3 py-2 text-left font-semibold">Remarks</th>
                  <th className="px-3 py-2 text-left font-semibold">Comment</th>
                  <th className="px-3 py-2 text-left font-semibold">Checked By</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No Chemical Log Book entries found.
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-3 py-2 align-middle">
                      {(log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") && user?.role !== "operator" ? (
                        <Checkbox
                          checked={selectedLogIds.includes(log.id)}
                          onCheckedChange={() => handleToggleLogSelection(log.id)}
                          className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{log.date}</td>
                    <td className="px-3 py-2">{log.time}</td>
                    <td className="px-3 py-2">{log.equipmentName}</td>
                    <td className="px-3 py-2">{log.chemicalName}</td>
                    <td className="px-3 py-2 min-w-[200px]">
                      <div className="space-y-1 text-sm">
                        {log.solutionConcentration != null && (
                          <div>
                            <span className="font-semibold">Conc:</span>{" "}
                            {log.solutionConcentration}%
                          </div>
                        )}
                        {log.waterQty != null && (
                          <div>
                            <span className="font-semibold">Water:</span>{" "}
                            {log.waterQty} L
                          </div>
                        )}
                        <div>
                          <span className="font-semibold">Chemical:</span>{" "}
                          {log.chemicalQty} Kg
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{log.batchNo || "-"}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <p className="line-clamp-3 text-muted-foreground">{log.remarks || "-"}</p>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {editingCommentLogId === log.id ? (
                        <Textarea
                          className="min-h-[60px] min-w-[180px] text-sm py-2"
                          value={editingCommentValue}
                          onChange={(e) => setEditingCommentValue(e.target.value)}
                          onBlur={() => handleSaveComment(log.id, editingCommentValue)}
                          autoFocus
                        />
                      ) : (
                        <div
                          className="min-h-[36px] min-w-[120px] px-2 py-1.5 text-sm text-foreground whitespace-pre-wrap cursor-pointer hover:bg-muted/50 rounded border border-transparent hover:border-border transition-colors"
                          onClick={() => {
                            setEditingCommentLogId(log.id);
                            setEditingCommentValue(log.comment ?? "");
                          }}
                        >
                          {log.comment ? (
                            <span className="block">{log.comment}</span>
                          ) : (
                            <span className="text-muted-foreground/50">&nbsp;</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{log.checkedBy}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            log.has_corrections && !log.corrects_id
                              ? "destructive"
                              : log.corrects_id
                              ? "warning"
                              : log.status === "approved"
                              ? "success"
                              : log.status === "rejected"
                              ? "destructive"
                              : log.status === "pending" || log.status === "pending_secondary_approval"
                              ? "warning"
                              : "outline"
                          }
                        >
                          {log.has_corrections && !log.corrects_id
                            ? "Rejected"
                            : log.corrects_id
                            ? "Pending"
                            : log.status === "pending_secondary_approval" || log.status === "pending"
                            ? "Pending"
                            : log.status === "rejected"
                            ? "Rejected"
                            : log.status === "approved"
                            ? "Approved"
                            : log.status === "draft"
                            ? "Draft"
                            : log.status}
                        </Badge>
                        {log.corrects_id && (
                          <span className="text-[10px] text-amber-700 whitespace-nowrap">Correction entry</span>
                        )}
                        {log.has_corrections && !log.corrects_id && (
                          <span className="text-[10px] text-emerald-700 whitespace-nowrap">Has corrections</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {user?.role !== "operator" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") &&
                                  !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id)
                                  ? "text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  : "opacity-40 cursor-not-allowed"
                              )}
                              title={
                                log.status === "pending_secondary_approval" && log.approved_by_id === user?.id
                                  ? "A different person must approve this corrected entry."
                                  : (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval"
                                      ? "Approve"
                                      : "Approved")
                              }
                              onClick={() => {
                                if (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") {
                                  if (log.status === "pending_secondary_approval" && log.approved_by_id === user?.id) {
                                    toast.error("A different person must approve this corrected entry.");
                                    return;
                                  }
                                  if (log.operator_id === user?.id) {
                                    toast.error("The log book entry must be approved by a different user than the operator (Log Book Done By).");
                                    return;
                                  }
                                  setSelectedLogIds([log.id]);
                                  setApproveConfirmOpen(true);
                                }
                              }}
                              disabled={
                                (log.status !== "pending" && log.status !== "draft" && log.status !== "pending_secondary_approval") ||
                                (log.status === "pending_secondary_approval" && log.approved_by_id === user?.id)
                              }
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval")
                                  ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                                  : "opacity-40 cursor-not-allowed"
                              )}
                              title={log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval" ? "Reject" : "Rejected"}
                              onClick={() => {
                                if (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") {
                                  setSelectedLogId(log.id);
                                  setRejectConfirmOpen(true);
                                }
                              }}
                              disabled={log.status !== "pending" && log.status !== "draft" && log.status !== "pending_secondary_approval"}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                (log.status === "rejected" || log.status === "pending_secondary_approval")
                                  ? ""
                                  : "opacity-40 cursor-not-allowed"
                              )}
                              title={log.status === "rejected" || log.status === "pending_secondary_approval" ? "Edit entry" : "Edit only available after reject"}
                              onClick={() => {
                                if (log.status === "rejected" || log.status === "pending_secondary_approval") handleEditLog(log);
                              }}
                              disabled={log.status !== "rejected" && log.status !== "pending_secondary_approval"}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View history (old/new values)"
                              asChild
                            >
                              <Link
                                to={`/reports?tab=audit-trail&object_type=chemical_log&object_id=${log.id}`}
                              >
                                <History className="w-4 h-4" />
                              </Link>
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete entry"
                          onClick={() => handleDelete(log.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      {/* Step 1: Approve confirmation alert */}
      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedLogIds.length <= 1
                ? "Are you sure you want to approve this chemical entry? This action cannot be undone."
                : `Are you sure you want to approve these ${selectedLogIds.length} chemical entries? This action cannot be undone.`}
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

      {/* Step 2: Mandatory comment */}
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
              <Label htmlFor="approval-comment-chemical">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="approval-comment-chemical"
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Enter approval comment..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
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
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={async () => {
                  const comment = approvalComment.trim();
                  if (!comment) {
                    toast.error("Comment is required for approval");
                    return;
                  }
                  const ids = [...selectedLogIds];
                  if (ids.length === 0) return;
                  if (ids.length === 1) {
                    handleApprove(ids[0], comment);
                    setSelectedLogIds([]);
                    return;
                  }
                  try {
                    for (const id of ids) {
                      await chemicalPrepAPI.approve(id, "approve", comment);
                    }
                    setApproveCommentOpen(false);
                    setApprovalComment("");
                    setSelectedLogIds([]);
                    await refreshLogs();
                    toast.success(`${ids.length} chemical entries approved successfully.`);
                  } catch (error: any) {
                    console.error("Error approving chemical entries:", error);
                    toast.error(error?.response?.data?.error || error?.message || "Failed to approve some entries");
                  }
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
              Are you sure you want to reject this chemical entry? This action cannot be undone.
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

      {/* Reject: Step 2 – Mandatory comment */}
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
            <div className="space-y-2">
              <Label htmlFor="reject-comment">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="reject-comment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Enter rejection comment..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
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
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={() => {
                  const comment = rejectComment.trim();
                  if (!comment) {
                    toast.error("Comment is required for rejection");
                    return;
                  }
                  if (selectedLogId) {
                    handleReject(selectedLogId, comment);
                    setSelectedLogId(null);
                  }
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChemicalLogBookPage;

