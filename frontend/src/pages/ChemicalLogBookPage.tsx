import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { format, subDays } from "date-fns";
import { toast } from "@/lib/toast";
import { chemicalPrepAPI, chemicalMasterAPI, chemicalAssignmentAPI, chemicalStockAPI, equipmentAPI, equipmentCategoryAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { firstRequiredFieldError } from "@/lib/requiredFields";
import { Link } from "react-router-dom";
import { Clock, Save, Filter, X, Plus, Trash2, CheckCircle, XCircle, Edit, History, Eye, Package } from "lucide-react";
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
import { EntryIntervalBadge } from "@/components/logbook/EntryIntervalBadge";
import { MissedReadingPopup } from "@/components/logbook/MissedReadingPopup";
import {
  type EquipmentMissInfo,
} from "@/lib/missed-reading";
import { MaintenanceTimingsSection } from "@/components/logbook/MaintenanceTimingsSection";
import type { MaintenanceTimingsValue } from "@/types/maintenance-timings";
import { useChemicalLogsQuery, useChemicalMissingSlotsQuery } from "@/hooks/useLogbookQueries";
import {
  type ChemicalLikeLog,
  mapChemicalPrepPayload,
  mapChemicalPreviousReadingPayload,
} from "@/lib/logbookPayloadMappers";
import type { MissingSlotsEquipment, MissingSlotsRangeResponse, MissingSlotsResponse } from "@/lib/api/types";

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
}
type LogEntryIntervalType = "hourly" | "shift" | "daily";

const CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry.";

const getReadableApiError = (error: any, fallback: string): string => {
  const data = error?.data || error?.response?.data;
  if (data) {
    if (typeof data === "string") return data;
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail) && data.detail.length) return String(data.detail[0]);
    const firstKey = Object.keys(data)[0];
    if (firstKey) {
      const value = (data as Record<string, any>)[firstKey];
      if (Array.isArray(value) && value.length) return String(value[0]);
      if (typeof value === "string") return value;
    }
  }
  if (typeof error?.message === "string" && !error.message.startsWith("{")) {
    return error.message;
  }
  return fallback;
};

