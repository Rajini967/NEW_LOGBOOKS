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
import { boilerLogAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Clock, Thermometer, Gauge, Save, Filter, X, Plus, Trash2, CheckCircle, XCircle, Edit, History } from "lucide-react";
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

const boilerLimits = {
  feedWaterTemp: { min: 50, unit: "°C", type: "NLT" as const },
  oilTemp: { min: 50, unit: "°C", type: "NLT" as const },
  steamTemp: { min: 150, unit: "°C", type: "NLT" as const },
  steamPressure: { min: 6, unit: "bar", type: "NLT" as const },
  foPreHeaterTemp: { min: 60, max: 70, unit: "°C", type: "range" as const },
  burnerOilPressure: { min: 18, max: 25, unit: "kg/cm²", type: "range" as const },
  burnerHeaterTemp: { min: 110, max: 130, unit: "°C", type: "range" as const },
  boilerSteamPressure: { min: 5, unit: "kg/cm²", type: "NLT" as const },
  stackTemperature: { min: 180, max: 250, unit: "°C", type: "range" as const },
  steamPressureAfterPrv: { min: 5, unit: "kg/cm²", type: "NLT" as const },
  feedWaterHardnessPpm: { max: 5, unit: "PPM", type: "NMT" as const },
  feedWaterTdsPpm: { max: 700, unit: "PPM", type: "NMT" as const },
};

type BoilerLimitField = keyof typeof boilerLimits;

