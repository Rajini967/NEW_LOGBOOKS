import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { format, subDays } from "date-fns";
import { toast } from "@/lib/toast";
import { boilerLogAPI, briquetteLogAPI, equipmentAPI, equipmentCategoryAPI } from "@/lib/api";
import type { MissingSlotsEquipment, MissingSlotsRangeResponse, MissingSlotsResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { firstRequiredFieldError } from "@/lib/requiredFields";
import { canPatchEquipmentLogIntervalFromLogbook } from "@/lib/auth/role";
import { Link } from "react-router-dom";
import { Clock, Thermometer, Gauge, Droplets, Package, Save, Filter, X, Plus, Trash2, CheckCircle, XCircle, Edit, History, Eye } from "lucide-react";
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
import { EntryIntervalBadge } from "@/components/logbook/EntryIntervalBadge";
import { MissedReadingPopup } from "@/components/logbook/MissedReadingPopup";
import {
  type EquipmentMissInfo,
} from "@/lib/missed-reading";
import { MaintenanceTimingsSection } from "@/components/logbook/MaintenanceTimingsSection";
import type { MaintenanceTimingsValue } from "@/types/maintenance-timings";
import {
  type BoilerLikeLog,
  mapBoilerLogPayload,
  mapBoilerPreviousReadingPayload,
  mapBriquetteLogPayload,
} from "@/lib/logbookPayloadMappers";
import {
  useBoilerAndBriquetteLogsQuery,
  useBoilerAndBriquetteMissingSlotsQuery,
} from "@/hooks/useLogbookQueries";

const boilerLimits = {
  foHsdNgDayTankLevel: { min: 200, unit: "Ltr", type: "NLT" as const },
  feedWaterTankLevel: { min: 2, unit: "KL", type: "NLT" as const },
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

const BOILER_LIST_FIELDS: { key: keyof BoilerLog; label: string; unit: string }[] = [
  { key: "foHsdNgDayTankLevel", label: "Day Tank", unit: "Ltr" },
  { key: "feedWaterTankLevel", label: "Feed Tank", unit: "KL" },
  { key: "foPreHeaterTemp", label: "Pre Heater", unit: "°C" },
  { key: "burnerOilPressure", label: "Burner Oil P", unit: "kg/cm²" },
  { key: "burnerHeaterTemp", label: "Burner Heater", unit: "°C" },
  { key: "boilerSteamPressure", label: "Boiler Steam P", unit: "kg/cm²" },
  { key: "stackTemperature", label: "Stack", unit: "°C" },
  { key: "steamPressureAfterPrv", label: "Steam After PRV", unit: "kg/cm²" },
  { key: "feedWaterHardnessPpm", label: "Hardness", unit: "PPM" },
  { key: "feedWaterTdsPpm", label: "TDS", unit: "PPM" },
  { key: "foHsdNgConsumption", label: "Consumption", unit: "Ltr" },
  { key: "mobreyFunctioning", label: "Mobrey", unit: "" },
  { key: "manualBlowdownTime", label: "Blowdown Time", unit: "" },
  { key: "steamConsumptionKgHr", label: "Steam consumption", unit: "kg/hr" },
];

const BRIQUETTE_LIST_FIELDS: { key: keyof BoilerLog; label: string; unit?: string }[] = [
  { key: "steamPressure", label: "Steam pressure", unit: "kg/cm²" },
  { key: "furnacePressureMmwc", label: "Furnace pressure", unit: "mmWC" },
  { key: "idFanOpPercent", label: "ID fan O/P", unit: "%" },
  { key: "paDamperPosition1", label: "PA damper position 1", unit: "%" },
  { key: "paDamperPosition2", label: "PA damper position 2", unit: "%" },
  { key: "meteringScrewPercent", label: "Metering screw", unit: "%" },
  { key: "steamReadingTon", label: "Steam reading", unit: "Ton" },
  { key: "steamFlowKgHr", label: "Steam flow", unit: "kg/hr" },
  { key: "stackTemp", label: "Stack temp", unit: "°C" },
  { key: "furnaceTemp", label: "Furnace temp", unit: "°C" },
  { key: "hotAirTemp", label: "Hot air temp" },
  { key: "feedPump12", label: "Feed pump 1/2" },
  { key: "feedWaterPh", label: "Feed water pH" },
  { key: "feedWaterHardnessPpm", label: "Feed water hardness", unit: "PPM" },
  { key: "feedWaterTdsPpm", label: "Feed water TDS", unit: "PPM" },
  { key: "boilerWaterPh", label: "Boiler water pH" },
  { key: "boilerWaterHardnessPpm", label: "Boiler water hardness", unit: "PPM" },
  { key: "boilerWaterTdsPpm", label: "Boiler water TDS", unit: "PPM" },
];

interface BoilerLog {
  id: string;
  equipmentType?: "boiler" | "briquette";
  equipmentId: string;
  date: string;
  time: string;
  /** Briquette logs */
  steamPressure?: number;
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
  dieselStockLiters?: number | null;
  dieselCostRupees?: number | null;
  furnaceOilStockLiters?: number | null;
  furnaceOilCostRupees?: number | null;
  brigadeStockKg?: number | null;
  brigadeCostRupees?: number | null;
  dailyPowerConsumptionKwh?: number | null;
  dailyWaterConsumptionLiters?: number | null;
  dailyChemicalConsumptionKg?: number | null;
  dailyDieselConsumptionLiters?: number | null;
  dailyFurnaceOilConsumptionLiters?: number | null;
  dailyBrigadeConsumptionKg?: number | null;
  steamConsumptionKgHr?: number | null;
  remarks: string;
  comment?: string;
  checkedBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  timestamp: Date;
  status: "pending" | "approved" | "rejected" | "draft" | "pending_secondary_approval";
  /** User who approved or rejected (rejector for rejected / pending_secondary_approval entries) */
  operator_id?: string;
  approved_by_id?: string;
  corrects_id?: string;
  has_corrections?: boolean;
  tolerance_status?: "none" | "within" | "outside";
  activity_type?: "operation" | "maintenance" | "shutdown";
  activity_from_date?: string | null;
  activity_to_date?: string | null;
  activity_from_time?: string | null;
  activity_to_time?: string | null;
  timeSlot?: string;
  furnacePressureMmwc?: number;
  idFanOpPercent?: number;
  paDamperPosition1?: number;
  paDamperPosition2?: number;
  meteringScrewPercent?: number;
  steamReadingTon?: number;
  steamFlowKgHr?: number;
  stackTemp?: number;
  furnaceTemp?: number;
  hotAirTemp?: string;
  feedPump12?: string;
  operatorSignDate?: string;
  verifiedSignDate?: string;
  feedWaterPh?: number;
  boilerWaterPh?: number;
  boilerWaterHardnessPpm?: number;
  boilerWaterTdsPpm?: number;
  totalSteamIn1Day?: string;
  totalSteamFlowRatio?: string;
}
type LogEntryIntervalType = "hourly" | "shift" | "daily";

const CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry.";

const normalizeHhMmSs = (value: string): string => {
  const v = (value || "").trim();
  if (!v) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
};

const buildAutoSignText = (nameOrEmail: string) => {
  return `${nameOrEmail || "Unknown"} - ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`;
};

const BoilerLogBookPage: React.FC = () => {
  const { user, sessionSettings } = useAuth();
  const submitLockRef = useRef(false);
  const [logs, setLogs] = useState<BoilerLog[]>([]);
  const [showMissedReadingPopup, setShowMissedReadingPopup] = useState(false);
  const [missedReadingNextDue, setMissedReadingNextDue] = useState<Date | null>(null);
  const [missedEquipments, setMissedEquipments] = useState<EquipmentMissInfo[] | null>(null);
  const [missingRangeFrom, setMissingRangeFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [missingRangeTo, setMissingRangeTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [missingRangeLoading, setMissingRangeLoading] = useState(false);
  const [missingRangeRefreshKey, setMissingRangeRefreshKey] = useState(0);
  const [missingRangeTotalSlots, setMissingRangeTotalSlots] = useState<number>(0);
  const [missingRangeGroups, setMissingRangeGroups] = useState<
    { date: string; totalMissingSlots: number; equipmentList: EquipmentMissInfo[] }[]
  >([]);
  const [missingRefreshKey, setMissingRefreshKey] = useState(0);
  const [filteredLogs, setFilteredLogs] = useState<BoilerLog[]>([]);
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
  const [readingsModalLogId, setReadingsModalLogId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [viewedReadingsLogIds, setViewedReadingsLogIds] = useState<Set<string>>(new Set());
  const [editedMaintenanceLogIds, setEditedMaintenanceLogIds] = useState<Set<string>>(new Set());
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const [isDeletingLog, setIsDeletingLog] = useState(false);
  const [equipmentOptions, setEquipmentOptions] = useState<
    {
      id: string;
      equipment_number: string;
      name: string;
      log_entry_interval?: string | null;
      shift_duration_hours?: number | null;
      tolerance_minutes?: number | null;
    }[]
  >([]);
  const [entryLogInterval, setEntryLogInterval] = useState<"" | LogEntryIntervalType>("");
  const [entryShiftDurationHours, setEntryShiftDurationHours] = useState<number | "">("");
  const [entryToleranceMinutes, setEntryToleranceMinutes] = useState<number | "">("");
  const [previousReadingsForEquipment, setPreviousReadingsForEquipment] = useState<BoilerLog[]>([]);
  const [previousReadingsLoading, setPreviousReadingsLoading] = useState(false);

  const [maintenanceTimings, setMaintenanceTimings] = useState<MaintenanceTimingsValue>({
    activityType: "operation",
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
  });
  const isReadingsApplicable = maintenanceTimings.activityType === "operation";

  const [formData, setFormData] = useState({
    equipmentType: "boiler" as const,
    fuelType: "fo" as "fo" | "briquette",
    equipmentId: "",
    steamPressure: "",
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
    dieselStockLiters: "",
    dieselCostRupees: "",
    furnaceOilStockLiters: "",
    furnaceOilCostRupees: "",
    brigadeStockKg: "",
    brigadeCostRupees: "",
    dailyPowerConsumptionKwh: "",
    dailyWaterConsumptionLiters: "",
    dailyChemicalConsumptionKg: "",
    dailyDieselConsumptionLiters: "",
    dailyFurnaceOilConsumptionLiters: "",
    dailyBrigadeConsumptionKg: "",
    steamConsumptionKgHr: "",
    timeSlot: "",
    furnacePressureMmwc: "",
    idFanOpPercent: "",
    paDamperPosition1: "",
    paDamperPosition2: "",
    meteringScrewPercent: "",
    steamReadingTon: "",
    steamFlowKgHr: "",
    stackTemp: "",
    furnaceTemp: "",
    hotAirTemp: "",
    feedPump12: "",
    operatorSignDate: "",
    verifiedSignDate: "",
    feedWaterPh: "",
    boilerWaterPh: "",
    boilerWaterHardnessPpm: "",
    boilerWaterTdsPpm: "",
    totalSteamIn1Day: "",
    totalSteamFlowRatio: "",
    remarks: "",
    date: "",
    time: "",
  });

  useEffect(() => {
    if (!isDialogOpen || editingLogId || formData.fuelType !== "briquette") return;
    const actor = (user?.name || user?.email || "Unknown").trim();
    setFormData((prev) => {
      const next = { ...prev };
      if (!next.operatorSignDate) next.operatorSignDate = buildAutoSignText(actor);
      if (!next.verifiedSignDate) next.verifiedSignDate = buildAutoSignText(actor);
      return next;
    });
  }, [isDialogOpen, editingLogId, formData.fuelType, user?.name, user?.email]);

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

  const hasOutOfLimitReadings = (log: BoilerLog): boolean => {
    const fields = Object.keys(boilerLimits) as BoilerLimitField[];
    return fields.some((field) => {
      const raw = (log as any)[field];
      if (raw === undefined || raw === null || raw === "") return false;
      const value = Number(raw);
      if (Number.isNaN(value)) return false;
      return isValueOutOfLimit(log, field, value);
    });
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
  const selectedDate = filters.fromDate || format(new Date(), "yyyy-MM-dd");
  const { boiler, briquette } = useBoilerAndBriquetteLogsQuery();
  const { boilerMissing, briquetteMissing } = useBoilerAndBriquetteMissingSlotsQuery(
    selectedDate,
    missingRefreshKey,
  );
  const isLoading =
    boiler.isLoading ||
    briquette.isLoading ||
    boiler.isFetching ||
    briquette.isFetching;

  useEffect(() => {
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const boilerCategory = categories?.find((c) => {
          const n = (c.name || "").toLowerCase().trim();
          return n === "boiler" || n === "boilers";
        });
        const list = boilerCategory
          ? await equipmentAPI.list({ category: boilerCategory.id })
          : await equipmentAPI.list();
        const options = (list || [])
          .filter((e: any) => e?.is_active !== false && e?.status === "approved")
          .map((e: any) => ({
            id: e.id,
            equipment_number: e.equipment_number,
            name: e.name || "",
            log_entry_interval: e.log_entry_interval ?? null,
            shift_duration_hours: e.shift_duration_hours ?? null,
            tolerance_minutes: e.tolerance_minutes ?? null,
          }));
        setEquipmentOptions(options);
      } catch (error) {
        console.error("Failed to load boiler equipment list", error);
      }
    })();
  }, []);

  const refreshLogs = async () => {
    try {
      const [boilerResult, briquetteResult] = await Promise.all([
        boiler.refetch(),
        briquette.refetch(),
      ]);
      const boilerLogs = boilerResult.data ?? [];
      const briquetteLogs = briquetteResult.data ?? [];

      const merged: BoilerLog[] = [
        ...boilerLogs.map((log: BoilerLikeLog) => mapBoilerLogPayload(log)),
        ...briquetteLogs.map((log: BoilerLikeLog) => mapBriquetteLogPayload(log)),
      ];
      const byId = new Map<string, BoilerLog>();
      for (const log of merged) {
        const id = String(log.id || "").trim();
        if (id && !byId.has(id)) byId.set(id, log);
      }
      const allLogs = Array.from(byId.values());

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      setFilteredLogs(allLogs);
      setMissingRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error refreshing boiler logs:", error);
      toast.error("Failed to refresh boiler log entries");
    }
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  // After equipment selection, fetch and show previous readings with entered-by
  // scoped to the selected equipment type (boiler/briquette).
  useEffect(() => {
    if (!formData.equipmentId) {
      setPreviousReadingsForEquipment([]);
      return;
    }
    let cancelled = false;
    setPreviousReadingsLoading(true);
    const listApi = formData.fuelType === "briquette" ? briquetteLogAPI.list : boilerLogAPI.list;
    listApi({ equipment_id: formData.equipmentId })
      .then((raw: any[]) => {
        if (cancelled) return;
        const currentType = formData.fuelType === "briquette" ? "briquette" : "boiler";
        const list: BoilerLog[] = raw
          .slice(0, 10)
          .map((log: BoilerLikeLog) => mapBoilerPreviousReadingPayload(log, currentType));
        setPreviousReadingsForEquipment(list);
      })
      .catch(() => {
        if (!cancelled) setPreviousReadingsForEquipment([]);
      })
      .finally(() => {
        if (!cancelled) setPreviousReadingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.equipmentId, formData.fuelType]);

  useEffect(() => {
    if (!boilerMissing.data && !briquetteMissing.data) return;
    if (boilerMissing.error || briquetteMissing.error) {
      setMissedEquipments(null);
      setShowMissedReadingPopup(false);
      setMissedReadingNextDue(null);
      return;
    }
    const boilerPayload = boilerMissing.data;
    const briquettePayload = briquetteMissing.data;
    const boilerMissed: EquipmentMissInfo[] = (boilerPayload?.equipments || [])
          .filter((eq) => (eq.missing_slot_count || 0) > 0)
          .map((eq) => ({
            equipmentTypeLabel: "Boiler",
            equipmentId: eq.equipment_id,
            equipmentName: eq.equipment_name,
            lastTimestamp: null,
            nextDue: eq.next_due ? new Date(eq.next_due) : null,
            isMissed: (eq.missing_slot_count || 0) > 0,
            interval: eq.interval,
            shiftHours: eq.shift_duration_hours || 8,
            expectedSlotCount: eq.expected_slot_count,
            presentSlotCount: eq.present_slot_count,
            missingSlotCount: eq.missing_slot_count,
            missingSlotRanges: (eq.missing_slots || []).map((slot) => ({
              slotStart: new Date(slot.slot_start),
              slotEnd: new Date(slot.slot_end),
              label: slot.label,
            })),
          }));
    const briquetteMissed: EquipmentMissInfo[] = (briquettePayload?.equipments || [])
          .filter((eq) => (eq.missing_slot_count || 0) > 0)
          .map((eq) => ({
            equipmentTypeLabel: "Briquette",
            equipmentId: eq.equipment_id,
            equipmentName: eq.equipment_name,
            lastTimestamp: null,
            nextDue: eq.next_due ? new Date(eq.next_due) : null,
            isMissed: (eq.missing_slot_count || 0) > 0,
            interval: eq.interval,
            shiftHours: eq.shift_duration_hours || 8,
            expectedSlotCount: eq.expected_slot_count,
            presentSlotCount: eq.present_slot_count,
            missingSlotCount: eq.missing_slot_count,
            missingSlotRanges: (eq.missing_slots || []).map((slot) => ({
              slotStart: new Date(slot.slot_start),
              slotEnd: new Date(slot.slot_end),
              label: slot.label,
            })),
          }));
    const missedOnly: EquipmentMissInfo[] = [...boilerMissed, ...briquetteMissed];
    if (missedOnly.length > 0) {
      setMissedEquipments(missedOnly);
      const firstNext =
        missedOnly
          .map((m) => m.nextDue)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime())[0] || null;
      setMissedReadingNextDue(firstNext);
      return;
    }
    setMissedEquipments(null);
    setShowMissedReadingPopup(false);
    setMissedReadingNextDue(null);
  }, [boilerMissing.data, briquetteMissing.data, boilerMissing.error, briquetteMissing.error]);

  useEffect(() => {
    if (!showMissedReadingPopup) return;
    if (!missingRangeFrom || !missingRangeTo) return;
    if (missingRangeFrom > missingRangeTo) {
      setMissingRangeGroups([]);
      setMissingRangeTotalSlots(0);
      return;
    }

    const mapEquipment = (
      eq: MissingSlotsEquipment,
      equipmentTypeLabel: "Boiler" | "Briquette",
    ): EquipmentMissInfo => ({
      equipmentTypeLabel,
      equipmentId: eq.equipment_id,
      equipmentName: eq.equipment_name,
      lastTimestamp: eq.last_reading_timestamp ? new Date(eq.last_reading_timestamp) : null,
      nextDue: eq.next_due ? new Date(eq.next_due) : null,
      isMissed: (eq.missing_slot_count || 0) > 0,
      interval: eq.interval,
      shiftHours: eq.shift_duration_hours || 8,
      expectedSlotCount: eq.expected_slot_count,
      presentSlotCount: eq.present_slot_count,
      missingSlotCount: eq.missing_slot_count,
      missingSlotRanges: (eq.missing_slots || []).map((slot) => ({
        slotStart: new Date(slot.slot_start),
        slotEnd: new Date(slot.slot_end),
        label: slot.label,
      })),
    });

    const normalizeMissingPayload = (
      payload: MissingSlotsRangeResponse | MissingSlotsResponse,
      equipmentTypeLabel: "Boiler" | "Briquette",
    ) => {
      const groups =
        payload && typeof payload === "object" && "days" in payload
          ? (payload as MissingSlotsRangeResponse).days
              .map((day) => ({
                date: day.date,
                totalMissingSlots: day.total_missing_slots || 0,
                equipmentList: (day.equipments || [])
                  .filter((eq) => (eq.missing_slot_count || 0) > 0)
                  .map((eq) => mapEquipment(eq, equipmentTypeLabel)),
              }))
              .filter((group) => group.equipmentList.length > 0)
          : (() => {
              const single = payload as MissingSlotsResponse;
              const equipmentList = (single?.equipments || [])
                .filter((eq) => (eq.missing_slot_count || 0) > 0)
                .map((eq) => mapEquipment(eq, equipmentTypeLabel));
              return equipmentList.length
                ? [{ date: single.date, totalMissingSlots: single.total_missing_slots || 0, equipmentList }]
                : [];
            })();

      const totalMissingSlots =
        payload && typeof payload === "object" && "days" in payload
          ? (payload as MissingSlotsRangeResponse).total_missing_slots || 0
          : (payload as MissingSlotsResponse)?.total_missing_slots || 0;

      return { totalMissingSlots, groups };
    };

    setMissingRangeLoading(true);
    Promise.all([
      boilerLogAPI.missingSlots({ date_from: missingRangeFrom, date_to: missingRangeTo }),
      briquetteLogAPI.missingSlots({ date_from: missingRangeFrom, date_to: missingRangeTo }),
    ])
      .then(([boilerPayload, briquettePayload]) => {
        const boilerData = normalizeMissingPayload(
          boilerPayload as MissingSlotsRangeResponse | MissingSlotsResponse,
          "Boiler",
        );
        const briquetteData = normalizeMissingPayload(
          briquettePayload as MissingSlotsRangeResponse | MissingSlotsResponse,
          "Briquette",
        );

        const mergedByDate = new Map<
          string,
          { date: string; totalMissingSlots: number; equipmentList: EquipmentMissInfo[] }
        >();

        [...boilerData.groups, ...briquetteData.groups].forEach((group) => {
          const existing = mergedByDate.get(group.date);
          if (existing) {
            existing.totalMissingSlots += group.totalMissingSlots;
            existing.equipmentList.push(...group.equipmentList);
          } else {
            mergedByDate.set(group.date, {
              date: group.date,
              totalMissingSlots: group.totalMissingSlots,
              equipmentList: [...group.equipmentList],
            });
          }
        });

        const groups = Array.from(mergedByDate.values()).sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
        );
        setMissingRangeTotalSlots(boilerData.totalMissingSlots + briquetteData.totalMissingSlots);
        setMissingRangeGroups(groups);
      })
      .catch(() => {
        setMissingRangeTotalSlots(0);
        setMissingRangeGroups([]);
      })
      .finally(() => setMissingRangeLoading(false));
  }, [showMissedReadingPopup, missingRangeFrom, missingRangeTo, missingRangeRefreshKey]);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!formData.equipmentId) return;
    if (entryLogInterval !== "" || entryShiftDurationHours !== "" || entryToleranceMinutes !== "") return;
    const selectedEquipment = equipmentOptions.find(
      (eq) => eq.equipment_number === formData.equipmentId,
    );
    if (!selectedEquipment) return;
    setEntryLogInterval((selectedEquipment.log_entry_interval as LogEntryIntervalType) || "");
    setEntryShiftDurationHours(selectedEquipment.shift_duration_hours ?? "");
    setEntryToleranceMinutes(selectedEquipment.tolerance_minutes ?? "");
  }, [
    isDialogOpen,
    editingLogId,
    formData.equipmentId,
    equipmentOptions,
    entryLogInterval,
    entryShiftDurationHours,
    entryToleranceMinutes,
  ]);

  const hasMissedReadings =
    !!missedReadingNextDue || (missedEquipments?.length ?? 0) > 0;

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
      result = result.filter(
        (log) =>
          log.equipmentId &&
          log.equipmentId.toString().toLowerCase() === filters.equipmentId.toLowerCase(),
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
  const approvablePendingLogs = useMemo(
    () =>
      pendingDraftLogs.filter(
        (log) =>
          log.operator_id !== user?.id &&
          !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id),
      ),
    [pendingDraftLogs, user?.id],
  );
  const approvablePendingIds = useMemo(() => approvablePendingLogs.map((log) => log.id), [approvablePendingLogs]);
  const allPendingSelected =
    approvablePendingIds.length > 0 && approvablePendingIds.every((id) => selectedLogIds.includes(id));
  const handleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedLogIds((prev) => prev.filter((id) => !approvablePendingIds.includes(id)));
    } else {
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        approvablePendingIds.forEach((id) => next.add(id));
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
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      if (!formData.equipmentId) {
        toast.error("Please select Equipment ID.");
        return;
      }
      const selectedEquipment = equipmentOptions.find(
        (eq) => eq.equipment_number === formData.equipmentId,
      );
      if (selectedEquipment) {
        if (
          entryLogInterval === "shift" &&
          (entryShiftDurationHours === "" ||
            Number(entryShiftDurationHours) < 1 ||
            Number(entryShiftDurationHours) > 24)
        ) {
          toast.error("Shift duration must be between 1 and 24 hours.");
          return;
        }
        if (canPatchEquipmentLogIntervalFromLogbook(user?.role)) {
          await equipmentAPI.patch(selectedEquipment.id, {
            log_entry_interval: entryLogInterval || null,
            shift_duration_hours:
              entryLogInterval === "shift" && entryShiftDurationHours !== ""
                ? Number(entryShiftDurationHours)
                : null,
            tolerance_minutes:
              entryToleranceMinutes === "" ? null : Math.max(0, Number(entryToleranceMinutes) || 0),
          });
        }
      }

      if (!formData.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }

      if (formData.fuelType === "briquette") {
        const briquetteData: Record<string, unknown> = {
          equipment_id: formData.equipmentId,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
          remarks: formData.remarks || undefined,
          time_slot: normalizeHhMmSs(formData.timeSlot) || undefined,
          steam_pressure: formData.steamPressure ? parseFloat(formData.steamPressure) : undefined,
          furnace_pressure_mmwc: formData.furnacePressureMmwc ? parseFloat(formData.furnacePressureMmwc) : undefined,
          id_fan_op_percent: formData.idFanOpPercent ? parseFloat(formData.idFanOpPercent) : undefined,
          pa_damper_position_1: formData.paDamperPosition1 ? parseFloat(formData.paDamperPosition1) : undefined,
          pa_damper_position_2: formData.paDamperPosition2 ? parseFloat(formData.paDamperPosition2) : undefined,
          metering_screw_percent: formData.meteringScrewPercent ? parseFloat(formData.meteringScrewPercent) : undefined,
          steam_reading_ton: formData.steamReadingTon ? parseFloat(formData.steamReadingTon) : undefined,
          steam_flow_kg_hr: formData.steamFlowKgHr ? parseFloat(formData.steamFlowKgHr) : undefined,
          stack_temp: formData.stackTemp ? parseFloat(formData.stackTemp) : undefined,
          furnace_temp: formData.furnaceTemp ? parseFloat(formData.furnaceTemp) : undefined,
          hot_air_temp: formData.hotAirTemp || undefined,
          feed_pump_1_2: formData.feedPump12 || undefined,
          operator_sign_date: formData.operatorSignDate || undefined,
          verified_sign_date: formData.verifiedSignDate || undefined,
          feed_water_ph: formData.feedWaterPh ? parseFloat(formData.feedWaterPh) : undefined,
          feed_water_hardness_ppm: formData.feedWaterHardnessPpm ? parseFloat(formData.feedWaterHardnessPpm) : undefined,
          feed_water_tds_ppm: formData.feedWaterTdsPpm ? parseFloat(formData.feedWaterTdsPpm) : undefined,
          boiler_water_ph: formData.boilerWaterPh ? parseFloat(formData.boilerWaterPh) : undefined,
          boiler_water_hardness_ppm: formData.boilerWaterHardnessPpm ? parseFloat(formData.boilerWaterHardnessPpm) : undefined,
          boiler_water_tds_ppm: formData.boilerWaterTdsPpm ? parseFloat(formData.boilerWaterTdsPpm) : undefined,
          total_steam_in_1_day: formData.totalSteamIn1Day || undefined,
          total_steam_flow_ratio: formData.totalSteamFlowRatio || undefined,
        };
        const editingLog = editingLogId ? logs.find((l) => l.id === editingLogId) : null;
        const canChangeTimestamp =
          editingLog &&
          (editingLog.status === "rejected" || editingLog.status === "pending_secondary_approval");
        if (canChangeTimestamp && formData.date && formData.time) {
          (briquetteData as Record<string, unknown>).timestamp = new Date(`${formData.date}T${formData.time}`).toISOString();
        }
        if (editingLogId && editingLog) {
          const isCorrection =
            editingLog.status === "rejected" || editingLog.status === "pending_secondary_approval";
          if (isCorrection && editingLog.operator_id !== user?.id) {
            toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
            return;
          }
          if (isCorrection) {
            await briquetteLogAPI.correct(editingLogId, briquetteData as any);
            toast.success("Briquette entry corrected as new entry.");
          } else {
            await briquetteLogAPI.update(editingLogId, briquetteData as any);
            toast.success("Briquette entry updated successfully.");
            if (
              maintenanceTimings.activityType === "maintenance" ||
              maintenanceTimings.activityType === "shutdown"
            ) {
              setEditedMaintenanceLogIds((prev) => {
                const next = new Set(prev);
                next.add(editingLogId);
                return next;
              });
            }
          }
          setEditingLogId(null);
        } else {
          await briquetteLogAPI.create(briquetteData as any);
          toast.success("Briquette entry saved successfully");
        }
        setFormData((prev) => ({
          ...prev,
          equipmentType: "boiler",
          fuelType: "fo",
          equipmentId: "",
          remarks: "",
          date: "",
          time: "",
          timeSlot: "",
          steamPressure: "",
          furnacePressureMmwc: "",
          idFanOpPercent: "",
          paDamperPosition1: "",
          paDamperPosition2: "",
          meteringScrewPercent: "",
          steamReadingTon: "",
          steamFlowKgHr: "",
          stackTemp: "",
          furnaceTemp: "",
          hotAirTemp: "",
          feedPump12: "",
          operatorSignDate: "",
          verifiedSignDate: "",
          feedWaterPh: "",
          feedWaterHardnessPpm: "",
          feedWaterTdsPpm: "",
          boilerWaterPh: "",
          boilerWaterHardnessPpm: "",
          boilerWaterTdsPpm: "",
          totalSteamIn1Day: "",
          totalSteamFlowRatio: "",
        }));
        setIsDialogOpen(false);
        await refreshLogs();
        return;
      }

      if (!isReadingsApplicable) {
        const logData: Record<string, unknown> = {
          equipment_id: formData.equipmentId,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
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
            editingBoilerLog.status === "rejected" || editingBoilerLog.status === "pending_secondary_approval";
          if (isCorrection && editingBoilerLog.operator_id !== user?.id) {
            toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
            return;
          }
          if (isCorrection) {
            await boilerLogAPI.correct(editingLogId, logData as any);
            toast.success("Boiler entry corrected as new entry.");
          } else {
            await boilerLogAPI.update(editingLogId, logData as any);
            toast.success("Boiler entry updated successfully.");
            if (
              maintenanceTimings.activityType === "maintenance" ||
              maintenanceTimings.activityType === "shutdown"
            ) {
              setEditedMaintenanceLogIds((prev) => {
                const next = new Set(prev);
                next.add(editingLogId);
                return next;
              });
            }
          }
          setEditingLogId(null);
        } else {
          await boilerLogAPI.create(logData as any);
          toast.success("Boiler entry saved successfully");
        }

        setFormData((prev) => ({
          ...prev,
          equipmentId: "",
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
          dieselStockLiters: "",
          dieselCostRupees: "",
          furnaceOilStockLiters: "",
          furnaceOilCostRupees: "",
          brigadeStockKg: "",
          brigadeCostRupees: "",
          dailyPowerConsumptionKwh: "",
          dailyWaterConsumptionLiters: "",
          dailyChemicalConsumptionKg: "",
          dailyDieselConsumptionLiters: "",
          dailyFurnaceOilConsumptionLiters: "",
          dailyBrigadeConsumptionKg: "",
          steamConsumptionKgHr: "",
          remarks: "",
          date: "",
          time: "",
        }));
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
        setIsDialogOpen(false);
        await refreshLogs();
        return;
      }

      const operationRequired = [
        { key: "equipmentId", label: "Equipment ID" },
        { key: "foHsdNgDayTankLevel", label: "FO/HSD/NG Day Tank Level", numeric: true },
        { key: "feedWaterTankLevel", label: "Feed Water Tank Level", numeric: true },
        { key: "foPreHeaterTemp", label: "FO Pre Heater Temp", numeric: true },
        { key: "burnerOilPressure", label: "Burner Oil Pressure", numeric: true },
        { key: "burnerHeaterTemp", label: "Burner Heater Temp", numeric: true },
        { key: "boilerSteamPressure", label: "Boiler Steam Pressure", numeric: true },
        { key: "stackTemperature", label: "Stack Temperature", numeric: true },
        { key: "steamPressureAfterPrv", label: "Steam Pressure after PRV", numeric: true },
        { key: "feedWaterHardnessPpm", label: "Feed Water Hardness", numeric: true },
        { key: "feedWaterTdsPpm", label: "Feed Water TDS", numeric: true },
        { key: "foHsdNgConsumption", label: "FO/HSD/NG Consumption", numeric: true },
        { key: "mobreyFunctioning", label: "Mobrey Functioning" },
        { key: "manualBlowdownTime", label: "Manual Blow Down Time" },
        { key: "remarks", label: "Remarks" },
      ] as const;

      const err = firstRequiredFieldError(formData, operationRequired as any);
      if (err) {
        toast.error(err);
        return;
      }

      const logData: Record<string, unknown> = {
        equipment_id: formData.equipmentId,
        activity_type: maintenanceTimings.activityType,
        activity_from_date: maintenanceTimings.fromDate || undefined,
        activity_to_date: maintenanceTimings.toDate || undefined,
        activity_from_time: maintenanceTimings.fromTime || undefined,
        activity_to_time: maintenanceTimings.toTime || undefined,
        fo_hsd_ng_day_tank_level: parseFloat(formData.foHsdNgDayTankLevel),
        feed_water_tank_level: parseFloat(formData.feedWaterTankLevel),
        fo_pre_heater_temp: parseFloat(formData.foPreHeaterTemp),
        burner_oil_pressure: parseFloat(formData.burnerOilPressure),
        burner_heater_temp: parseFloat(formData.burnerHeaterTemp),
        boiler_steam_pressure: parseFloat(formData.boilerSteamPressure),
        stack_temperature: parseFloat(formData.stackTemperature),
        steam_pressure_after_prv: parseFloat(formData.steamPressureAfterPrv),
        feed_water_hardness_ppm: parseFloat(formData.feedWaterHardnessPpm),
        feed_water_tds_ppm: parseFloat(formData.feedWaterTdsPpm),
        fo_hsd_ng_consumption: parseFloat(formData.foHsdNgConsumption),
        mobrey_functioning: formData.mobreyFunctioning,
        manual_blowdown_time:
          (formData.manualBlowdownTime || "").toUpperCase() === "N/A"
            ? "N/A"
            : formData.manualBlowdownTime || undefined,
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
          editingBoilerLog.status === "rejected" || editingBoilerLog.status === "pending_secondary_approval";
        if (isCorrection && editingBoilerLog.operator_id !== user?.id) {
          toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
          return;
        }
        if (isCorrection) {
          await boilerLogAPI.correct(editingLogId, logData as any);
          toast.success("Boiler entry corrected as new entry.");
        } else {
          await boilerLogAPI.update(editingLogId, logData as any);
          toast.success("Boiler entry updated successfully.");
          if (
            maintenanceTimings.activityType === "maintenance" ||
            maintenanceTimings.activityType === "shutdown"
          ) {
            setEditedMaintenanceLogIds((prev) => {
              const next = new Set(prev);
              next.add(editingLogId);
              return next;
            });
          }
        }
        setEditingLogId(null);
        setFormData((prev) => ({
          ...prev,
          equipmentId: "",
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
          dieselStockLiters: "",
          dieselCostRupees: "",
          furnaceOilStockLiters: "",
          furnaceOilCostRupees: "",
          brigadeStockKg: "",
          brigadeCostRupees: "",
          dailyPowerConsumptionKwh: "",
          dailyWaterConsumptionLiters: "",
          dailyChemicalConsumptionKg: "",
          dailyDieselConsumptionLiters: "",
          dailyFurnaceOilConsumptionLiters: "",
          dailyBrigadeConsumptionKg: "",
          steamConsumptionKgHr: "",
          remarks: "",
          date: "",
          time: "",
        }));
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
        setIsDialogOpen(false);
        await refreshLogs();
      } else {
        await boilerLogAPI.create(logData as any);
        toast.success("Boiler entry saved successfully");

        setFormData((prev) => ({
          ...prev,
          equipmentId: "",
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
          dieselStockLiters: "",
          dieselCostRupees: "",
          furnaceOilStockLiters: "",
          furnaceOilCostRupees: "",
          brigadeStockKg: "",
          brigadeCostRupees: "",
          dailyPowerConsumptionKwh: "",
          dailyWaterConsumptionLiters: "",
          dailyChemicalConsumptionKg: "",
          dailyDieselConsumptionLiters: "",
          dailyFurnaceOilConsumptionLiters: "",
          dailyBrigadeConsumptionKg: "",
          steamConsumptionKgHr: "",
          remarks: "",
          date: "",
          time: "",
        }));
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
        setIsDialogOpen(false);
        await refreshLogs();
      }
    } catch (error: any) {
      console.error("Error saving boiler entry:", error);
      if (error?.response?.status === 400) {
        const d = error?.response?.data?.detail;
        const msg = Array.isArray(d) ? d.join(" ") : typeof d === "string" ? d : error?.message || "Validation failed (check limits).";
        toast.error(msg);
      } else {
        toast.error(error?.message || "Failed to save boiler entry");
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const handleSaveComment = async (logId: string, comment: string) => {
    if (editingCommentLogId !== logId) return;
    setEditingCommentLogId(null);
    try {
      const log = logs.find((l) => l.id === logId);
      if (log?.equipmentType === "briquette") {
        await briquetteLogAPI.patch(logId, { comment: comment || "" });
      } else {
        await boilerLogAPI.patch(logId, { comment: comment || "" });
      }
      toast.success("Comment updated");
      await refreshLogs();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail?.[0] || error?.message || "Failed to update comment");
      setEditingCommentLogId(logId);
      setEditingCommentValue(comment);
    }
  };

  const handleEditLog = (log: BoilerLog) => {
    const canEditMaintenanceBeforeApprove =
      (log.activity_type === "maintenance" || log.activity_type === "shutdown") &&
      (log.status === "draft" || log.status === "pending" || log.status === "pending_secondary_approval") &&
      user?.role !== "operator" &&
      log.operator_id !== user?.id &&
      !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id);

    if (
      !canEditMaintenanceBeforeApprove &&
      (log.status !== "rejected" ||
        log.operator_id !== user?.id ||
        (log.has_corrections && !log.corrects_id))
    ) {
      toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
      return;
    }
    setEditingLogId(log.id);
    setFormData({
      equipmentType: "boiler",
      fuelType: log.equipmentType === "briquette" ? "briquette" : "fo",
      equipmentId: log.equipmentId ?? "",
      steamPressure: log.steamPressure != null ? String(log.steamPressure) : "",
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
      dieselStockLiters: log.dieselStockLiters != null ? String(log.dieselStockLiters) : "",
      dieselCostRupees: log.dieselCostRupees != null ? String(log.dieselCostRupees) : "",
      furnaceOilStockLiters: log.furnaceOilStockLiters != null ? String(log.furnaceOilStockLiters) : "",
      furnaceOilCostRupees: log.furnaceOilCostRupees != null ? String(log.furnaceOilCostRupees) : "",
      brigadeStockKg: log.brigadeStockKg != null ? String(log.brigadeStockKg) : "",
      brigadeCostRupees: log.brigadeCostRupees != null ? String(log.brigadeCostRupees) : "",
      dailyPowerConsumptionKwh: log.dailyPowerConsumptionKwh != null ? String(log.dailyPowerConsumptionKwh) : "",
      dailyWaterConsumptionLiters: log.dailyWaterConsumptionLiters != null ? String(log.dailyWaterConsumptionLiters) : "",
      dailyChemicalConsumptionKg: log.dailyChemicalConsumptionKg != null ? String(log.dailyChemicalConsumptionKg) : "",
      dailyDieselConsumptionLiters: log.dailyDieselConsumptionLiters != null ? String(log.dailyDieselConsumptionLiters) : "",
      dailyFurnaceOilConsumptionLiters: log.dailyFurnaceOilConsumptionLiters != null ? String(log.dailyFurnaceOilConsumptionLiters) : "",
      dailyBrigadeConsumptionKg: log.dailyBrigadeConsumptionKg != null ? String(log.dailyBrigadeConsumptionKg) : "",
      steamConsumptionKgHr: log.steamConsumptionKgHr != null ? String(log.steamConsumptionKgHr) : "",
      timeSlot: log.timeSlot ?? "",
      furnacePressureMmwc: log.furnacePressureMmwc != null ? String(log.furnacePressureMmwc) : "",
      idFanOpPercent: log.idFanOpPercent != null ? String(log.idFanOpPercent) : "",
      paDamperPosition1: log.paDamperPosition1 != null ? String(log.paDamperPosition1) : "",
      paDamperPosition2: log.paDamperPosition2 != null ? String(log.paDamperPosition2) : "",
      meteringScrewPercent: log.meteringScrewPercent != null ? String(log.meteringScrewPercent) : "",
      steamReadingTon: log.steamReadingTon != null ? String(log.steamReadingTon) : "",
      steamFlowKgHr: log.steamFlowKgHr != null ? String(log.steamFlowKgHr) : "",
      stackTemp: log.stackTemp != null ? String(log.stackTemp) : "",
      furnaceTemp: log.furnaceTemp != null ? String(log.furnaceTemp) : "",
      hotAirTemp: log.hotAirTemp ?? "",
      feedPump12: log.feedPump12 ?? "",
      operatorSignDate: log.operatorSignDate ?? "",
      verifiedSignDate: log.verifiedSignDate ?? "",
      feedWaterPh: log.feedWaterPh != null ? String(log.feedWaterPh) : "",
      boilerWaterPh: log.boilerWaterPh != null ? String(log.boilerWaterPh) : "",
      boilerWaterHardnessPpm: log.boilerWaterHardnessPpm != null ? String(log.boilerWaterHardnessPpm) : "",
      boilerWaterTdsPpm: log.boilerWaterTdsPpm != null ? String(log.boilerWaterTdsPpm) : "",
      totalSteamIn1Day: log.totalSteamIn1Day ?? "",
      totalSteamFlowRatio: log.totalSteamFlowRatio ?? "",
      remarks: log.remarks ?? "",
      date: log.date ?? "",
      time: log.time ?? "",
    });
    setMaintenanceTimings({
      activityType: (log.activity_type as "operation" | "maintenance" | "shutdown") || "operation",
      fromDate: log.activity_from_date || "",
      toDate: log.activity_to_date || "",
      fromTime: log.activity_from_time || "",
      toTime: log.activity_to_time || "",
    });
    setIsDialogOpen(true);
  };

  const handleApprove = async (id: string, remarks: string) => {
    setApproveCommentOpen(false);
    setApprovalComment("");
    try {
      const log = logs.find((l) => l.id === id);
      if (log?.equipmentType === "briquette") {
        await briquetteLogAPI.approve(id, "approve", remarks);
        toast.success("Briquette entry approved successfully");
      } else {
        await boilerLogAPI.approve(id, "approve", remarks);
        toast.success("Boiler entry approved successfully");
      }
      await refreshLogs();
    } catch (error: any) {
      console.error("Error approving boiler entry:", error);
      toast.error(error?.response?.data?.error || error?.message || "Failed to approve boiler entry");
    }
  };

  const handleViewReadingsClick = (id: string) => {
    setViewedReadingsLogIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setReadingsModalLogId(id);
  };

  const handleApproveSelectedClick = () => {
    const mustEditFirstIds = selectedLogIds.filter((id) => {
      const log = logs.find((l) => l.id === id);
      if (!log) return false;
      const isMaintenanceOrShutdown =
        log.activity_type === "maintenance" || log.activity_type === "shutdown";
      return isMaintenanceOrShutdown && !editedMaintenanceLogIds.has(id);
    });
    if (mustEditFirstIds.length > 0) {
      toast.error(
        `Please edit maintenance/shutdown entr${mustEditFirstIds.length === 1 ? "y" : "ies"} first, then approve.`
      );
      return;
    }
    const notViewedIds = selectedLogIds.filter((id) => {
      const log = logs.find((l) => l.id === id);
      if (!log) return false;
      const isMaintenanceOrShutdown =
        log.activity_type === "maintenance" || log.activity_type === "shutdown";
      return !isMaintenanceOrShutdown && !viewedReadingsLogIds.has(id);
    });
    if (notViewedIds.length > 0) {
      toast.error(
        `Please click View Readings before approval for ${notViewedIds.length} selected entr${notViewedIds.length === 1 ? "y" : "ies"}.`
      );
      return;
    }
    setApproveConfirmOpen(true);
  };

  const handleReject = async (id: string, remarks: string) => {
    setRejectCommentOpen(false);
    setRejectComment("");
    try {
      const log = logs.find((l) => l.id === id);
      if (log?.equipmentType === "briquette") {
        await briquetteLogAPI.approve(id, "reject", remarks);
        toast.error("Briquette entry rejected");
      } else {
        await boilerLogAPI.approve(id, "reject", remarks);
        toast.error("Boiler entry rejected");
      }
      await refreshLogs();
    } catch (error: any) {
      console.error("Error rejecting boiler entry:", error);
      const data = error?.response?.data;
      const detail =
        (Array.isArray(data?.detail) ? data.detail.join(" ") : data?.detail) ||
        data?.error ||
        (Array.isArray(data?.remarks) ? data.remarks.join(" ") : data?.remarks);
      toast.error(detail || error?.message || "Failed to reject boiler entry");
    }
  };

  const executeDeleteLog = async (id: string) => {
    try {
      const log = logs.find((l) => l.id === id);
      if (log?.equipmentType === "briquette") {
        await briquetteLogAPI.delete(id);
        toast.success("Briquette entry deleted");
      } else {
        await boilerLogAPI.delete(id);
        toast.success("Boiler entry deleted");
      }
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
      <div className="px-4 pt-0">
        <EntryIntervalBadge />
      </div>
      {showMissedReadingPopup && hasMissedReadings && (
        <MissedReadingPopup
          open={showMissedReadingPopup}
          onClose={() => {
            setShowMissedReadingPopup(false);
          }}
          logTypeLabel="Boiler"
          nextDue={missedReadingNextDue}
          equipmentList={missedEquipments ?? undefined}
          isRangeLoading={missingRangeLoading}
          dateFrom={missingRangeFrom}
          dateTo={missingRangeTo}
          onDateFromChange={setMissingRangeFrom}
          onDateToChange={setMissingRangeTo}
          onApplyRange={() => setMissingRangeRefreshKey((prev) => prev + 1)}
          dayGroups={missingRangeGroups}
          totalMissingSlotsInRange={missingRangeTotalSlots}
        />
      )}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasMissedReadings}
              onClick={() => setShowMissedReadingPopup(true)}
              title={!hasMissedReadings ? "No missed readings" : "Show missing readings"}
            >
              <Clock className="w-4 h-4 mr-2" />
              Missing Readings
            </Button>
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
                    <Select
                      value={filters.equipmentId || "all"}
                      onValueChange={(v) => setFilters({ ...filters, equipmentId: v === "all" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {equipmentOptions.map((eq) => (
                          <SelectItem key={eq.id} value={eq.equipment_number}>
                            {eq.equipment_number}
                            {eq.name ? ` – ${eq.name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                if (!open) {
                  setEditingLogId(null);
                  setEntryLogInterval("");
                  setEntryShiftDurationHours("");
                  setEntryToleranceMinutes("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="accent"
                  onClick={() => {
                    setEditingLogId(null);
                    setFormData((prev) => ({ ...prev, equipmentType: "boiler", fuelType: "fo", equipmentId: "" }));
                    setEntryLogInterval("");
                    setEntryShiftDurationHours("");
                    setEntryToleranceMinutes("");
                  }}
                >
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

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Equipment Type *</Label>
                      <Select value={formData.equipmentType} disabled>
                        <SelectTrigger>
                          <SelectValue placeholder="Boiler" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="boiler">Boiler</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Fuel Type *</Label>
                      <Select
                        value={formData.fuelType}
                        onValueChange={(v) =>
                          {
                            setFormData((prev) => ({
                              ...prev,
                              fuelType: v as "fo" | "briquette",
                              equipmentId: "",
                            }));
                            setEntryLogInterval("");
                            setEntryShiftDurationHours("");
                            setEntryToleranceMinutes("");
                          }
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select fuel type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fo">FO</SelectItem>
                          <SelectItem value="briquette">Briquette</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipment ID *</Label>
                      <Select
                        value={formData.equipmentId}
                        onValueChange={(v) => {
                          const selectedEquipment = equipmentOptions.find(
                            (eq) => eq.equipment_number === v,
                          );
                          setFormData({ ...formData, equipmentId: v });
                          setEntryLogInterval(
                            (selectedEquipment?.log_entry_interval as LogEntryIntervalType) || "",
                          );
                          setEntryShiftDurationHours(
                            selectedEquipment?.shift_duration_hours ?? "",
                          );
                          setEntryToleranceMinutes(
                            selectedEquipment?.tolerance_minutes ?? "",
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select equipment" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {equipmentOptions.map((eq) => (
                            <SelectItem key={eq.id} value={eq.equipment_number}>
                              {eq.equipment_number}
                              {eq.name ? ` – ${eq.name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Log entry interval</Label>
                      <Select
                        value={entryLogInterval || "__none__"}
                        onValueChange={(v) => {
                          const next = v === "__none__" ? "" : (v as LogEntryIntervalType);
                          setEntryLogInterval(next);
                          if (next !== "shift") setEntryShiftDurationHours("");
                        }}
                        disabled={!isReadingsApplicable}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use global default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Use global default</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="shift">Shift</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Shift duration (hours)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        disabled={!isReadingsApplicable || entryLogInterval !== "shift"}
                        value={entryShiftDurationHours === "" ? "" : entryShiftDurationHours}
                        onChange={(e) =>
                          setEntryShiftDurationHours(
                            e.target.value === ""
                              ? ""
                              : Math.max(1, Math.min(24, Number(e.target.value) || 8)),
                          )
                        }
                        placeholder="e.g. 8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Log entry tolerance (minutes)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={entryToleranceMinutes === "" ? "" : entryToleranceMinutes}
                        onChange={(e) =>
                          setEntryToleranceMinutes(
                            e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0),
                          )
                        }
                        disabled={!isReadingsApplicable}
                        placeholder="e.g. 15"
                      />
                    </div>
                  </div>

                  {/* Previous readings for selected equipment with entered-by */}
                  {formData.equipmentId && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <p className="text-sm font-medium">Previous readings (Entered by)</p>
                      {previousReadingsLoading ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : previousReadingsForEquipment.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No previous entries for this equipment.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-2">
                          {previousReadingsForEquipment.map((log) => (
                            <div key={log.id} className="text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                              <span className="font-medium">{log.date} {log.time}</span>
                              <span className="text-muted-foreground"> — Entered by: {log.checkedBy || "—"}</span>
                              <div className="mt-1 text-muted-foreground">
                                {formData.fuelType === "briquette" ? (
                                  <>Steam pressure {log.steamPressure ?? "—"}</>
                                ) : (
                                  <>
                                    FO pre {log.foPreHeaterTemp ?? "—"}°C · Stack {log.stackTemperature ?? "—"}°C · Boiler steam{" "}
                                    {log.boilerSteamPressure ?? "—"} kg/cm²
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <MaintenanceTimingsSection value={maintenanceTimings} onChange={setMaintenanceTimings} />

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

                  {formData.fuelType === "briquette" && (
                    <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold border-b pb-2">Briquette Parameters</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Time Slot (HH:MM:SS)</Label>
                            <Input
                              type="time"
                              step={1}
                              value={formData.timeSlot}
                              onChange={(e) => setFormData({ ...formData, timeSlot: normalizeHhMmSs(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Steam Pressure</Label>
                            <Input type="number" step="0.01" value={formData.steamPressure} onChange={(e) => setFormData({ ...formData, steamPressure: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Furnace Pressure (mmWC)</Label>
                            <Input type="number" step="0.01" value={formData.furnacePressureMmwc} onChange={(e) => setFormData({ ...formData, furnacePressureMmwc: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>ID Fan O/P</Label>
                            <Input type="number" step="0.01" value={formData.idFanOpPercent} onChange={(e) => setFormData({ ...formData, idFanOpPercent: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>PA Damper position 1</Label>
                            <Input type="number" step="0.01" value={formData.paDamperPosition1} onChange={(e) => setFormData({ ...formData, paDamperPosition1: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>PA Damper position 2</Label>
                            <Input type="number" step="0.01" value={formData.paDamperPosition2} onChange={(e) => setFormData({ ...formData, paDamperPosition2: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Metering Screw %</Label>
                            <Input type="number" step="0.01" value={formData.meteringScrewPercent} onChange={(e) => setFormData({ ...formData, meteringScrewPercent: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Steam Reading Ton</Label>
                            <Input type="number" step="0.01" value={formData.steamReadingTon} onChange={(e) => setFormData({ ...formData, steamReadingTon: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Steam Flow Kg/Hr</Label>
                            <Input type="number" step="0.01" value={formData.steamFlowKgHr} onChange={(e) => setFormData({ ...formData, steamFlowKgHr: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Stack Temp</Label>
                            <Input type="number" step="0.01" value={formData.stackTemp} onChange={(e) => setFormData({ ...formData, stackTemp: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Furnace Temp</Label>
                            <Input type="number" step="0.01" value={formData.furnaceTemp} onChange={(e) => setFormData({ ...formData, furnaceTemp: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Hot Air Temp</Label>
                            <Input value={formData.hotAirTemp} onChange={(e) => setFormData({ ...formData, hotAirTemp: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Feed Pump 1/2</Label>
                            <Input value={formData.feedPump12} onChange={(e) => setFormData({ ...formData, feedPump12: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2"><Label>Feed Water pH</Label><Input type="number" step="0.01" value={formData.feedWaterPh} onChange={(e) => setFormData({ ...formData, feedWaterPh: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Feed Water Hardness (ppm)</Label><Input type="number" step="0.01" value={formData.feedWaterHardnessPpm} onChange={(e) => setFormData({ ...formData, feedWaterHardnessPpm: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Feed Water TDS</Label><Input type="number" step="0.01" value={formData.feedWaterTdsPpm} onChange={(e) => setFormData({ ...formData, feedWaterTdsPpm: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Boiler Water pH</Label><Input type="number" step="0.01" value={formData.boilerWaterPh} onChange={(e) => setFormData({ ...formData, boilerWaterPh: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Boiler Water Hardness (ppm)</Label><Input type="number" step="0.01" value={formData.boilerWaterHardnessPpm} onChange={(e) => setFormData({ ...formData, boilerWaterHardnessPpm: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Boiler Water TDS</Label><Input type="number" step="0.01" value={formData.boilerWaterTdsPpm} onChange={(e) => setFormData({ ...formData, boilerWaterTdsPpm: e.target.value })} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><Label>Total Steam in 1 day</Label><Input value={formData.totalSteamIn1Day} onChange={(e) => setFormData({ ...formData, totalSteamIn1Day: e.target.value })} /></div>
                          <div className="space-y-2"><Label>Total Steam Flow Ratio</Label><Input value={formData.totalSteamFlowRatio} onChange={(e) => setFormData({ ...formData, totalSteamFlowRatio: e.target.value })} /></div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <Label>Operator Sign & Date</Label>
                            <Input value={formData.operatorSignDate} readOnly />
                          </div>
                        </div>
                      </div>
                    </fieldset>
                  )}

                  {/* Hourly Parameters */}
                  {formData.fuelType === "fo" && (
                  <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold border-b pb-2">Hourly Parameters</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>
                          FO/HSD/NG Day Tank Level{" "}
                          <span className="text-muted-foreground text-xs">
                            (Ltr, NLT {boilerLimits.foHsdNgDayTankLevel.min})
                          </span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          value={formData.foHsdNgDayTankLevel}
                          onChange={(e) => setFormData({ ...formData, foHsdNgDayTankLevel: e.target.value })}
                          placeholder="e.g., 500"
                          className={cn(
                            isFormValueOutOfLimit("foHsdNgDayTankLevel", formData.foHsdNgDayTankLevel) &&
                              "border-destructive bg-destructive/5 text-destructive font-semibold",
                          )}
                        />
                        {isFormValueOutOfLimit("foHsdNgDayTankLevel", formData.foHsdNgDayTankLevel) && (
                          <p className="text-xs text-destructive">{getLimitErrorMessage("foHsdNgDayTankLevel")}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>
                          Feed Water Tank Level{" "}
                          <span className="text-muted-foreground text-xs">
                            (KL, NLT {boilerLimits.feedWaterTankLevel.min})
                          </span>
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={formData.feedWaterTankLevel}
                          onChange={(e) => setFormData({ ...formData, feedWaterTankLevel: e.target.value })}
                          placeholder="e.g., 2.5"
                          className={cn(
                            isFormValueOutOfLimit("feedWaterTankLevel", formData.feedWaterTankLevel) &&
                              "border-destructive bg-destructive/5 text-destructive font-semibold",
                          )}
                        />
                        {isFormValueOutOfLimit("feedWaterTankLevel", formData.feedWaterTankLevel) && (
                          <p className="text-xs text-destructive">{getLimitErrorMessage("feedWaterTankLevel")}</p>
                        )}
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
                        <Label>Manual Blow Down Time</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <Select
                            value={(formData.manualBlowdownTime || "").toUpperCase() === "N/A" ? "na" : "time"}
                            onValueChange={(value) =>
                              setFormData((prev) => ({
                                ...prev,
                                manualBlowdownTime:
                                  value === "na"
                                    ? "N/A"
                                    : (prev.manualBlowdownTime || "").toUpperCase() === "N/A"
                                      ? ""
                                      : prev.manualBlowdownTime,
                              }))
                            }
                          >
                            <SelectTrigger className="col-span-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="time">Time</SelectItem>
                              <SelectItem value="na">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="time"
                            step={1}
                            className="col-span-2"
                            value={(formData.manualBlowdownTime || "").toUpperCase() === "N/A" ? "" : formData.manualBlowdownTime}
                            onChange={(e) => setFormData({ ...formData, manualBlowdownTime: e.target.value })}
                            disabled={(formData.manualBlowdownTime || "").toUpperCase() === "N/A"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  </fieldset>
                  )}

                  {/* Remarks */}
                  <div className="space-y-3 pt-4 mt-2 border-t">
                    {formData.fuelType === "briquette" && (
                      <div className="space-y-2">
                        <Label>Verified Sign & Date</Label>
                        <Input
                          value={formData.verifiedSignDate}
                          readOnly
                        />
                      </div>
                    )}
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
                onClick={handleApproveSelectedClick}
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
                  <th className="px-4 py-2 text-left font-semibold w-12">
                    {approvablePendingIds.length > 0 && user?.role !== "operator" && (
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAllPending}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold w-[110px]">Date</th>
                  <th className="px-4 py-2 text-left font-semibold w-[100px]">Time</th>
                  <th className="px-4 py-2 text-left font-semibold w-[130px]">Equipment Type</th>
                  <th className="px-4 py-2 text-left font-semibold w-[150px]">Equipment</th>
                  <th className="px-4 py-2 text-left font-semibold min-w-[140px]">Readings</th>
                  <th className="px-4 py-2 text-center font-semibold min-w-[140px]">Remarks</th>
                  <th className="px-4 py-2 text-left font-semibold min-w-[170px]">Comment</th>
                  <th className="px-4 py-2 text-left font-semibold w-[140px]">Done By</th>
                  <th className="px-4 py-2 text-left font-semibold w-[160px]">Approved By</th>
                  <th className="px-4 py-2 text-left font-semibold w-[160px]">Rejected By</th>
                  <th className="px-4 py-2 text-left font-semibold w-[110px]">Status</th>
                  <th className="px-4 py-2 text-left font-semibold w-[140px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No Boiler Log Book entries found.
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => {
                  const isMaintenanceOrShutdown =
                    log.activity_type === "maintenance" || log.activity_type === "shutdown";
                  const canEditMaintenanceBeforeApprove =
                    isMaintenanceOrShutdown &&
                    (log.status === "draft" || log.status === "pending" || log.status === "pending_secondary_approval") &&
                    user?.role !== "operator" &&
                    log.operator_id !== user?.id &&
                    !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id);
                  const canEditRejected =
                    log.status === "rejected" &&
                    log.operator_id === user?.id &&
                    !(log.has_corrections && !log.corrects_id);
                  const canEditAction = canEditMaintenanceBeforeApprove || canEditRejected;
                  const tolClass =
                    isMaintenanceOrShutdown
                      ? "bg-yellow-100"
                      : log.tolerance_status === "outside"
                      ? "bg-red-100"
                      : "";
                  return (
                  <tr key={log.id} className={cn(tolClass, "hover:bg-muted/30 transition-colors")}>
                    <td className="px-4 py-3 align-middle">
                      {(log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") &&
                      user?.role !== "operator" &&
                      log.operator_id !== user?.id &&
                      !(log.status === "pending_secondary_approval" && log.approved_by_id === user?.id) ? (
                        <Checkbox
                          checked={selectedLogIds.includes(log.id)}
                          onCheckedChange={() => handleToggleLogSelection(log.id)}
                          className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{log.date}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{log.time}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={log.equipmentType === "briquette" ? "secondary" : "outline"}>
                        {log.equipmentType === "briquette" ? "Briquette" : "Boiler"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-foreground">{log.equipmentId}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-xs",
                          hasOutOfLimitReadings(log) &&
                            "text-destructive border-destructive/50 hover:bg-destructive/10"
                        )}
                        onClick={() => handleViewReadingsClick(log.id)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View Readings
                      </Button>
                    </td>
                    <td className="px-4 py-3 max-w-xs min-w-[170px] align-middle text-center">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-snug line-clamp-3 inline-block text-left">
                        {log.remarks || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-2 align-middle">
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
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{log.checkedBy}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{log.approvedBy || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{log.rejectedBy || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            log.has_corrections && !log.corrects_id
                              ? "destructive"
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
                            : log.status === "approved"
                            ? "Approved"
                            : log.status === "pending_secondary_approval" || log.status === "pending"
                            ? "Pending"
                            : log.status === "rejected"
                            ? "Rejected"
                            : log.status === "draft"
                            ? "Draft"
                            : log.status}
                        </Badge>
                        {log.corrects_id && (
                          <span
                            className={
                              log.status === "approved"
                                ? "text-[10px] text-emerald-700 whitespace-nowrap"
                                : "text-[10px] text-amber-700 whitespace-nowrap"
                            }
                          >
                            {log.status === "approved" ? "Approved correction entry" : "Correction entry"}
                          </span>
                        )}
                        {log.has_corrections && !log.corrects_id && (
                          <span className="text-[10px] text-emerald-700 whitespace-nowrap">Has corrections</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
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
                                  : isMaintenanceOrShutdown &&
                                    (log.status === "pending" || log.status === "draft" || log.status === "pending_secondary_approval") &&
                                    !editedMaintenanceLogIds.has(log.id)
                                  ? "Please edit this maintenance/shutdown entry first, then approve."
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
                                  if (isMaintenanceOrShutdown && !editedMaintenanceLogIds.has(log.id)) {
                                    toast.error("Please edit this maintenance/shutdown entry first, then approve.");
                                    return;
                                  }
                                  if (!isMaintenanceOrShutdown && !viewedReadingsLogIds.has(log.id)) {
                                    toast.error("Please click View Readings before approving this entry.");
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
                                  if (log.operator_id === user?.id) {
                                    toast.error("The log book entry must be rejected by a different user than the operator (Log Book Done By).");
                                    return;
                                  }
                                  if (isMaintenanceOrShutdown && !editedMaintenanceLogIds.has(log.id)) {
                                    toast.error("Please edit this maintenance/shutdown entry first, then reject.");
                                    return;
                                  }
                                  if (!isMaintenanceOrShutdown && !viewedReadingsLogIds.has(log.id)) {
                                    toast.error("Please click View Readings before rejecting this entry.");
                                    return;
                                  }
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
                                canEditAction
                                  ? ""
                                  : "opacity-40 cursor-not-allowed"
                              )}
                              title={
                                canEditAction ? "Edit entry" : "Edit only available"
                              }
                              onClick={() => {
                                if (canEditAction) {
                                  handleEditLog(log);
                                }
                              }}
                              disabled={
                                !canEditAction
                              }
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
                        {user?.role === "operator" &&
                          log.status === "rejected" &&
                          log.operator_id === user?.id &&
                          !(log.has_corrections && !log.corrects_id) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit entry"
                              onClick={() => handleEditLog(log)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        {user?.role === "super_admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete entry"
                            onClick={() => setDeleteConfirmLogId(log.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      {/* Delete log entry (centered modal, same pattern as Chemical) */}
      <AlertDialog
        open={!!deleteConfirmLogId}
        onOpenChange={(open) => {
          if (!open && !isDeletingLog) setDeleteConfirmLogId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete log entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingLog}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingLog}
              onClick={async () => {
                if (!deleteConfirmLogId) return;
                setIsDeletingLog(true);
                try {
                  await executeDeleteLog(deleteConfirmLogId);
                } finally {
                  setIsDeletingLog(false);
                  setDeleteConfirmLogId(null);
                }
              }}
            >
              {isDeletingLog ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Readings modal */}
      <Dialog open={!!readingsModalLogId} onOpenChange={(open) => !open && setReadingsModalLogId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <DialogTitle className="text-lg font-semibold">Readings</DialogTitle>
            <DialogDescription className="mt-1.5">
              {readingsModalLogId && (() => {
                const log = filteredLogs.find((l) => l.id === readingsModalLogId);
                return log ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-background border px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                    <Clock className="h-3.5 w-3.5" />
                    {log.equipmentId} · {log.date} {log.time}
                  </span>
                ) : null;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
            {readingsModalLogId && (() => {
              const log = filteredLogs.find((l) => l.id === readingsModalLogId);
              if (!log) return null;
              const logRecord = log as unknown as Record<string, unknown>;
              const renderItem = (label: string, value: string | number, isOut?: boolean) => (
                <div
                  key={label}
                  className={cn(
                    "flex justify-between items-center gap-4 py-2.5 px-3 rounded-lg text-sm transition-colors",
                    isOut ? "bg-destructive/10 text-destructive font-semibold" : "hover:bg-muted/40"
                  )}
                >
                  <span className="font-medium text-muted-foreground">{label}</span>
                  <span className={cn("tabular-nums", isOut && "font-semibold")}>{value}</span>
                </div>
              );
              const renderFlatSection = (
                title: string,
                icon: React.ElementType,
                fields: { key: keyof BoilerLog; label: string; unit?: string }[]
              ) => {
                const Icon = icon;
                const items = fields
                  .map(({ key, label, unit }) => {
                    const value = logRecord[key as string];
                    if (value === undefined || value === null || value === "") return null;
                    const display = unit ? `${value} ${unit}`.trim() : String(value);
                    return renderItem(label, display);
                  })
                  .filter(Boolean);
                if (items.length === 0) return null;
                return (
                  <div key={title} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      {title}
                    </h4>
                    <div className="space-y-0.5">{items}</div>
                  </div>
                );
              };
              const tankLevelKeys = ["foHsdNgDayTankLevel", "feedWaterTankLevel"];
              const tempKeys = ["foPreHeaterTemp", "burnerHeaterTemp", "stackTemperature"];
              const pressureKeys = ["burnerOilPressure", "boilerSteamPressure", "steamPressureAfterPrv"];
              const flowKeys = ["steamConsumptionKgHr"];
              const otherKeys = ["feedWaterHardnessPpm", "feedWaterTdsPpm", "foHsdNgConsumption", "mobreyFunctioning", "manualBlowdownTime"];
              const SectionCard = ({ title, icon: Icon, keys }: { title: string; icon: React.ElementType; keys: string[] }) => {
                const items = BOILER_LIST_FIELDS.filter((f) => keys.includes(f.key)).map(({ key, label, unit }) => {
                  const value = logRecord[key];
                  if (value === undefined || value === null) return null;
                  const numVal = typeof value === "number" ? value : undefined;
                  const isOut = numVal !== undefined && isValueOutOfLimit(log, key as BoilerLimitField, numVal);
                  const display = unit ? `${value} ${unit}`.trim() : String(value);
                  return renderItem(label, display, isOut);
                }).filter(Boolean);
                if (items.length === 0) return null;
                return (
                  <div key={title} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      {title}
                    </h4>
                    <div className="space-y-0.5">{items}</div>
                  </div>
                );
              };
              const fuelKeys = ["dieselStockLiters", "dieselCostRupees", "furnaceOilStockLiters", "furnaceOilCostRupees", "brigadeStockKg", "brigadeCostRupees"];
              const dailyKeys = ["dailyPowerConsumptionKwh", "dailyWaterConsumptionLiters", "dailyChemicalConsumptionKg"];
              const fuelLabels: Record<string, string> = { dieselStockLiters: "Diesel (L)", dieselCostRupees: "Diesel cost (Rs)", furnaceOilStockLiters: "Furnace oil (L)", furnaceOilCostRupees: "Furnace oil cost (Rs)", brigadeStockKg: "Brigade (kg)", brigadeCostRupees: "Brigade cost (Rs)" };
              const dailyLabels: Record<string, string> = { dailyPowerConsumptionKwh: "Daily power (kWh)", dailyWaterConsumptionLiters: "Daily water (L)", dailyChemicalConsumptionKg: "Daily chemical (kg)" };
              const isBriquette = log.equipmentType === "briquette";
              if (isBriquette) {
                const coreFields = BRIQUETTE_LIST_FIELDS.filter((f) =>
                  [
                    "steamPressure",
                    "furnacePressureMmwc",
                    "idFanOpPercent",
                    "paDamperPosition1",
                    "paDamperPosition2",
                    "meteringScrewPercent",
                    "steamReadingTon",
                    "steamFlowKgHr",
                    "stackTemp",
                    "furnaceTemp",
                  ].includes(String(f.key))
                );
                const waterQualityFields = BRIQUETTE_LIST_FIELDS.filter((f) =>
                  [
                    "feedWaterPh",
                    "feedWaterHardnessPpm",
                    "feedWaterTdsPpm",
                    "boilerWaterPh",
                    "boilerWaterHardnessPpm",
                    "boilerWaterTdsPpm",
                  ].includes(String(f.key))
                );
                const otherFields = BRIQUETTE_LIST_FIELDS.filter((f) =>
                  ["hotAirTemp", "feedPump12"].includes(String(f.key))
                );
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {renderFlatSection("Core readings", Gauge, coreFields)}
                      {renderFlatSection("Water quality", Droplets, waterQualityFields)}
                      {renderFlatSection("Other", Clock, otherFields)}
                    </div>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SectionCard title="Tank levels" icon={Package} keys={tankLevelKeys} />
                    <SectionCard title="Temperature" icon={Thermometer} keys={tempKeys} />
                    <SectionCard title="Pressure" icon={Gauge} keys={pressureKeys} />
                    <SectionCard title="Flow" icon={Droplets} keys={flowKeys} />
                    <SectionCard title="Other" icon={Package} keys={otherKeys} />
                  </div>
                  {(fuelKeys.some((k) => logRecord[k] != null)) ? (
                    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Fuel stock</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {fuelKeys.map((k) => {
                          const v = logRecord[k];
                          if (v === undefined || v === null) return null;
                          return <div key={k} className="flex justify-between text-sm py-1"><span className="text-muted-foreground">{fuelLabels[k] ?? k}</span><span className="tabular-nums">{String(v)}</span></div>;
                        })}
                      </div>
                    </div>
                  ) : null}
                  {(dailyKeys.some((k) => logRecord[k] != null)) ? (
                    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Daily consumption</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {dailyKeys.map((k) => {
                          const v = logRecord[k];
                          if (v === undefined || v === null) return null;
                          return <div key={k} className="flex justify-between text-sm py-1"><span className="text-muted-foreground">{dailyLabels[k] ?? k}</span><span className="tabular-nums">{String(v)}</span></div>;
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/20">
            <Button type="button" variant="outline" onClick={() => setReadingsModalLogId(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
                  const ids = [...selectedLogIds].filter((id) => {
                    const log = logs.find((l) => l.id === id);
                    if (!log) return false;
                    if (log.operator_id === user?.id) return false;
                    if (log.status === "pending_secondary_approval" && log.approved_by_id === user?.id) return false;
                    return true;
                  });
                  const mustEditFirstIds = ids.filter((id) => {
                    const log = logs.find((l) => l.id === id);
                    if (!log) return false;
                    const isMaintenanceOrShutdown =
                      log.activity_type === "maintenance" || log.activity_type === "shutdown";
                    return isMaintenanceOrShutdown && !editedMaintenanceLogIds.has(id);
                  });
                  if (mustEditFirstIds.length > 0) {
                    toast.error(
                      `Please edit maintenance/shutdown entr${mustEditFirstIds.length === 1 ? "y" : "ies"} first, then approve.`
                    );
                    return;
                  }
                  const notViewedIds = ids.filter((id) => {
                    const log = logs.find((l) => l.id === id);
                    if (!log) return false;
                    const isMaintenanceOrShutdown =
                      log.activity_type === "maintenance" || log.activity_type === "shutdown";
                    return !isMaintenanceOrShutdown && !viewedReadingsLogIds.has(id);
                  });
                  if (notViewedIds.length > 0) {
                    toast.error(
                      `Please click View Readings before approval for ${notViewedIds.length} selected entr${notViewedIds.length === 1 ? "y" : "ies"}.`
                    );
                    return;
                  }
                  if (ids.length === 0) return;
                  if (ids.length === 1) {
                    handleApprove(ids[0], comment);
                    setSelectedLogIds([]);
                    return;
                  }
                  try {
                    for (const id of ids) {
                      const log = logs.find((l) => l.id === id);
                      if (log?.equipmentType === "briquette") {
                        await briquetteLogAPI.approve(id, "approve", comment);
                      } else {
                        await boilerLogAPI.approve(id, "approve", comment);
                      }
                    }
                    setApproveCommentOpen(false);
                    setApprovalComment("");
                    setSelectedLogIds([]);
                    await refreshLogs();
                    toast.success(`${ids.length} entries approved successfully.`);
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