const ChemicalLogBookPage: React.FC = () => {
  const { user, sessionSettings } = useAuth();
  const [logs, setLogs] = useState<ChemicalPrepLog[]>([]);
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
  const [filteredLogs, setFilteredLogs] = useState<ChemicalPrepLog[]>([]);
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
  const [maintenanceTimings, setMaintenanceTimings] = useState<MaintenanceTimingsValue>({
    activityType: "operation",
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
  });
  const isReadingsApplicable = maintenanceTimings.activityType === "operation";

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    status: "all" as "all" | "pending" | "approved" | "rejected" | "pending_secondary_approval",
    equipmentName: "",
    checkedBy: "",
    fromTime: "",
    toTime: "",
  });
  const selectedDate = filters.fromDate || format(new Date(), "yyyy-MM-dd");
  const chemicalLogs = useChemicalLogsQuery();
  const chemicalMissing = useChemicalMissingSlotsQuery(selectedDate, missingRefreshKey);
  const isLoading = chemicalLogs.isLoading || chemicalLogs.isFetching;

  const [chemicalNames, setChemicalNames] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<{ id: string; name: string }[]>([]);
  const [equipmentWithIntervals, setEquipmentWithIntervals] = useState<
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
  const [previousReadingsForEquipment, setPreviousReadingsForEquipment] = useState<ChemicalPrepLog[]>([]);
  const [previousReadingsLoading, setPreviousReadingsLoading] = useState(false);
  const [assignments, setAssignments] = useState<
    { equipment_name: string; category: "major" | "minor"; chemical_name: string; chemical_formula: string; chemical_id?: string | null; location?: string | null }[]
  >([]);
  const [selectedChemicalId, setSelectedChemicalId] = useState<string | null>(null);
  /** When assignment has no chemical master link, we resolve ID from master list by name/formula so stock can still be shown */
  const [resolvedChemicalId, setResolvedChemicalId] = useState<string | null>(null);
  const [chemicalMasterList, setChemicalMasterList] = useState<{ id: string; name: string; formula: string }[]>([]);
  const [selectedStockInfo, setSelectedStockInfo] = useState<{
    availableQtyKg: number | null;
    unit: string | null;
    pricePerUnit: number | null;
    site: string | null;
  } | null>(null);

  const refreshLogs = async () => {
    try {
      const result = await chemicalLogs.refetch();
      const chemicalPreps = result.data ?? [];

      const allLogs: ChemicalPrepLog[] = chemicalPreps.map((prep: ChemicalLikeLog) =>
        mapChemicalPrepPayload(prep),
      );

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      setFilteredLogs(allLogs);
      setMissingRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error refreshing chemical logs:", error);
      toast.error("Failed to refresh chemical preparation entries");
    }
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  // After equipment selection, fetch previous readings with entered-by for that equipment
  useEffect(() => {
    if (!formData.equipmentName?.trim()) {
      setPreviousReadingsForEquipment([]);
      return;
    }
    let cancelled = false;
    setPreviousReadingsLoading(true);
    chemicalPrepAPI
      .list({ equipment_name: formData.equipmentName.trim() })
      .then((raw: any[]) => {
        if (cancelled) return;
        const list: ChemicalPrepLog[] = (Array.isArray(raw) ? raw : [])
          .slice(0, 10)
          .map((prep: ChemicalLikeLog) => mapChemicalPreviousReadingPayload(prep));
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
  }, [formData.equipmentName]);

  useEffect(() => {
    if (!chemicalMissing.data && !chemicalMissing.error) return;
    if (chemicalMissing.error) {
      setMissedEquipments(null);
      setShowMissedReadingPopup(false);
      setMissedReadingNextDue(null);
      return;
    }
    const payload = chemicalMissing.data;
    const missedOnly: EquipmentMissInfo[] = (payload?.equipments || [])
          .filter((eq) => (eq.missing_slot_count || 0) > 0)
          .map((eq) => ({
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
  }, [chemicalMissing.data, chemicalMissing.error]);

  useEffect(() => {
    if (!showMissedReadingPopup) return;
    if (!missingRangeFrom || !missingRangeTo) return;
    if (missingRangeFrom > missingRangeTo) {
      setMissingRangeGroups([]);
      setMissingRangeTotalSlots(0);
      return;
    }

    const mapEquipment = (eq: MissingSlotsEquipment): EquipmentMissInfo => ({
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

    setMissingRangeLoading(true);
    chemicalPrepAPI
      .missingSlots({ date_from: missingRangeFrom, date_to: missingRangeTo })
      .then((payload) => {
        const totalMissingSlots =
          payload && typeof payload === "object" && "days" in payload
            ? (payload as MissingSlotsRangeResponse).total_missing_slots || 0
            : (payload as MissingSlotsResponse)?.total_missing_slots || 0;
        const groups =
          payload && typeof payload === "object" && "days" in payload
            ? (payload as MissingSlotsRangeResponse).days
                .map((day) => ({
                  date: day.date,
                  totalMissingSlots: day.total_missing_slots || 0,
                  equipmentList: (day.equipments || [])
                    .filter((eq) => (eq.missing_slot_count || 0) > 0)
                    .map(mapEquipment),
                }))
                .filter((group) => group.equipmentList.length > 0)
            : (() => {
                const single = payload as MissingSlotsResponse;
                const equipmentList = (single?.equipments || [])
                  .filter((eq) => (eq.missing_slot_count || 0) > 0)
                  .map(mapEquipment);
                return equipmentList.length
                  ? [{ date: single.date, totalMissingSlots: single.total_missing_slots || 0, equipmentList }]
                  : [];
              })();
        setMissingRangeTotalSlots(totalMissingSlots);
        setMissingRangeGroups(groups);
      })
      .catch(() => {
        setMissingRangeTotalSlots(0);
        setMissingRangeGroups([]);
      })
      .finally(() => setMissingRangeLoading(false));
  }, [showMissedReadingPopup, missingRangeFrom, missingRangeTo, missingRangeRefreshKey]);

  useEffect(() => {
    if (!isDialogOpen || !!editingLogId) return;
    if (!formData.equipmentName) return;
    if (entryLogInterval !== "" || entryShiftDurationHours !== "" || entryToleranceMinutes !== "") return;
    const selectedEquipmentMeta = equipmentWithIntervals.find(
      (e) =>
        e.name === formData.equipmentName ||
        e.equipment_number === formData.equipmentName ||
        `${e.equipment_number} – ${e.name}` === formData.equipmentName,
    );
    if (!selectedEquipmentMeta) return;
    setEntryLogInterval((selectedEquipmentMeta.log_entry_interval as LogEntryIntervalType) || "");
    setEntryShiftDurationHours(selectedEquipmentMeta.shift_duration_hours ?? "");
    setEntryToleranceMinutes(selectedEquipmentMeta.tolerance_minutes ?? "");
  }, [
    isDialogOpen,
    editingLogId,
    formData.equipmentName,
    equipmentWithIntervals,
    entryLogInterval,
    entryShiftDurationHours,
    entryToleranceMinutes,
  ]);

  const hasMissedReadings =
    !!missedReadingNextDue || (missedEquipments?.length ?? 0) > 0;

  // Load chemical names and full master list (for resolving chemical ID when assignment has no link)
  useEffect(() => {
    (async () => {
      try {
        const data = await chemicalMasterAPI.list();
        const list = (data as any[]).map((c: any) => ({
          id: c.id,
          name: String(c.name ?? ""),
          formula: String(c.formula ?? ""),
        }));
        setChemicalMasterList(list);
        setChemicalNames(list.map((c) => `${c.formula} – ${c.name}`));
      } catch (error: any) {
        console.error("Error loading chemicals:", error);
        toast.error(error?.message || "Failed to load chemical list");
      }
    })();
  }, []);

  const toChemicalDisplay = useCallback(
    (formula: string | null | undefined, name: string | null | undefined) => {
      const f = String(formula ?? "").trim();
      const n = String(name ?? "").trim();
      return f ? `${f} – ${n}` : n;
    },
    [],
  );

  // Derive chemical options per equipment from assignments
  const chemOptionsByEquipment = useMemo(() => {
    const map: Record<
      string,
      { value: string; label: string; category: "major" | "minor"; chemicalId?: string | null }[]
    > = {};

    assignments.forEach((a) => {
      const equipment = a.equipment_name?.trim();
      const name = a.chemical_name?.trim();
      const formula = a.chemical_formula?.trim();
      if (!equipment || !name) return;

      const label = toChemicalDisplay(formula, name);
      const value = label;

      if (!map[equipment]) {
        map[equipment] = [];
      }

      // Avoid duplicate options with the same label and category
      const exists = map[equipment].some(
        (opt) => opt.label === label && opt.category === a.category && opt.chemicalId === a.chemical_id,
      );
      if (!exists) {
        map[equipment].push({
          value,
          label,
          category: a.category,
          chemicalId: a.chemical_id,
        });
      }
    });

    return map;
  }, [assignments]);

  // Load chemical equipment with intervals for missed-reading resolution
  useEffect(() => {
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const chemicalCat = categories?.find((c) => {
          const n = (c.name || "").toLowerCase().trim();
          return n === "chemical" || n === "chemicals";
        });
        if (chemicalCat) {
          const list = (await equipmentAPI.list({ category: chemicalCat.id })) as any[];
          const withIntervals = (list || []).map((e: any) => ({
            id: e.id,
            equipment_number: e.equipment_number || "",
            name: e.name || "",
            log_entry_interval: e.log_entry_interval ?? null,
            shift_duration_hours: e.shift_duration_hours ?? null,
            tolerance_minutes: e.tolerance_minutes ?? null,
          }));
          setEquipmentWithIntervals(withIntervals);
        } else {
          setEquipmentWithIntervals([]);
        }
      } catch {
        setEquipmentWithIntervals([]);
      }
    })();
  }, []);

  // Load equipment options and assignments so Equipment dropdown shows only approved equipment
  useEffect(() => {
    (async () => {
      try {
        const data = await chemicalAssignmentAPI.list();
        const allRows = (data as any[]).map((row) => ({
          equipment_name: String((row as any).equipment_name ?? ""),
          category: ((row as any).category || "major") as "major" | "minor",
          chemical_name: String((row as any).chemical_name ?? ""),
          chemical_formula: String((row as any).chemical_formula ?? ""),
          chemical_id: (row as any).chemical ?? null,
          location: (row as any).location != null ? String((row as any).location) : null,
          status: (row as any).status as string | undefined,
        }));
        setAssignments(allRows);
        // Only show equipment that have at least one approved assignment
        const approvedRows = allRows.filter((r) => r.status === "approved");
        const seen = new Set<string>();
        const eqOpts: { id: string; name: string }[] = [];
        approvedRows.forEach((r) => {
          if (r.equipment_name && !seen.has(r.equipment_name)) {
            seen.add(r.equipment_name);
            eqOpts.push({ id: r.equipment_name, name: r.equipment_name });
          }
        });
        setEquipmentOptions(eqOpts);
      } catch (error) {
        console.error("Error loading equipment assignments:", error);
      }
    })();
  }, []);

  // Derive selectedChemicalId from assignment; when assignment has no chemical link, resolve ID from master list
  useEffect(() => {
    if (!formData.equipmentName || !formData.chemicalName || assignments.length === 0) {
      setSelectedChemicalId(null);
      setResolvedChemicalId(null);
      return;
    }
    const assignment = assignments.find(
      (a) =>
        a.equipment_name === formData.equipmentName &&
        toChemicalDisplay(a.chemical_formula, a.chemical_name) === (formData.chemicalName || "").trim(),
    );
    const fromAssignment = assignment?.chemical_id ?? null;
    setSelectedChemicalId(fromAssignment);

    // When assignment has no chemical master link, try to resolve by name/formula so we can still show stock
    if (fromAssignment) {
      setResolvedChemicalId(null);
      return;
    }
    if (!assignment || chemicalMasterList.length === 0) {
      setResolvedChemicalId(null);
      return;
    }
    const match = chemicalMasterList.find((c) => {
      const sameFormulaName =
        (c.formula || "").trim().toLowerCase() === (assignment.chemical_formula || "").trim().toLowerCase() &&
        (c.name || "").trim().toLowerCase() === (assignment.chemical_name || "").trim().toLowerCase();
      const sameDisplay = toChemicalDisplay(c.formula, c.name) === (formData.chemicalName || "").trim();
      return sameFormulaName || sameDisplay;
    });
    setResolvedChemicalId(match?.id ?? null);
  }, [formData.equipmentName, formData.chemicalName, assignments, chemicalMasterList]);

  // Normalize assignment location to backend filter value (water_system, cooling_towers, boiler)
  const normalizeLocationForApi = (loc: string | null | undefined): string | null => {
    if (!loc || !String(loc).trim()) return null;
    const v = String(loc).trim().toLowerCase();
    if (v.includes("water") && !v.includes("cooling")) return "water_system";
    if (v.includes("cooling") || v === "cooling_towers") return "cooling_towers";
    if (v === "boiler") return "boiler";
    return null;
  };

  // Load stock when chemical is known (from assignment or resolved from master list), or by location + name/formula match
  const chemicalIdForStock = selectedChemicalId || resolvedChemicalId;
  const currentAssignment = useMemo(() => {
    if (!formData.equipmentName || !formData.chemicalName || assignments.length === 0) return null;
    return assignments.find(
      (a) =>
        a.equipment_name === formData.equipmentName &&
        toChemicalDisplay(a.chemical_formula, a.chemical_name) === (formData.chemicalName || "").trim(),
    ) ?? null;
  }, [formData.equipmentName, formData.chemicalName, assignments]);

  useEffect(() => {
    if (chemicalIdForStock) {
      (async () => {
        try {
          const data = await chemicalStockAPI.getAvailable(chemicalIdForStock);
          setSelectedStockInfo({
            availableQtyKg: data?.available_qty_kg ?? null,
            unit: data?.unit ?? null,
            pricePerUnit: data?.price_per_unit ?? null,
            site: null,
          });
        } catch (error: any) {
          toast.error(error?.message ?? "Failed to load stock details for selected chemical.");
          setSelectedStockInfo(null);
        }
      })();
      return;
    }
    // Fallback: no chemical ID (e.g. assignment created without linking master). Fetch stock by assignment location and match by name/formula.
    if (!currentAssignment?.chemical_name && !currentAssignment?.chemical_formula) {
      setSelectedStockInfo(null);
      return;
    }
    const locationKey = normalizeLocationForApi(currentAssignment?.location ?? undefined);
    if (!locationKey) {
      setSelectedStockInfo(null);
      return;
    }
    (async () => {
      try {
        const stockList = await chemicalStockAPI.list({ location: locationKey });
        if (!Array.isArray(stockList) || stockList.length === 0) {
          setSelectedStockInfo(null);
          return;
        }
        const name = (currentAssignment!.chemical_name || "").trim().toLowerCase();
        const formula = (currentAssignment!.chemical_formula || "").trim().toLowerCase();
        const match = stockList.find((row: any) => {
          const rName = (row.chemical_name ?? "").trim().toLowerCase();
          const rFormula = (row.chemical_formula ?? "").trim().toLowerCase();
          return rName === name && rFormula === formula;
        });
        if (match) {
          const chemId = match.chemical ?? match.chemical_id;
          if (chemId) {
            try {
              const data = await chemicalStockAPI.getAvailable(chemId);
              setSelectedStockInfo({
                availableQtyKg: data?.available_qty_kg ?? null,
                unit: data?.unit ?? null,
                pricePerUnit: data?.price_per_unit ?? null,
                site: match.site ?? null,
              });
            } catch {
              setSelectedStockInfo({
                availableQtyKg: match.available_qty_kg ?? null,
                unit: match.unit ?? null,
                pricePerUnit: match.price_per_unit ?? null,
                site: match.site ?? null,
              });
            }
          } else {
            setSelectedStockInfo({
              availableQtyKg: match.available_qty_kg ?? null,
              unit: match.unit ?? null,
              pricePerUnit: match.price_per_unit ?? null,
              site: match.site ?? null,
            });
          }
        } else {
          setSelectedStockInfo(null);
        }
      } catch (error: any) {
        setSelectedStockInfo(null);
      }
    })();
  }, [chemicalIdForStock, currentAssignment]);

  const uniqueCheckedBy = useMemo(() => {
    if (!logs.length) return [];
    return Array.from(new Set(logs.map((log) => log.checkedBy).filter(Boolean))).sort();
  }, [logs]);

  // Chemical logbook currently has no numeric limit rules configured for row-level out-of-limit detection.
  const hasOutOfLimitReadings = (_log: ChemicalPrepLog): boolean => false;

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
      result = result.filter(
        (log) =>
          log.equipmentName &&
          log.equipmentName.toString().toLowerCase() === filters.equipmentName.toLowerCase(),
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
    try {
      if (!formData.remarks.trim()) {
        toast.error("Remarks are required.");
        return;
      }

      if (!formData.equipmentName) {
        toast.error("Please select Equipment Name.");
        return;
      }
      const selectedEquipmentMeta = equipmentWithIntervals.find(
        (e) =>
          e.name === formData.equipmentName ||
          e.equipment_number === formData.equipmentName ||
          `${e.equipment_number} – ${e.name}` === formData.equipmentName,
      );
      if (selectedEquipmentMeta?.id) {
        if (
          entryLogInterval === "shift" &&
          (entryShiftDurationHours === "" ||
            Number(entryShiftDurationHours) < 1 ||
            Number(entryShiftDurationHours) > 24)
        ) {
          toast.error("Shift duration must be between 1 and 24 hours.");
          return;
        }
        await equipmentAPI.patch(selectedEquipmentMeta.id, {
          log_entry_interval: entryLogInterval || null,
          shift_duration_hours:
            entryLogInterval === "shift" && entryShiftDurationHours !== ""
              ? Number(entryShiftDurationHours)
              : null,
          tolerance_minutes:
            entryToleranceMinutes === "" ? null : Math.max(0, Number(entryToleranceMinutes) || 0),
        });
      }
      if (!formData.chemicalName) {
        toast.error("Please select Chemical Name.");
        return;
      }

      if (!isReadingsApplicable) {
        const prepData: Record<string, unknown> = {
          equipment_name: formData.equipmentName,
          chemical_name: formData.chemicalName,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
          remarks: formData.remarks || undefined,
          checked_by: user?.name || user?.email || "Unknown",
          done_by: formData.doneBy || user?.name || user?.email || "Unknown",
          chemical_category: formData.chemicalCategory,
          batch_no: formData.batchNo || undefined,
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
            editingChemicalLog.status === "rejected" || editingChemicalLog.status === "pending_secondary_approval";
          if (isCorrection && editingChemicalLog.operator_id !== user?.id) {
            toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
            return;
          }
          if (isCorrection) {
            await chemicalPrepAPI.correct(editingLogId, prepData as any);
            toast.success("Chemical entry corrected as new entry.");
          } else {
            await chemicalPrepAPI.update(editingLogId, prepData as any);
            toast.success("Chemical entry updated successfully.");
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
          await chemicalPrepAPI.create(prepData as any);
          toast.success("Chemical entry saved successfully");
        }
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
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
        setIsDialogOpen(false);
        await refreshLogs();
        return;
      }
      const required = [
        { key: "equipmentName", label: "Equipment Name" },
        { key: "chemicalName", label: "Chemical Name" },
        { key: "batchNo", label: "Batch No" },
        ...(formData.chemicalCategory === "major"
          ? ([{ key: "chemicalConcentration", label: "Chemical Concentration", numeric: true }] as const)
          : []),
        ...(formData.chemicalCategory === "major"
          ? ([
              { key: "solutionConcentration", label: "Solution Concentration", numeric: true },
              { key: "waterQty", label: "Water Quantity", numeric: true },
            ] as const)
          : []),
        { key: "chemicalQty", label: "Chemical Quantity", numeric: true },
        { key: "remarks", label: "Remarks" },
      ] as const;

      // Done By is auto-filled from current user when empty; no need to require it
      const err = firstRequiredFieldError(formData, required as any);
      if (err) {
        toast.error(err);
        return;
      }

      // Stock check: when chemical is known (or resolved by location), block if no stock or qty > available
      const stockCheckApplies =
        chemicalIdForStock ||
        (currentAssignment && normalizeLocationForApi(currentAssignment.location ?? undefined));
      if (stockCheckApplies) {
        if (
          !selectedStockInfo ||
          selectedStockInfo.availableQtyKg == null ||
          selectedStockInfo.availableQtyKg === 0
        ) {
          toast.error("No stock available for this chemical. Please add stock before logging.");
          return;
        }
        const enteredQty = parseFloat(formData.chemicalQty);
        if (enteredQty > selectedStockInfo.availableQtyKg) {
          toast.error(
            `Entered quantity exceeds available stock (${selectedStockInfo.availableQtyKg} ${selectedStockInfo.unit ?? "kg"}).`,
          );
          return;
        }
      }

      const solutionConcentrationValue =
        formData.chemicalCategory === "major" ? parseFloat(formData.solutionConcentration) : undefined;
      const waterQtyValue =
        formData.chemicalCategory === "major" ? parseFloat(formData.waterQty) : undefined;
      const chemicalConcentrationValue =
        formData.chemicalCategory === "major"
          ? parseFloat(formData.chemicalConcentration)
          : undefined;

      const prepData: Record<string, unknown> = {
        equipment_name: formData.equipmentName,
        chemical: chemicalIdForStock || undefined,
        chemical_name: formData.chemicalName,
        activity_type: maintenanceTimings.activityType,
        activity_from_date: maintenanceTimings.fromDate || undefined,
        activity_to_date: maintenanceTimings.toDate || undefined,
        activity_from_time: maintenanceTimings.fromTime || undefined,
        activity_to_time: maintenanceTimings.toTime || undefined,
        chemical_percent: undefined,
        chemical_concentration: chemicalConcentrationValue,
        chemical_category: formData.chemicalCategory,
        solution_concentration: solutionConcentrationValue,
        water_qty: waterQtyValue,
        chemical_qty: (parseFloat(formData.chemicalQty) || 0) * 1000,
        batch_no: formData.batchNo,
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
          editingChemicalLog.status === "rejected" || editingChemicalLog.status === "pending_secondary_approval";
        if (isCorrection && editingChemicalLog.operator_id !== user?.id) {
          toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
          return;
        }
        if (isCorrection) {
          await chemicalPrepAPI.correct(editingLogId, prepData as any);
          toast.success("Chemical entry corrected as new entry.");
        } else {
          await chemicalPrepAPI.update(editingLogId, prepData as any);
          toast.success("Chemical entry updated successfully.");
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
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
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
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
        setIsDialogOpen(false);
        await refreshLogs();
      }
    } catch (error: any) {
      console.error("Error saving chemical entry:", error);
      toast.error(getReadableApiError(error, "Failed to save chemical preparation entry"));
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
      await chemicalPrepAPI.approve(id, "approve", remarks);
      toast.success("Chemical entry approved successfully");
      await refreshLogs();
    } catch (error: any) {
      console.error("Error approving chemical entry:", error);
      toast.error(error?.response?.data?.error || error?.message || "Failed to approve chemical entry");
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

  const stockValidationApplies =
    !!(
      chemicalIdForStock ||
      (currentAssignment && normalizeLocationForApi(currentAssignment.location ?? undefined))
    );
  const enteredChemicalQty = parseFloat(formData.chemicalQty);
  const isChemicalQtyOverStock =
    stockValidationApplies &&
    formData.chemicalQty !== "" &&
    Number.isFinite(enteredChemicalQty) &&
    !!selectedStockInfo &&
    selectedStockInfo.availableQtyKg != null &&
    enteredChemicalQty > selectedStockInfo.availableQtyKg;

  return (
    <>
      <Header
        title="Chemical Log Book"
        subtitle="Manage chemical preparations"
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
          logTypeLabel="Chemical"
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
                    <Select
                      value={filters.equipmentName || "all"}
                      onValueChange={(v) => setFilters({ ...filters, equipmentName: v === "all" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {equipmentOptions.map((eq) => (
                          <SelectItem key={eq.id} value={eq.name}>
                            {eq.name}
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

                  <MaintenanceTimingsSection value={maintenanceTimings} onChange={setMaintenanceTimings} />

                  <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8">
                    <div className="space-y-2">
                      <Label>Equipment Name *</Label>
                      <Select
                        value={formData.equipmentName || "__none__"}
                        onValueChange={(v) => {
                          const nextEquipmentName = v === "__none__" ? "" : v;
                          const optionsForEquipment =
                            nextEquipmentName
                              ? (chemOptionsByEquipment[nextEquipmentName] || [])
                              : [];
                          const autoCategory: "major" | "minor" =
                            optionsForEquipment.length > 0
                              ? optionsForEquipment[0].category
                              : "major";
                          const selectedEquipmentMeta = equipmentWithIntervals.find(
                            (e) =>
                              e.name === nextEquipmentName ||
                              e.equipment_number === nextEquipmentName ||
                              `${e.equipment_number} – ${e.name}` === nextEquipmentName,
                          );
                          setFormData({
                            ...formData,
                            equipmentName: nextEquipmentName,
                            // Clear chemical-related fields; user must pick chemical explicitly
                            chemicalName: "",
                            // Auto-fetch category from assignment for selected equipment
                            chemicalCategory: autoCategory,
                          });
                          setEntryLogInterval(
                            (selectedEquipmentMeta?.log_entry_interval as LogEntryIntervalType) || "",
                          );
                          setEntryShiftDurationHours(
                            selectedEquipmentMeta?.shift_duration_hours ?? "",
                          );
                          setEntryToleranceMinutes(
                            selectedEquipmentMeta?.tolerance_minutes ?? "",
                          );
                          setSelectedChemicalId(null);
                          setResolvedChemicalId(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select equipment" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          <SelectItem value="__none__">Select equipment</SelectItem>
                          {equipmentOptions.map((eq) => (
                            <SelectItem key={eq.id} value={eq.name}>
                              {eq.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Chemical Category</Label>
                      <Input
                        value={formData.chemicalCategory === "minor" ? "Minor" : "Major"}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>

                  {/* Previous readings for selected equipment with entered-by */}
                  {formData.equipmentName?.trim() && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 mt-4">
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
                              <span className="text-muted-foreground"> — Entered by: {log.checkedBy || log.doneBy || "—"}</span>
                              <div className="mt-1 text-muted-foreground">
                                {log.chemicalName}
                                {log.solutionConcentration != null ? ` · Solution ${log.solutionConcentration}%` : ""}
                                {log.waterQty != null ? ` · Water ${log.waterQty} L` : ""}
                                {log.chemicalQty != null ? ` · Chemical ${log.chemicalQty} Kg` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-8">
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

                  <div className="mt-4 space-y-2">
                    <Label>Chemical Name *</Label>
                    {(() => {
                      const optionsForEquipment =
                        chemOptionsByEquipment[formData.equipmentName] || [];
                      return (
                        <>
                          <Select
                            value={formData.chemicalName || "__none__"}
                            onValueChange={(v) => {
                              if (v === "__none__") {
                                setFormData({
                                  ...formData,
                                  chemicalName: "",
                                  chemicalCategory: "major",
                                });
                                setSelectedChemicalId(null);
                                setResolvedChemicalId(null);
                                return;
                              }
                              const opt = optionsForEquipment.find(
                                (o) => o.value === v,
                              );
                              if (opt) {
                                setFormData({
                                  ...formData,
                                  chemicalName: opt.label,
                                  chemicalCategory: opt.category,
                                });
                                setSelectedChemicalId(opt.chemicalId ?? null);
                                setResolvedChemicalId(null);
                              }
                            }}
                            disabled={
                              !formData.equipmentName ||
                              optionsForEquipment.length === 0
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !formData.equipmentName
                                    ? "Select equipment first"
                                    : optionsForEquipment.length === 0
                                    ? "No chemicals assigned for this equipment"
                                    : "Select chemical"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              <SelectItem value="__none__">Select chemical</SelectItem>
                              {optionsForEquipment.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {formData.equipmentName &&
                            optionsForEquipment.length === 0 && (
                              <p className="mt-1 text-xs text-amber-600">
                                No chemicals assigned for this equipment. Configure them
                                in Chemical Equipment Assignment.
                              </p>
                            )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="mt-4 space-y-2">
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
                        {formData.chemicalCategory === "major" && (
                          <>
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
                          </>
                        )}
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
                          className={cn(
                            isChemicalQtyOverStock &&
                              "border-destructive bg-destructive/5 text-destructive font-semibold",
                          )}
                          disabled={
                            !!(
                              chemicalIdForStock ||
                              (currentAssignment &&
                                normalizeLocationForApi(
                                  currentAssignment.location ?? undefined,
                                ))
                            ) &&
                            (!selectedStockInfo ||
                              selectedStockInfo.availableQtyKg == null ||
                              selectedStockInfo.availableQtyKg === 0)
                          }
                        />
                        {formData.chemicalName &&
                          (chemicalIdForStock ||
                            (currentAssignment &&
                              normalizeLocationForApi(
                                currentAssignment.location ?? undefined,
                              ))) && (
                            <div className="mt-2 text-sm text-muted-foreground">
                              {selectedStockInfo &&
                              selectedStockInfo.availableQtyKg != null &&
                              selectedStockInfo.availableQtyKg > 0 ? (
                                <span>
                                  Available stock: {selectedStockInfo.availableQtyKg}{" "}
                                  {selectedStockInfo.unit ?? "kg"}
                                </span>
                              ) : (
                                <span className="text-destructive">
                                  No stock available for this chemical. You cannot
                                  enter quantity until stock is added.
                                </span>
                              )}
                            </div>
                          )}
                        {isChemicalQtyOverStock && selectedStockInfo?.availableQtyKg != null && (
                          <p className="text-xs text-destructive">
                            Entered quantity exceeds available stock ({selectedStockInfo.availableQtyKg}{" "}
                            {selectedStockInfo.unit ?? "kg"}).
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  </fieldset>

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
                onClick={handleApproveSelectedClick}
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
                  <th className="px-4 py-2 text-left font-semibold w-[150px]">Equipment</th>
                  <th className="px-4 py-2 text-left font-semibold w-[130px]">Chemical</th>
                  <th className="px-4 py-2 text-left font-semibold min-w-[140px]">Readings</th>
                  <th className="px-4 py-2 text-left font-semibold w-[100px] whitespace-nowrap">Batch No</th>
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
                      colSpan={15}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No Chemical Log Book entries found.
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
                      <span className="text-sm font-medium text-foreground">{log.equipmentName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-foreground">{log.chemicalName}</span>
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-foreground">{log.batchNo || "-"}</span>
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
                                to={`/reports?tab=audit-trail&object_type=chemical_log&object_id=${log.id}`}
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
                            onClick={() => handleDelete(log.id)}
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
                    {log.equipmentName} · {log.chemicalName} · {log.date} {log.time}
                  </span>
                ) : null;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
            {readingsModalLogId && (() => {
              const log = filteredLogs.find((l) => l.id === readingsModalLogId);
              if (!log) return null;
              const renderItem = (label: string, value: string | number) => (
                <div
                  key={label}
                  className="flex justify-between items-center gap-4 py-2.5 px-3 rounded-lg text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="font-medium text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{value}</span>
                </div>
              );
              const items = [
                log.chemicalPercent != null && renderItem("Chemical %", `${log.chemicalPercent}%`),
                log.chemicalConcentration != null && renderItem("Chemical concentration", `${log.chemicalConcentration}%`),
                log.solutionConcentration != null && renderItem("Solution concentration (Conc)", `${log.solutionConcentration}%`),
                log.waterQty != null && renderItem("Water", `${log.waterQty} L`),
                log.chemicalQty != null && renderItem("Chemical quantity", `${log.chemicalQty} Kg`),
              ].filter(Boolean);
              return (
                <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Package className="h-4 w-4" />
                    </span>
                    Readings
                  </h4>
                  <div className="space-y-0.5">{items}</div>
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