interface BoilerLog {
  id: string;
  equipmentId: string;
  date: string;
  time: string;
  feedWaterTemp: number;
  oilTemp: number;
  steamTemp: number;
  steamPressure: number;
  steamFlowLPH?: number;
  foHsdNgDayTankLevel?: number;
  feedWaterTankLevel?: number;
  foPreHeaterTemp?: number;
  burnerOilPressure?: number;
  burnerHeaterTemp?: number;
  boilerSteamPressure?: number;
  stackTemperature?: number;
  steamPressureAfterPrv?: number;
  feedWaterHardnessPpm?: number;
  feedWaterTdsPpm?: number;
  foHsdNgConsumption?: number;
  mobreyFunctioning?: string;
  manualBlowdownTime?: string;
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

const BoilerLogBookPage: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<BoilerLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<BoilerLog[]>([]);
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
    equipmentId: "",
    feedWaterTemp: "",
    oilTemp: "",
    steamTemp: "",
    steamPressure: "",
    steamFlowLPH: "",
    foHsdNgDayTankLevel: "",
    feedWaterTankLevel: "",
    foPreHeaterTemp: "",
    burnerOilPressure: "",
    burnerHeaterTemp: "",
    boilerSteamPressure: "",
    stackTemperature: "",
    steamPressureAfterPrv: "",
    feedWaterHardnessPpm: "",
    feedWaterTdsPpm: "",
    foHsdNgConsumption: "",
    mobreyFunctioning: "",
    manualBlowdownTime: "",
    remarks: "",
    date: "",
    time: "",
  });

  const isFormValueOutOfLimit = (field: BoilerLimitField, rawValue: string): boolean => {
    if (!rawValue) return false;
    const limit = boilerLimits[field];
    if (!limit) return false;
    const value = parseFloat(rawValue);
    if (Number.isNaN(value)) return false;
    if (limit.type === "NMT" && limit.max !== undefined) return value > limit.max;
    if (limit.type === "NLT" && limit.min !== undefined) return value < limit.min;
    if (limit.type === "range" && limit.min !== undefined && limit.max !== undefined) {
      return value < limit.min || value > limit.max;
    }
    return false;
  };

  const getLimitErrorMessage = (field: BoilerLimitField): string | null => {
    const limit = boilerLimits[field];
    if (!limit) return null;
    if (limit.type === "NMT" && limit.max !== undefined) {
      return `Value must be not more than ${limit.max} ${limit.unit}.`;
    }
    if (limit.type === "NLT" && limit.min !== undefined) {
      return `Value must be not less than ${limit.min} ${limit.unit}.`;
    }
    if (limit.type === "range" && limit.min !== undefined && limit.max !== undefined) {
      return `Value must be between ${limit.min} and ${limit.max} ${limit.unit}.`;
    }
    return null;
  };

  const isValueOutOfLimit = (log: BoilerLog, field: BoilerLimitField, value?: number): boolean => {
    if (value === undefined || value === null) return false;
    const limit = boilerLimits[field];
    if (!limit) return false;
    if (limit.type === "NMT" && limit.max !== undefined) return value > limit.max;
    if (limit.type === "NLT" && limit.min !== undefined) return value < limit.min;
    if (limit.type === "range" && limit.min !== undefined && limit.max !== undefined) {
      return value < limit.min || value > limit.max;
    }
    return false;
  };

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    status: "all" as "all" | "pending" | "approved" | "rejected" | "pending_secondary_approval",
    equipmentId: "",
    checkedBy: "",
    fromTime: "",
    toTime: "",
  });

  const refreshLogs = async () => {
    try {
      setIsLoading(true);
      const boilerLogs = await boilerLogAPI.list().catch((err) => {
        console.error("Error fetching boiler logs:", err);
        return [];
      });

      const allLogs: BoilerLog[] = [];
      boilerLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentId: log.equipment_id,
          date: format(timestamp, "yyyy-MM-dd"),
          time: format(timestamp, "HH:mm:ss"),
          feedWaterTemp: log.feed_water_temp,
          oilTemp: log.oil_temp,
          steamTemp: log.steam_temp,
          steamPressure: log.steam_pressure,
          steamFlowLPH: log.steam_flow_lph ?? undefined,
          foHsdNgDayTankLevel: log.fo_hsd_ng_day_tank_level ?? undefined,
          feedWaterTankLevel: log.feed_water_tank_level ?? undefined,
          foPreHeaterTemp: log.fo_pre_heater_temp ?? undefined,
          burnerOilPressure: log.burner_oil_pressure ?? undefined,
          burnerHeaterTemp: log.burner_heater_temp ?? undefined,
          boilerSteamPressure: log.boiler_steam_pressure ?? undefined,
          stackTemperature: log.stack_temperature ?? undefined,
          steamPressureAfterPrv: log.steam_pressure_after_prv ?? undefined,
          feedWaterHardnessPpm: log.feed_water_hardness_ppm ?? undefined,
          feedWaterTdsPpm: log.feed_water_tds_ppm ?? undefined,
          foHsdNgConsumption: log.fo_hsd_ng_consumption ?? undefined,
          mobreyFunctioning: log.mobrey_functioning ?? undefined,
          manualBlowdownTime: log.manual_blowdown_time ?? undefined,
          remarks: log.remarks || "",
          comment: log.comment || "",
          checkedBy: log.operator_name,
          timestamp,
          status: log.status as BoilerLog["status"],
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
      console.error("Error refreshing boiler logs:", error);
      toast.error("Failed to refresh boiler log entries");
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
    if (filters.equipmentId) {
      result = result.filter((log) =>
        log.equipmentId.toLowerCase().includes(filters.equipmentId.toLowerCase()),
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
      equipmentId: "",
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
      if (!formData.equipmentId) {
        toast.error("Please select Equipment ID.");
        return;
      }
      const numericFields: { key: keyof typeof formData; label: string }[] = [
        { key: "feedWaterTemp", label: "Feed water temp" },
        { key: "oilTemp", label: "Oil temp" },
        { key: "steamTemp", label: "Steam temp" },
        { key: "steamPressure", label: "Steam pressure" },
      ];
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

      const logData: Record<string, unknown> = {
        equipment_id: formData.equipmentId,
        feed_water_temp: parseFloat(formData.feedWaterTemp),
        oil_temp: parseFloat(formData.oilTemp),
        steam_temp: parseFloat(formData.steamTemp),
        steam_pressure: parseFloat(formData.steamPressure),
        steam_flow_lph: formData.steamFlowLPH ? parseFloat(formData.steamFlowLPH) : undefined,
        fo_hsd_ng_day_tank_level: formData.foHsdNgDayTankLevel ? parseFloat(formData.foHsdNgDayTankLevel) : undefined,
        feed_water_tank_level: formData.feedWaterTankLevel ? parseFloat(formData.feedWaterTankLevel) : undefined,
        fo_pre_heater_temp: formData.foPreHeaterTemp ? parseFloat(formData.foPreHeaterTemp) : undefined,
        burner_oil_pressure: formData.burnerOilPressure ? parseFloat(formData.burnerOilPressure) : undefined,
        burner_heater_temp: formData.burnerHeaterTemp ? parseFloat(formData.burnerHeaterTemp) : undefined,
        boiler_steam_pressure: formData.boilerSteamPressure ? parseFloat(formData.boilerSteamPressure) : undefined,
        stack_temperature: formData.stackTemperature ? parseFloat(formData.stackTemperature) : undefined,
        steam_pressure_after_prv: formData.steamPressureAfterPrv ? parseFloat(formData.steamPressureAfterPrv) : undefined,
        feed_water_hardness_ppm: formData.feedWaterHardnessPpm ? parseFloat(formData.feedWaterHardnessPpm) : undefined,
        feed_water_tds_ppm: formData.feedWaterTdsPpm ? parseFloat(formData.feedWaterTdsPpm) : undefined,
        fo_hsd_ng_consumption: formData.foHsdNgConsumption ? parseFloat(formData.foHsdNgConsumption) : undefined,
        mobrey_functioning: formData.mobreyFunctioning || undefined,
        manual_blowdown_time: formData.manualBlowdownTime || undefined,
        remarks: formData.remarks || undefined,
      };
      const editingBoilerLog = editingLogId ? logs.find((l) => l.id === editingLogId) : null;
      const canChangeTimestamp =
        editingBoilerLog &&
        (editingBoilerLog.status === "rejected" || editingBoilerLog.status === "pending_secondary_approval");
      if (canChangeTimestamp && formData.date && formData.time) {
        (logData as Record<string, unknown>).timestamp = new Date(`${formData.date}T${formData.time}`).toISOString();
      }
      if (editingLogId && editingBoilerLog) {
        const isCorrection =
          (editingBoilerLog.status === "rejected" || editingBoilerLog.status === "pending_secondary_approval") &&
          user?.role !== "operator";
        if (isCorrection) {
          await boilerLogAPI.correct(editingLogId, logData as any);
          toast.success("Boiler entry corrected as new entry.");
        } else {
          await boilerLogAPI.update(editingLogId, logData as any);
          toast.success("Boiler entry updated successfully.");
        }
        setEditingLogId(null);
        setFormData({
          equipmentId: "",
          feedWaterTemp: "",
          oilTemp: "",
          steamTemp: "",
          steamPressure: "",
          steamFlowLPH: "",
          foHsdNgDayTankLevel: "",
          feedWaterTankLevel: "",
          foPreHeaterTemp: "",
          burnerOilPressure: "",
          burnerHeaterTemp: "",
          boilerSteamPressure: "",
          stackTemperature: "",
          steamPressureAfterPrv: "",
          feedWaterHardnessPpm: "",
          feedWaterTdsPpm: "",
          foHsdNgConsumption: "",
          mobreyFunctioning: "",
          manualBlowdownTime: "",
          remarks: "",
          date: "",
          time: "",
        });
        setIsDialogOpen(false);
        await refreshLogs();
      } else {
        await boilerLogAPI.create(logData as any);
        toast.success("Boiler entry saved successfully");

        setFormData({
          equipmentId: "",
          feedWaterTemp: "",
          oilTemp: "",
          steamTemp: "",
          steamPressure: "",
          steamFlowLPH: "",
          foHsdNgDayTankLevel: "",
          feedWaterTankLevel: "",
          foPreHeaterTemp: "",
          burnerOilPressure: "",
          burnerHeaterTemp: "",
          boilerSteamPressure: "",
          stackTemperature: "",
          steamPressureAfterPrv: "",
          feedWaterHardnessPpm: "",
          feedWaterTdsPpm: "",
          foHsdNgConsumption: "",
          mobreyFunctioning: "",
          manualBlowdownTime: "",
          remarks: "",
          date: "",
          time: "",
        });
        setIsDialogOpen(false);
        await refreshLogs();
      }
    } catch (error: any) {
      console.error("Error saving boiler entry:", error);
      toast.error(error?.message || "Failed to save boiler entry");
    }
  };

  const handleSaveComment = async (logId: string, comment: string) => {
    if (editingCommentLogId !== logId) return;
    setEditingCommentLogId(null);
    try {
      await boilerLogAPI.patch(logId, { comment: comment || "" });
      toast.success("Comment updated");
      await refreshLogs();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail?.[0] || error?.message || "Failed to update comment");
      setEditingCommentLogId(logId);
      setEditingCommentValue(comment);
    }
  };

  const handleEditLog = (log: BoilerLog) => {
    setEditingLogId(log.id);
    setFormData({
      equipmentId: log.equipmentId ?? "",
      feedWaterTemp: log.feedWaterTemp != null ? String(log.feedWaterTemp) : "",
      oilTemp: log.oilTemp != null ? String(log.oilTemp) : "",
      steamTemp: log.steamTemp != null ? String(log.steamTemp) : "",
      steamPressure: log.steamPressure != null ? String(log.steamPressure) : "",
      steamFlowLPH: log.steamFlowLPH != null ? String(log.steamFlowLPH) : "",
      foHsdNgDayTankLevel: log.foHsdNgDayTankLevel != null ? String(log.foHsdNgDayTankLevel) : "",
      feedWaterTankLevel: log.feedWaterTankLevel != null ? String(log.feedWaterTankLevel) : "",
      foPreHeaterTemp: log.foPreHeaterTemp != null ? String(log.foPreHeaterTemp) : "",
      burnerOilPressure: log.burnerOilPressure != null ? String(log.burnerOilPressure) : "",
      burnerHeaterTemp: log.burnerHeaterTemp != null ? String(log.burnerHeaterTemp) : "",
      boilerSteamPressure: log.boilerSteamPressure != null ? String(log.boilerSteamPressure) : "",
      stackTemperature: log.stackTemperature != null ? String(log.stackTemperature) : "",
      steamPressureAfterPrv: log.steamPressureAfterPrv != null ? String(log.steamPressureAfterPrv) : "",
      feedWaterHardnessPpm: log.feedWaterHardnessPpm != null ? String(log.feedWaterHardnessPpm) : "",
      feedWaterTdsPpm: log.feedWaterTdsPpm != null ? String(log.feedWaterTdsPpm) : "",
      foHsdNgConsumption: log.foHsdNgConsumption != null ? String(log.foHsdNgConsumption) : "",
      mobreyFunctioning: log.mobreyFunctioning ?? "",
      manualBlowdownTime: log.manualBlowdownTime ?? "",
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
      await boilerLogAPI.approve(id, "approve", remarks);
      toast.success("Boiler entry approved successfully");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error approving boiler entry:", error);
      toast.error(error?.response?.data?.error || error?.message || "Failed to approve boiler entry");
    }
  };

  const handleReject = async (id: string, remarks: string) => {
    setRejectCommentOpen(false);
    setRejectComment("");
    try {
      await boilerLogAPI.approve(id, "reject", remarks);
      toast.error("Boiler entry rejected");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error rejecting boiler entry:", error);
      toast.error(error?.response?.data?.remarks?.[0] || error?.message || "Failed to reject boiler entry");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry? This action cannot be undone.")) {
      return;
    }
    try {
      await boilerLogAPI.delete(id);
      toast.success("Boiler entry deleted");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error deleting boiler entry:", error);
      toast.error(error?.message || "Failed to delete boiler entry");
    }
  };

  return (
    <>
      <Header
        title="Boiler Log Book"
        subtitle="Manage boiler log entries"
      />
      <main className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              Record and review boiler operating parameters.
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
                    Filter Boiler Log Entries
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
                    <Label className="text-base font-semibold">Equipment ID</Label>
                    <Input
                      type="text"
                      value={filters.equipmentId}
                      onChange={(e) => setFilters({ ...filters, equipmentId: e.target.value })}
                      placeholder="e.g., BL-001"
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
                  <DialogTitle>{editingLogId ? "Edit Boiler Entry" : "New E Log Book Entry"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(), "PPpp")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checked By:{" "}
                        {user?.name || user?.email || "Unknown"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Equipment Type *</Label>
                      <Input value="Boiler" disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Equipment ID *</Label>
                      <Input
                        type="text"
                        value={formData.equipmentId}
                        onChange={(e) =>
                          setFormData({ ...formData, equipmentId: e.target.value })
                        }
                        placeholder="e.g., BL-001"
                      />
                    </div>
                  </div>

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

                  {/* Hourly Parameters */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold border-b pb-2">Hourly Parameters</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>FO/HSD/NG Day Tank Level <span className="text-muted-foreground text-xs">(Ltr)</span></Label>
                        <Input type="number" step="0.1" min={0} value={formData.foHsdNgDayTankLevel} onChange={(e) => setFormData({ ...formData, foHsdNgDayTankLevel: e.target.value })} placeholder="e.g., 500" />
                      </div>
                      <div className="space-y-2">
                        <Label>Feed Water Tank Level <span className="text-muted-foreground text-xs">(KL)</span></Label>
                        <Input type="number" step="0.01" min={0} value={formData.feedWaterTankLevel} onChange={(e) => setFormData({ ...formData, feedWaterTankLevel: e.target.value })} placeholder="e.g., 2.5" />
                      </div>
                      <div className="space-y-2">
                        <Label>FO Pre Heater Temp <span className="text-muted-foreground text-xs">(60–70°C)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.foPreHeaterTemp}
                          onChange={(e) => setFormData({ ...formData, foPreHeaterTemp: e.target.value })}
                          className={cn(isFormValueOutOfLimit("foPreHeaterTemp", formData.foPreHeaterTemp) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 65"
                        />
                        {isFormValueOutOfLimit("foPreHeaterTemp", formData.foPreHeaterTemp) && <p className="text-xs text-destructive">{getLimitErrorMessage("foPreHeaterTemp")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Burner Oil Pressure <span className="text-muted-foreground text-xs">(18–25 kg/cm²)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.burnerOilPressure}
                          onChange={(e) => setFormData({ ...formData, burnerOilPressure: e.target.value })}
                          className={cn(isFormValueOutOfLimit("burnerOilPressure", formData.burnerOilPressure) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 22"
                        />
                        {isFormValueOutOfLimit("burnerOilPressure", formData.burnerOilPressure) && <p className="text-xs text-destructive">{getLimitErrorMessage("burnerOilPressure")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Burner Heater Temp <span className="text-muted-foreground text-xs">(120±10°C)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.burnerHeaterTemp}
                          onChange={(e) => setFormData({ ...formData, burnerHeaterTemp: e.target.value })}
                          className={cn(isFormValueOutOfLimit("burnerHeaterTemp", formData.burnerHeaterTemp) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 120"
                        />
                        {isFormValueOutOfLimit("burnerHeaterTemp", formData.burnerHeaterTemp) && <p className="text-xs text-destructive">{getLimitErrorMessage("burnerHeaterTemp")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Boiler Steam Pressure <span className="text-muted-foreground text-xs">(NLT 5 kg/cm²)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.boilerSteamPressure}
                          onChange={(e) => setFormData({ ...formData, boilerSteamPressure: e.target.value })}
                          className={cn(isFormValueOutOfLimit("boilerSteamPressure", formData.boilerSteamPressure) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 6"
                        />
                        {isFormValueOutOfLimit("boilerSteamPressure", formData.boilerSteamPressure) && <p className="text-xs text-destructive">{getLimitErrorMessage("boilerSteamPressure")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Stack Temperature <span className="text-muted-foreground text-xs">(180–250°C)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.stackTemperature}
                          onChange={(e) => setFormData({ ...formData, stackTemperature: e.target.value })}
                          className={cn(isFormValueOutOfLimit("stackTemperature", formData.stackTemperature) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 210"
                        />
                        {isFormValueOutOfLimit("stackTemperature", formData.stackTemperature) && <p className="text-xs text-destructive">{getLimitErrorMessage("stackTemperature")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Steam Pressure after PRV <span className="text-muted-foreground text-xs">(NLT 5 kg/cm²)</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamPressureAfterPrv}
                          onChange={(e) => setFormData({ ...formData, steamPressureAfterPrv: e.target.value })}
                          className={cn(isFormValueOutOfLimit("steamPressureAfterPrv", formData.steamPressureAfterPrv) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 5.5"
                        />
                        {isFormValueOutOfLimit("steamPressureAfterPrv", formData.steamPressureAfterPrv) && <p className="text-xs text-destructive">{getLimitErrorMessage("steamPressureAfterPrv")}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <Label>Feed Water Temp <span className="text-muted-foreground text-xs">(°C, NLT {boilerLimits.feedWaterTemp.min})</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.feedWaterTemp}
                          onChange={(e) => setFormData({ ...formData, feedWaterTemp: e.target.value })}
                          className={cn(isFormValueOutOfLimit("feedWaterTemp", formData.feedWaterTemp) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 50"
                        />
                        {isFormValueOutOfLimit("feedWaterTemp", formData.feedWaterTemp) && <p className="text-xs text-destructive">{getLimitErrorMessage("feedWaterTemp")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Oil Temp <span className="text-muted-foreground text-xs">(°C, NLT {boilerLimits.oilTemp.min})</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.oilTemp}
                          onChange={(e) => setFormData({ ...formData, oilTemp: e.target.value })}
                          className={cn(isFormValueOutOfLimit("oilTemp", formData.oilTemp) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 50"
                        />
                        {isFormValueOutOfLimit("oilTemp", formData.oilTemp) && <p className="text-xs text-destructive">{getLimitErrorMessage("oilTemp")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Steam Temp <span className="text-muted-foreground text-xs">(°C, NLT {boilerLimits.steamTemp.min})</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamTemp}
                          onChange={(e) => setFormData({ ...formData, steamTemp: e.target.value })}
                          className={cn(isFormValueOutOfLimit("steamTemp", formData.steamTemp) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 150"
                        />
                        {isFormValueOutOfLimit("steamTemp", formData.steamTemp) && <p className="text-xs text-destructive">{getLimitErrorMessage("steamTemp")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Steam Pressure <span className="text-muted-foreground text-xs">(bar, NLT {boilerLimits.steamPressure.min})</span></Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamPressure}
                          onChange={(e) => setFormData({ ...formData, steamPressure: e.target.value })}
                          className={cn(isFormValueOutOfLimit("steamPressure", formData.steamPressure) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 6"
                        />
                        {isFormValueOutOfLimit("steamPressure", formData.steamPressure) && <p className="text-xs text-destructive">{getLimitErrorMessage("steamPressure")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Steam Flow LPH <span className="text-muted-foreground text-xs">(LPH)</span></Label>
                        <Input type="number" step="1" value={formData.steamFlowLPH} onChange={(e) => setFormData({ ...formData, steamFlowLPH: e.target.value })} placeholder="e.g., 10000" />
                      </div>
                    </div>
                  </div>

                  {/* Shift Parameters */}
                  <div className="space-y-3 pt-4 mt-2 border-t">
                    <h3 className="text-sm font-semibold border-b pb-2">Shift Parameters</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Feed Water Hardness <span className="text-muted-foreground text-xs">(NMT 5 PPM)</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={formData.feedWaterHardnessPpm}
                          onChange={(e) => setFormData({ ...formData, feedWaterHardnessPpm: e.target.value })}
                          className={cn(isFormValueOutOfLimit("feedWaterHardnessPpm", formData.feedWaterHardnessPpm) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 3"
                        />
                        {isFormValueOutOfLimit("feedWaterHardnessPpm", formData.feedWaterHardnessPpm) && <p className="text-xs text-destructive">{getLimitErrorMessage("feedWaterHardnessPpm")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Feed Water TDS <span className="text-muted-foreground text-xs">(NMT 700 PPM)</span></Label>
                        <Input
                          type="number"
                          step="1"
                          min={0}
                          value={formData.feedWaterTdsPpm}
                          onChange={(e) => setFormData({ ...formData, feedWaterTdsPpm: e.target.value })}
                          className={cn(isFormValueOutOfLimit("feedWaterTdsPpm", formData.feedWaterTdsPpm) && "border-destructive bg-destructive/5 text-destructive font-semibold")}
                          placeholder="e.g., 500"
                        />
                        {isFormValueOutOfLimit("feedWaterTdsPpm", formData.feedWaterTdsPpm) && <p className="text-xs text-destructive">{getLimitErrorMessage("feedWaterTdsPpm")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>FO/HSD/NG Consumption <span className="text-muted-foreground text-xs">(Ltr, Ending of Shift)</span></Label>
                        <Input type="number" step="0.1" min={0} value={formData.foHsdNgConsumption} onChange={(e) => setFormData({ ...formData, foHsdNgConsumption: e.target.value })} placeholder="e.g., 150" />
                      </div>
                      <div className="space-y-2">
                        <Label>Mobrey Functioning</Label>
                        <Select value={formData.mobreyFunctioning} onValueChange={(v) => setFormData({ ...formData, mobreyFunctioning: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Yes/No" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Yes">Yes</SelectItem>
                            <SelectItem value="No">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Manual Blow Down Time <span className="text-muted-foreground text-xs">(e.g. 14:30)</span></Label>
                        <Input type="time" value={formData.manualBlowdownTime} onChange={(e) => setFormData({ ...formData, manualBlowdownTime: e.target.value })} placeholder="14:30" />
                      </div>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-3 pt-4 mt-2 border-t">
                    <h3 className="text-sm font-semibold border-b pb-2">Remarks</h3>
                    <Textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      placeholder="Add any observations or notes..."
                    />
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

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="border-b px-4 py-2 flex justify-between items-center">
            <span className="text-sm font-medium">
              {isLoading ? "Loading boiler logs..." : `${filteredLogs.length} entries`}
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
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left w-12">
                    {pendingDraftIds.length > 0 && user?.role !== "operator" && (
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAllPending}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Equipment</th>
                  <th className="px-3 py-2 text-left">Readings</th>
                  <th className="px-3 py-2 text-left">Remarks</th>
                  <th className="px-3 py-2 text-left">Comment</th>
                  <th className="px-3 py-2 text-left">Checked By</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No Boiler Log Book entries found.
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
                    <td className="px-3 py-2">{log.equipmentId}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1 text-sm">
                        <div>
                          <span className="font-semibold">Feed:</span>{" "}
                          <span className={cn(isValueOutOfLimit(log, "feedWaterTemp", log.feedWaterTemp) && "text-destructive font-bold")}>
                            {log.feedWaterTemp}°C
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">Oil:</span>{" "}
                          <span className={cn(isValueOutOfLimit(log, "oilTemp", log.oilTemp) && "text-destructive font-bold")}>
                            {log.oilTemp}°C
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">Steam:</span>{" "}
                          <span className={cn(isValueOutOfLimit(log, "steamTemp", log.steamTemp) && "text-destructive font-bold")}>
                            {log.steamTemp}
                          </span>
                          °C @{" "}
                          <span className={cn(isValueOutOfLimit(log, "steamPressure", log.steamPressure) && "text-destructive font-bold")}>
                            {log.steamPressure}
                          </span>{" "}
                          bar
                        </div>
                        {log.steamFlowLPH !== undefined && (
                          <div>
                            <span className="font-semibold">Flow:</span> {log.steamFlowLPH} LPH
                          </div>
                        )}
                        {log.foHsdNgDayTankLevel !== undefined && (
                          <div>
                            <span className="font-semibold">Day Tank:</span> {log.foHsdNgDayTankLevel} Ltr
                          </div>
                        )}
                        {log.stackTemperature !== undefined && (
                          <div>
                            <span className="font-semibold">Stack:</span>{" "}
                            <span className={cn(isValueOutOfLimit(log, "stackTemperature", log.stackTemperature) && "text-destructive font-bold")}>
                              {log.stackTemperature}°C
                            </span>
                          </div>
                        )}
                        {log.mobreyFunctioning && (
                          <div>
                            <span className="font-semibold">Mobrey:</span> {log.mobreyFunctioning}
                          </div>
                        )}
                      </div>
                    </td>
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
                                to={`/reports?tab=audit-trail&object_type=boiler_log&object_id=${log.id}`}
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
                ? "Are you sure you want to approve this boiler entry? This action cannot be undone."
                : `Are you sure you want to approve these ${selectedLogIds.length} boiler entries? This action cannot be undone.`}
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
              <Label htmlFor="approval-comment-boiler">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="approval-comment-boiler"
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
                      await boilerLogAPI.approve(id, "approve", comment);
                    }
                    setApproveCommentOpen(false);
                    setApprovalComment("");
                    setSelectedLogIds([]);
                    await refreshLogs();
                    toast.success(`${ids.length} boiler entries approved successfully.`);
                  } catch (error: any) {
                    console.error("Error approving boiler entries:", error);
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
              Are you sure you want to reject this boiler entry? This action cannot be undone.
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

export default BoilerLogBookPage;

