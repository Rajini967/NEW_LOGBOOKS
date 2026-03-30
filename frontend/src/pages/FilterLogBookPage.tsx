import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  equipmentCategoryAPI,
  filterAssignmentAPI,
  filterLogAPI,
  filterScheduleAPI,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { firstRequiredFieldError } from "@/lib/requiredFields";
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
import { EntryIntervalBadge } from "@/components/logbook/EntryIntervalBadge";
import { MissedReadingPopup } from "@/components/logbook/MissedReadingPopup";
import {
  getTotalMissingSlots,
  type EquipmentMissInfo,
} from "@/lib/missed-reading";
import { MaintenanceTimingsSection } from "@/components/logbook/MaintenanceTimingsSection";
import type { MaintenanceTimingsValue } from "@/types/maintenance-timings";

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

/** Distinct filter_id values for list-filter dialog (from assignments). */
interface FilterIdFilterOption {
  filter_id: string;
  label: string;
}

interface FilterAssignmentRow {
  id: string;
  filter: string;
  filter_id: string;
  filter_category_name?: string;
  filter_make?: string;
  filter_model?: string;
  is_active?: boolean;
  filter_micron_size?: string;
  filter_size_l?: number | null;
  filter_size_w?: number | null;
  filter_size_h?: number | null;
  tag_info?: string | null;
  area_category?: string | null;
  equipment?: string;
  equipment_number?: string;
  equipment_name?: string;
}

interface FilterLog {
  id: string;
  equipmentId: string;
  category: FilterCategory;
  filterNo: string;
  filterMicron?: string;
  filterSize?: string;
  tagInfo?: string;
  /** From API / assignment; list view shows stored value or resolves from assignments. */
  areaCategory?: string | null;
  installedDate: string;
  replacementApplicable?: boolean;
  cleaningApplicable?: boolean;
  integrityApplicable?: boolean;
  integrityDoneDate?: string | null;
  integrityDueDate: string;
  cleaningDoneDate?: string | null;
  cleaningDueDate: string;
  replacementDueDate: string;
  remarks: string;
  comment?: string;
  checkedBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  timestamp: Date;
  status: "pending" | "approved" | "rejected" | "draft" | "pending_secondary_approval";
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

type ScheduleFreqState = {
  replacement: number | null;
  cleaning: number | null;
  integrity: number | null;
};

const emptyScheduleFreq = (): ScheduleFreqState => ({
  replacement: null,
  cleaning: null,
  integrity: null,
});

/** Due dates: installed + frequency_days when set; else legacy rules (6mo+15d / 1y+30d). */
function dueDatesForInstalled(installedDate: string, freq: ScheduleFreqState): {
  integrityDueDate: string;
  cleaningDueDate: string;
  replacementDueDate: string;
} {
  if (!installedDate) {
    return { integrityDueDate: "", cleaningDueDate: "", replacementDueDate: "" };
  }
  const base = new Date(`${installedDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) {
    return { integrityDueDate: "", cleaningDueDate: "", replacementDueDate: "" };
  }
  const addDays = (d: Date, days: number) => {
    const copy = new Date(d.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  };
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const fromFreq = (days: number | null) =>
    days != null && !Number.isNaN(days) && days >= 0 ? fmt(addDays(base, days)) : null;

  return {
    integrityDueDate: fromFreq(freq.integrity) ?? "",
    cleaningDueDate: fromFreq(freq.cleaning) ?? "",
    replacementDueDate: fromFreq(freq.replacement) ?? "",
  };
}

const CREATOR_ONLY_REJECTED_EDIT_MESSAGE = "Only the original creator can edit/correct a rejected entry.";

/** Normalize assignment area_category for grouping (Register → Assign → Area category). */
const AREA_CATEGORY_DEFAULT_KEY = "__area_default__";
function assignmentAreaCategoryKey(area: string | null | undefined): string {
  const t = String(area ?? "").trim();
  return t ? t : AREA_CATEGORY_DEFAULT_KEY;
}
function assignmentAreaCategoryLabel(key: string): string {
  return key === AREA_CATEGORY_DEFAULT_KEY ? "General (unspecified area)" : key;
}

function formatAssignmentSelectLabel(
  a: FilterAssignmentRow,
  siblings: FilterAssignmentRow[],
): string {
  const makeModel =
    a.filter_make || a.filter_model
      ? ` – ${[a.filter_make, a.filter_model].filter(Boolean).join(" ")}`
      : "";
  let label = `${a.filter_id}${makeModel}`;
  const sameFilter = siblings.filter((x) => x.filter_id === a.filter_id);
  if (sameFilter.length > 1) {
    const hint = (a.tag_info || "").trim() || `id ${a.id.slice(0, 8)}…`;
    const short = hint.length > 44 ? `${hint.slice(0, 41)}…` : hint;
    label = `${label} · ${short}`;
  }
  return label;
}

/** "EN-001 – Name" from Filter Register assignment row. */
function formatAssignmentEquipmentLabel(a: FilterAssignmentRow): string {
  const num = (a.equipment_number ?? "").trim();
  const name = (a.equipment_name ?? "").trim();
  if (num && name) return `${num} – ${name}`;
  return name || num || "";
}

function narrowAssignmentPoolByLogContext(
  pool: FilterAssignmentRow[],
  log: Pick<FilterLog, "areaCategory" | "tagInfo">,
): FilterAssignmentRow[] {
  let p = pool;
  const areaNorm = (log.areaCategory || "").trim().toLowerCase();
  if (p.length > 1 && areaNorm) {
    const byA = p.filter((a) => (a.area_category || "").trim().toLowerCase() === areaNorm);
    if (byA.length >= 1) p = byA;
  }
  if (p.length > 1 && (log.tagInfo || "").trim()) {
    const logTag = (log.tagInfo || "").trim();
    const narrowed = p.filter((m) => {
      const t = (m.tag_info || "").trim();
      if (!t) return false;
      return t === logTag || logTag.startsWith(t) || t.startsWith(logTag);
    });
    if (narrowed.length >= 1) p = narrowed;
  }
  return p;
}

/**
 * Pick the assignment row that best matches a list log (for equipment label).
 * Register list includes all assignments; equipment dropdown options may omit equipment
 * without fully approved schedules, so this must not depend on equipmentOptions alone.
 */
function pickAssignmentForEquipmentColumn(
  log: Pick<FilterLog, "equipmentId" | "filterNo" | "areaCategory" | "tagInfo">,
  rows: FilterAssignmentRow[],
): FilterAssignmentRow | null {
  const raw = (log.equipmentId || "").trim();
  const filterNo = (log.filterNo || "").trim();
  if (!rows.length) return null;

  if (raw) {
    let pool = rows.filter((a) => a.equipment && a.equipment.toLowerCase() === raw.toLowerCase());
    if (pool.length && filterNo) {
      const byF = pool.filter((a) => a.filter_id === filterNo);
      if (byF.length) pool = byF;
    }
    pool = narrowAssignmentPoolByLogContext(pool, log);
    if (pool.length) return pool.find((x) => x.is_active !== false) ?? pool[0];

    let pool2 = rows.filter((a) => a.filter_id === raw);
    if (pool2.length && filterNo && raw !== filterNo) {
      pool2 = pool2.filter((a) => a.filter_id === filterNo);
    }
    pool2 = narrowAssignmentPoolByLogContext(pool2, log);
    if (pool2.length) return pool2.find((x) => x.is_active !== false) ?? pool2[0];
  }

  if (filterNo) {
    let pool3 = rows.filter((a) => a.filter_id === filterNo);
    pool3 = narrowAssignmentPoolByLogContext(pool3, log);
    if (pool3.length === 1) return pool3[0];
    if (pool3.length > 1) return pool3.find((x) => x.is_active !== false) ?? pool3[0];
  }

  return null;
}

/** Resolve equipment UUID for a log row (stored id may be UUID or legacy filter_id). */
function equipmentUuidForFilterLogRow(
  log: Pick<FilterLog, "equipmentId" | "filterNo">,
  equipmentOptions: EquipmentOption[],
  filterIdToEquipmentInterval: Map<
    string,
    {
      equipment_id?: string;
      log_entry_interval?: string | null;
      shift_duration_hours?: number | null;
      tolerance_minutes?: number | null;
    }
  >,
): string | null {
  const raw = (log.equipmentId || "").trim();
  if (!raw) return null;
  const optHit = equipmentOptions.find((o) => o.id && o.id.toLowerCase() === raw.toLowerCase());
  if (optHit) return optHit.id;
  const meta =
    filterIdToEquipmentInterval.get(raw) ??
    filterIdToEquipmentInterval.get(raw.toLowerCase()) ??
    filterIdToEquipmentInterval.get(log.filterNo);
  return meta?.equipment_id ?? null;
}

/** Assignment is eligible when at least one schedule type is approved. */
function assignmentIdsWithAnyApprovedSchedules(
  schedules: { assignment: string; schedule_type: string }[],
): Set<string> {
  const byAssignment = new Map<string, Set<string>>();
  for (const s of schedules) {
    if (!s?.assignment) continue;
    if (!byAssignment.has(s.assignment)) byAssignment.set(s.assignment, new Set());
    byAssignment.get(s.assignment)!.add(s.schedule_type);
  }
  const out = new Set<string>();
  for (const [aid] of byAssignment) {
    out.add(aid);
  }
  return out;
}

const FilterLogBookPage: React.FC = () => {
  const { user, sessionSettings } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<FilterLog[]>([]);
  const [showMissedReadingPopup, setShowMissedReadingPopup] = useState(false);
  const [missedReadingNextDue, setMissedReadingNextDue] = useState<Date | null>(null);
  const [missedEquipments, setMissedEquipments] = useState<EquipmentMissInfo[] | null>(null);
  const [missingRefreshKey, setMissingRefreshKey] = useState(0);
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
  const [editedMaintenanceLogIds, setEditedMaintenanceLogIds] = useState<Set<string>>(new Set());
  const [approvalComment, setApprovalComment] = useState("");
  const [editingCommentLogId, setEditingCommentLogId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState("");
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<FilterCategoryOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [filterIdToEquipmentInterval, setFilterIdToEquipmentInterval] = useState<
    Map<
      string,
      {
        equipment_id?: string;
        log_entry_interval?: string | null;
        shift_duration_hours?: number | null;
        tolerance_minutes?: number | null;
      }
    >
  >(new Map());
  /** All filter assignments for resolving area category on list rows (legacy logs). */
  const [filterAssignmentsLookup, setFilterAssignmentsLookup] = useState<FilterAssignmentRow[]>([]);
  const [entryLogInterval, setEntryLogInterval] = useState<"" | LogEntryIntervalType>("");
  const [entryShiftDurationHours, setEntryShiftDurationHours] = useState<number | "">("");
  const [entryToleranceMinutes, setEntryToleranceMinutes] = useState<number | "">("");
  const [filterIdFilterOptions, setFilterIdFilterOptions] = useState<FilterIdFilterOption[]>([]);
  const [assignmentsOnEquipment, setAssignmentsOnEquipment] = useState<FilterAssignmentRow[]>([]);
  const [selectedAreaCategoryKey, setSelectedAreaCategoryKey] = useState<string>(
    AREA_CATEGORY_DEFAULT_KEY,
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [scheduleFrequencies, setScheduleFrequencies] = useState<ScheduleFreqState>(emptyScheduleFreq());
  const scheduleFreqRef = useRef<ScheduleFreqState>(emptyScheduleFreq());
  const scheduleApplicability = useMemo(
    () => ({
      replacement: scheduleFrequencies.replacement != null && scheduleFrequencies.replacement > 0,
      cleaning: scheduleFrequencies.cleaning != null && scheduleFrequencies.cleaning > 0,
      integrity: scheduleFrequencies.integrity != null && scheduleFrequencies.integrity > 0,
    }),
    [scheduleFrequencies],
  );
  const [selectedEquipmentUuid, setSelectedEquipmentUuid] = useState<string>("");

  useEffect(() => {
    scheduleFreqRef.current = scheduleFrequencies;
  }, [scheduleFrequencies]);

  const uniqueAreaCategoryKeys = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignmentsOnEquipment) {
      set.add(assignmentAreaCategoryKey(a.area_category));
    }
    return Array.from(set).sort((a, b) =>
      assignmentAreaCategoryLabel(a).localeCompare(assignmentAreaCategoryLabel(b)),
    );
  }, [assignmentsOnEquipment]);

  const assignmentsForSelectedArea = useMemo(
    () =>
      assignmentsOnEquipment.filter(
        (a) => assignmentAreaCategoryKey(a.area_category) === selectedAreaCategoryKey,
      ),
    [assignmentsOnEquipment, selectedAreaCategoryKey],
  );

  const [previousReadingsForEquipment, setPreviousReadingsForEquipment] = useState<FilterLog[]>([]);
  const [previousReadingsLoading, setPreviousReadingsLoading] = useState(false);
  const [maintenanceTimings, setMaintenanceTimings] = useState<MaintenanceTimingsValue>({
    activityType: "operation",
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
  });
  const isReadingsApplicable = maintenanceTimings.activityType === "operation";

  const getTodayDateString = () => format(new Date(), "yyyy-MM-dd");

  const [formData, setFormData] = useState({
    equipmentId: "",
    category: "hvac" as FilterCategory,
    filterNo: "",
    filterMicron: "",
    filterSize: "",
    tagInfo: "",
    installedDate: getTodayDateString(),
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

    const base = new Date(`${installedDate}T12:00:00`);
    if (Number.isNaN(base.getTime())) {
      setFormData((prev) => ({ ...prev, installedDate }));
      return;
    }

    const due = dueDatesForInstalled(installedDate, scheduleFreqRef.current);
    setFormData((prev) => ({
      ...prev,
      installedDate,
      integrityDueDate: due.integrityDueDate,
      cleaningDueDate: due.cleaningDueDate,
      replacementDueDate: due.replacementDueDate,
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
      const data = await equipmentCategoryAPI.list();
      const options: FilterCategoryOption[] = (data as any[])
        .filter((c) => c.is_active !== false)
        .filter((c) => !/^chiller(s)?$/i.test(String(c?.name || "").trim()))
        .map((c) => ({
          value: c.name as string,
          label: c.name as string,
        }));
      setCategoryOptions(options);
    } catch (error) {
      console.error("Error loading filter categories:", error);
    }
  };

  /** Load filter_id -> equipment interval map for missed-reading resolution */
  const loadFilterIdToEquipmentInterval = async () => {
    try {
      const assignments = (await filterAssignmentAPI.list()) as FilterAssignmentRow[];
      setFilterAssignmentsLookup((assignments || []) as FilterAssignmentRow[]);
      const equipmentIds = [...new Set((assignments || []).map((a) => a.equipment).filter(Boolean))] as string[];
      if (equipmentIds.length === 0) {
        setFilterIdToEquipmentInterval(new Map());
        return;
      }
      const allEquipment = (await equipmentAPI.list()) as any[];
      const eqIntervalMap = new Map<
        string,
        {
          equipment_id?: string;
          log_entry_interval?: string | null;
          shift_duration_hours?: number | null;
          tolerance_minutes?: number | null;
        }
      >();
      for (const e of allEquipment || []) {
        if (e?.id) {
          eqIntervalMap.set(e.id, {
            equipment_id: e.id,
            log_entry_interval: e.log_entry_interval ?? null,
            shift_duration_hours: e.shift_duration_hours ?? null,
            tolerance_minutes: e.tolerance_minutes ?? null,
          });
        }
      }
      const filterToInterval = new Map<
        string,
        {
          equipment_id?: string;
          log_entry_interval?: string | null;
          shift_duration_hours?: number | null;
          tolerance_minutes?: number | null;
        }
      >();
      const filterIdAssignmentCount = new Map<string, number>();
      for (const a of assignments || []) {
        if (a.filter_id) {
          filterIdAssignmentCount.set(
            a.filter_id,
            (filterIdAssignmentCount.get(a.filter_id) || 0) + 1,
          );
        }
      }
      for (const a of assignments || []) {
        if (a.filter_id && a.equipment) {
          const interval = eqIntervalMap.get(a.equipment);
          if (interval) {
            // Same filter_id on multiple equipment: do not map filter_id → one arbitrary row.
            if (filterIdAssignmentCount.get(a.filter_id) === 1) {
              filterToInterval.set(a.filter_id, interval);
            }
            filterToInterval.set(a.equipment, interval);
          }
        }
      }
      setFilterIdToEquipmentInterval(filterToInterval);
    } catch {
      setFilterIdToEquipmentInterval(new Map());
      setFilterAssignmentsLookup([]);
    }
  };

  const loadEquipment = async () => {
    try {
      const assignments = (await filterAssignmentAPI.list()) as any[];
      let approvedSchedules: { assignment: string; schedule_type: string }[] = [];
      try {
        approvedSchedules = (await filterScheduleAPI.listAll({
          approval: "approved",
        })) as { assignment: string; schedule_type: string }[];
      } catch {
        approvedSchedules = [];
      }
      const eligibleAssignmentIds = assignmentIdsWithAnyApprovedSchedules(approvedSchedules);
      const activeAssignments = (assignments || []).filter(
        (a) => a?.is_active !== false && a?.id && eligibleAssignmentIds.has(a.id),
      );

      const seen = new Set<string>();
      const options: EquipmentOption[] = [];
      const seenFilterId = new Set<string>();
      const filterOpts: FilterIdFilterOption[] = [];
      for (const a of activeAssignments) {
        const id = a?.equipment;
        if (id && !seen.has(id)) {
          seen.add(id);
          options.push({
            id,
            equipment_number: a.equipment_number ?? "",
            name: a.equipment_name ?? "",
          });
        }
        const fid = a?.filter_id as string | undefined;
        if (fid && !seenFilterId.has(fid)) {
          seenFilterId.add(fid);
          filterOpts.push({
            filter_id: fid,
            label: `${fid}${a.equipment_number ? ` – ${a.equipment_number}` : ""}`,
          });
        }
      }
      options.sort((a, b) =>
        `${a.equipment_number} ${a.name}`.localeCompare(`${b.equipment_number} ${b.name}`)
      );
      filterOpts.sort((a, b) => a.filter_id.localeCompare(b.filter_id));
      setEquipmentOptions(options);
      setFilterIdFilterOptions(filterOpts);
    } catch (error) {
      console.error("Error loading equipment from assignments:", error);
      setEquipmentOptions([]);
      setFilterIdFilterOptions([]);
    }
  };

  const formatFilterSize = (a: FilterAssignmentRow) => {
    const parts = [a.filter_size_l, a.filter_size_w, a.filter_size_h].filter(
      (v) => v != null
    );
    if (parts.length === 3) return `${parts[0]} × ${parts[1]} × ${parts[2]}`;
    return "";
  };

  const applyAssignmentRowToForm = (active: FilterAssignmentRow) => {
    const catRaw = (active.filter_category_name || "").trim();
    setFormData((prev) => ({
      ...prev,
      equipmentId: active.filter_id || "",
      category: (catRaw || prev.category || "hvac") as FilterCategory,
      filterNo: active.filter_id || "",
      filterMicron: active.filter_micron_size || prev.filterMicron,
      filterSize: formatFilterSize(active) || prev.filterSize,
      tagInfo: active.tag_info ?? prev.tagInfo,
    }));
    const timingMeta = filterIdToEquipmentInterval.get(active.filter_id || "");
    if (timingMeta) {
      setEntryLogInterval((timingMeta.log_entry_interval as LogEntryIntervalType) || "");
      setEntryShiftDurationHours(timingMeta.shift_duration_hours ?? "");
      setEntryToleranceMinutes(timingMeta.tolerance_minutes ?? "");
    } else {
      setEntryLogInterval("");
      setEntryShiftDurationHours("");
      setEntryToleranceMinutes("");
    }
  };

  const loadApprovedSchedulesForAssignment = async (
    equipmentUuid: string,
    assignmentId: string,
  ) => {
    const nextFreq = emptyScheduleFreq();
    try {
      const rows = (await filterScheduleAPI.list({
        equipment: equipmentUuid,
        approval: "approved",
      })) as any[];
      const mine = (rows || []).filter(
        (s) => s.assignment === assignmentId && s.is_approved === true,
      );
      for (const s of mine) {
        const d =
          s.frequency_days != null && !Number.isNaN(Number(s.frequency_days))
            ? Number(s.frequency_days)
            : null;
        if (s.schedule_type === "replacement") nextFreq.replacement = d;
        else if (s.schedule_type === "cleaning") nextFreq.cleaning = d;
        else if (s.schedule_type === "integrity") nextFreq.integrity = d;
      }
    } catch {
      /* ignore */
    }
    setScheduleFrequencies(nextFreq);
    scheduleFreqRef.current = nextFreq;
    setFormData((prev) => {
      const installed = prev.installedDate || getTodayDateString();
      const due = dueDatesForInstalled(installed, nextFreq);
      return {
        ...prev,
        installedDate: installed,
        integrityDoneDate: nextFreq.integrity ? prev.integrityDoneDate : "",
        cleaningDoneDate: nextFreq.cleaning ? prev.cleaningDoneDate : "",
        integrityDueDate: due.integrityDueDate,
        cleaningDueDate: due.cleaningDueDate,
        replacementDueDate: due.replacementDueDate,
      };
    });
  };

  const maybeToastScheduleOverdue = async (equipmentUuid: string) => {
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

  const onAssignmentRowSelected = async (assignmentId: string, equipmentUuid: string) => {
    const row =
      assignmentsForSelectedArea.find((a) => a.id === assignmentId) ??
      assignmentsOnEquipment.find((a) => a.id === assignmentId);
    if (!row) return;
    setSelectedAssignmentId(assignmentId);
    applyAssignmentRowToForm(row);
    await loadApprovedSchedulesForAssignment(equipmentUuid, assignmentId);
    await maybeToastScheduleOverdue(equipmentUuid);
  };

  const onAreaCategorySelected = async (areaKey: string, equipmentUuid: string) => {
    setSelectedAreaCategoryKey(areaKey);
    const filtered = assignmentsOnEquipment.filter(
      (a) => assignmentAreaCategoryKey(a.area_category) === areaKey,
    );
    const chosen = filtered[0];
    if (!chosen) return;
    setSelectedAssignmentId(chosen.id);
    applyAssignmentRowToForm(chosen);
    await loadApprovedSchedulesForAssignment(equipmentUuid, chosen.id);
    await maybeToastScheduleOverdue(equipmentUuid);
  };

  /** Equipment drives filter assignment(s), approved schedules, and due dates. */
  const onEquipmentSelectedForTagInfo = async (equipmentUuid: string) => {
    setSelectedEquipmentUuid(equipmentUuid);
    try {
      const assignments = (await filterAssignmentAPI.list({
        equipment: equipmentUuid,
      })) as FilterAssignmentRow[];
      const activeList = (assignments || []).filter((a) => a.is_active !== false);
      if (!activeList.length) {
        toast.error(
          "No filter assignment for this equipment. Assign an approved filter in Filter Register first.",
        );
        setAssignmentsOnEquipment([]);
        setSelectedAreaCategoryKey(AREA_CATEGORY_DEFAULT_KEY);
        setSelectedAssignmentId("");
        setScheduleFrequencies(emptyScheduleFreq());
        scheduleFreqRef.current = emptyScheduleFreq();
        setFormData((prev) => ({
          ...prev,
          tagInfo: "",
          filterNo: "",
          equipmentId: "",
          filterMicron: "",
          filterSize: "",
        }));
        return;
      }

      setAssignmentsOnEquipment(activeList);
      const keys = [
        ...new Set(activeList.map((a) => assignmentAreaCategoryKey(a.area_category))),
      ].sort((a, b) =>
        assignmentAreaCategoryLabel(a).localeCompare(assignmentAreaCategoryLabel(b)),
      );
      const defaultKey = keys[0] ?? AREA_CATEGORY_DEFAULT_KEY;
      setSelectedAreaCategoryKey(defaultKey);
      const inArea = activeList.filter(
        (a) => assignmentAreaCategoryKey(a.area_category) === defaultKey,
      );
      const chosen = inArea[0] ?? activeList[0];
      setSelectedAssignmentId(chosen.id);
      applyAssignmentRowToForm(chosen);
      await loadApprovedSchedulesForAssignment(equipmentUuid, chosen.id);
      await maybeToastScheduleOverdue(equipmentUuid);
    } catch {
      setFormData((prev) => ({ ...prev, tagInfo: "" }));
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
          equipmentId: log.equipment_id ?? "",
          category: log.category,
          filterNo: log.filter_no,
          filterMicron: log.filter_micron || "",
          filterSize: log.filter_size || "",
          tagInfo: log.tag_info || "",
          areaCategory: log.area_category ?? null,
          installedDate: log.installed_date,
          replacementApplicable:
            typeof log.replacement_applicable === "boolean" ? log.replacement_applicable : true,
          cleaningApplicable:
            typeof log.cleaning_applicable === "boolean" ? log.cleaning_applicable : true,
          integrityApplicable:
            typeof log.integrity_applicable === "boolean" ? log.integrity_applicable : true,
          integrityDoneDate: log.integrity_done_date,
          integrityDueDate: log.integrity_due_date,
          cleaningDoneDate: log.cleaning_done_date,
          cleaningDueDate: log.cleaning_due_date,
          replacementDueDate: log.replacement_due_date,
          remarks: log.remarks || "",
          comment: log.comment || "",
          checkedBy: log.operator_name,
          approvedBy:
            log.status === "approved"
              ? (log.secondary_approved_by_name || log.approved_by_name || "")
              : "",
          rejectedBy:
            log.status === "rejected" || log.status === "pending_secondary_approval"
              ? (log.approved_by_name || "")
              : "",
          timestamp,
          status: log.status as FilterLog["status"],
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
          tolerance_status: log.tolerance_status as FilterLog["tolerance_status"],
          activity_type: log.activity_type,
          activity_from_date: log.activity_from_date,
          activity_to_date: log.activity_to_date,
          activity_from_time: log.activity_from_time,
          activity_to_time: log.activity_to_time,
        });
      });

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(allLogs);
      setFilteredLogs(allLogs);
      setMissingRefreshKey((prev) => prev + 1);
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
    void loadFilterIdToEquipmentInterval();
    void refreshLogs();
  }, []);

  useEffect(() => {
    const selectedDate = filters.fromDate || format(new Date(), "yyyy-MM-dd");
    filterLogAPI
      .missingSlots({ date: selectedDate })
      .then((payload) => {
        const mapped: EquipmentMissInfo[] = (payload?.equipments || []).map((eq) => ({
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
        }));
        const anyMisses = mapped.some((m) => (m.missingSlotCount || 0) > 0);
        if (!anyMisses) {
          setMissedEquipments(null);
          setShowMissedReadingPopup(false);
          setMissedReadingNextDue(null);
          return;
        }
        mapped.sort((a, b) => {
          const diff = (b.missingSlotCount || 0) - (a.missingSlotCount || 0);
          if (diff !== 0) return diff;
          return (a.equipmentName || a.equipmentId).localeCompare(b.equipmentName || b.equipmentId);
        });
        setMissedEquipments(mapped);
        const firstNext =
          mapped
            .map((m) => m.nextDue)
            .filter((d): d is Date => !!d)
            .sort((a, b) => a.getTime() - b.getTime())[0] || null;
        setMissedReadingNextDue(firstNext);
      })
      .catch(() => {
        setMissedEquipments(null);
        setShowMissedReadingPopup(false);
        setMissedReadingNextDue(null);
      });
  }, [filters.fromDate, missingRefreshKey]);

  useEffect(() => {
    if (!isDialogOpen || !!editingLogId) return;
    if (!formData.equipmentId) return;
    if (entryLogInterval !== "" || entryShiftDurationHours !== "" || entryToleranceMinutes !== "") return;
    const timingMeta = filterIdToEquipmentInterval.get(formData.equipmentId);
    if (!timingMeta) return;
    setEntryLogInterval((timingMeta.log_entry_interval as LogEntryIntervalType) || "");
    setEntryShiftDurationHours(timingMeta.shift_duration_hours ?? "");
    setEntryToleranceMinutes(timingMeta.tolerance_minutes ?? "");
  }, [
    isDialogOpen,
    editingLogId,
    formData.equipmentId,
    filterIdToEquipmentInterval,
    entryLogInterval,
    entryShiftDurationHours,
    entryToleranceMinutes,
  ]);

  const missedReadingsCount = getTotalMissingSlots(missedEquipments);
  const hasMissedReadings = missedReadingsCount > 0;

  // After equipment selection, fetch previous readings with entered-by for that equipment
  useEffect(() => {
    const timingMeta = filterIdToEquipmentInterval.get(formData.equipmentId);
    const eqIdForApi =
      selectedEquipmentUuid || timingMeta?.equipment_id || formData.equipmentId;
    if (!eqIdForApi) {
      setPreviousReadingsForEquipment([]);
      return;
    }
    let cancelled = false;
    setPreviousReadingsLoading(true);
    filterLogAPI
      .list({ equipment_id: eqIdForApi })
      .then((raw: any[]) => {
        if (cancelled) return;
        const list: FilterLog[] = (Array.isArray(raw) ? raw : []).slice(0, 10).map((log: any) => {
          const timestamp = new Date(log.timestamp);
          return {
            id: log.id,
            equipmentId: log.equipment_id ?? "",
            category: log.category,
            filterNo: log.filter_no,
            filterMicron: log.filter_micron || "",
            filterSize: log.filter_size || "",
            tagInfo: log.tag_info || "",
            replacementApplicable:
              typeof log.replacement_applicable === "boolean" ? log.replacement_applicable : true,
            cleaningApplicable:
              typeof log.cleaning_applicable === "boolean" ? log.cleaning_applicable : true,
            integrityApplicable:
              typeof log.integrity_applicable === "boolean" ? log.integrity_applicable : true,
            installedDate: log.installed_date,
            integrityDoneDate: log.integrity_done_date,
            integrityDueDate: log.integrity_due_date,
            cleaningDoneDate: log.cleaning_done_date,
            cleaningDueDate: log.cleaning_due_date,
            replacementDueDate: log.replacement_due_date,
            remarks: log.remarks || "",
            comment: log.comment || "",
            checkedBy: log.operator_name,
            approvedBy:
              log.status === "approved"
                ? (log.secondary_approved_by_name || log.approved_by_name || "")
                : "",
            rejectedBy:
              log.status === "rejected" || log.status === "pending_secondary_approval"
                ? (log.approved_by_name || "")
                : "",
            timestamp,
            status: log.status,
            operator_id: log.operator_id,
            approved_by_id: log.approved_by_id,
            corrects_id: log.corrects_id,
            has_corrections: log.has_corrections,
          };
        });
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
  }, [formData.equipmentId, selectedEquipmentUuid, filterIdToEquipmentInterval]);

  const uniqueCheckedBy = useMemo(() => {
    if (!logs.length) return [];
    return Array.from(new Set(logs.map((log) => log.checkedBy).filter(Boolean))).sort();
  }, [logs]);

  /** List column: DB may store Equipment.id or legacy filter_id in equipment_id. */
  const resolveEquipmentDisplayForLog = useCallback(
    (log: FilterLog): string => {
      const raw = (log.equipmentId || "").trim();

      const byId = equipmentOptions.find(
        (o) => o.id && raw && o.id.toLowerCase() === raw.toLowerCase(),
      );
      if (byId) return `${byId.equipment_number} – ${byId.name}`;

      const fromAssign = pickAssignmentForEquipmentColumn(log, filterAssignmentsLookup);
      const assignLabel = fromAssign ? formatAssignmentEquipmentLabel(fromAssign) : "";
      if (assignLabel) return assignLabel;

      const meta =
        filterIdToEquipmentInterval.get(raw) ??
        (raw ? filterIdToEquipmentInterval.get(raw.toLowerCase()) : undefined) ??
        filterIdToEquipmentInterval.get(log.filterNo);
      const uuid = meta?.equipment_id;
      if (uuid) {
        const byUuid = equipmentOptions.find(
          (o) => o.id && o.id.toLowerCase() === uuid.toLowerCase(),
        );
        if (byUuid) return `${byUuid.equipment_number} – ${byUuid.name}`;
        const a2 = pickAssignmentForEquipmentColumn(
          { ...log, equipmentId: uuid },
          filterAssignmentsLookup,
        );
        const lab = a2 ? formatAssignmentEquipmentLabel(a2) : "";
        if (lab) return lab;
      }

      const tag = (log.tagInfo || "").trim();
      const pipe = tag.indexOf(" | ");
      if (pipe > 0) return tag.slice(0, pipe).trim();

      return raw || "—";
    },
    [equipmentOptions, filterIdToEquipmentInterval, filterAssignmentsLookup],
  );

  const resolveAreaCategoryForLog = useCallback(
    (log: FilterLog): string => {
      const stored = (log.areaCategory || "").trim();
      if (stored) return stored;
      const eq = equipmentUuidForFilterLogRow(log, equipmentOptions, filterIdToEquipmentInterval);
      if (!eq) return "—";
      const matches = filterAssignmentsLookup.filter(
        (a) =>
          a.equipment === eq &&
          a.filter_id === log.filterNo &&
          a.is_active !== false,
      );
      if (matches.length === 0) return "—";
      const distinct = [
        ...new Set(matches.map((m) => (m.area_category || "").trim()).filter(Boolean)),
      ];
      if (distinct.length === 1) return distinct[0];
      if (distinct.length > 1) {
        const logTag = (log.tagInfo || "").trim();
        if (logTag) {
          const narrowed = matches.filter((m) => {
            const t = (m.tag_info || "").trim();
            if (!t) return false;
            return t === logTag || logTag.startsWith(t) || t.startsWith(logTag);
          });
          if (narrowed.length === 1) {
            const ac = (narrowed[0].area_category || "").trim();
            return ac || "General (unspecified area)";
          }
          const narrowedAreas = [
            ...new Set(narrowed.map((m) => (m.area_category || "").trim()).filter(Boolean)),
          ];
          if (narrowedAreas.length === 1) return narrowedAreas[0];
        }
        return "—";
      }
      return "General (unspecified area)";
    },
    [equipmentOptions, filterIdToEquipmentInterval, filterAssignmentsLookup],
  );

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
      const fid = filters.equipmentId.toLowerCase();
      result = result.filter((log) => {
        if (!log.equipmentId) return false;
        if (log.equipmentId.toString().toLowerCase() === fid) return true;
        const fromStored = filterIdToEquipmentInterval.get(log.equipmentId)?.equipment_id;
        if (fromStored && fromStored.toLowerCase() === fid) return true;
        const fromFilterNo = filterIdToEquipmentInterval.get(log.filterNo)?.equipment_id;
        if (fromFilterNo && fromFilterNo.toLowerCase() === fid) return true;
        return false;
      });
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
  const approvablePendingLogs = useMemo(
    () =>
      pendingDraftLogs.filter(
        (log) =>
          (!log.operator_id || log.operator_id !== user?.id) &&
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
    setAssignmentsOnEquipment([]);
    setSelectedAreaCategoryKey(AREA_CATEGORY_DEFAULT_KEY);
    setSelectedAssignmentId("");
    setScheduleFrequencies(emptyScheduleFreq());
    scheduleFreqRef.current = emptyScheduleFreq();
    setEntryLogInterval("");
    setEntryShiftDurationHours("");
    setEntryToleranceMinutes("");
    const today = getTodayDateString();
    const due = dueDatesForInstalled(today, emptyScheduleFreq());
    setFormData({
      equipmentId: "",
      category: "hvac",
      filterNo: "",
      filterMicron: "",
      filterSize: "",
      tagInfo: "",
      installedDate: today,
      integrityDoneDate: "",
      cleaningDoneDate: "",
      integrityDueDate: due.integrityDueDate,
      cleaningDueDate: due.cleaningDueDate,
      replacementDueDate: due.replacementDueDate,
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
    const timestampStr = format(log.timestamp, "yyyy-MM-dd'T'HH:mm");
    const [datePart, timePart] = timestampStr.split("T");
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
    setMaintenanceTimings({
      activityType: (log.activity_type as "operation" | "maintenance" | "shutdown") || "operation",
      fromDate: log.activity_from_date || "",
      toDate: log.activity_to_date || "",
      fromTime: log.activity_from_time || "",
      toTime: log.activity_to_time || "",
    });
    setScheduleFrequencies(emptyScheduleFreq());
    scheduleFreqRef.current = emptyScheduleFreq();
    const timingMeta = filterIdToEquipmentInterval.get(log.equipmentId);
    if (timingMeta?.equipment_id) {
      setSelectedEquipmentUuid(timingMeta.equipment_id);
      void (async () => {
        try {
          const assigns = (await filterAssignmentAPI.list({
            equipment: timingMeta.equipment_id!,
          })) as FilterAssignmentRow[];
          const list = assigns.filter((a) => a.is_active !== false);
          setAssignmentsOnEquipment(list);
          const m = list.find(
            (a) =>
              a.equipment === log.equipmentId ||
              a.filter_id === log.filterNo ||
              a.filter_id === log.equipmentId,
          );
          if (m) {
            setSelectedAreaCategoryKey(assignmentAreaCategoryKey(m.area_category));
            setSelectedAssignmentId(m.id);
          } else {
            const first = list[0];
            setSelectedAreaCategoryKey(
              first ? assignmentAreaCategoryKey(first.area_category) : AREA_CATEGORY_DEFAULT_KEY,
            );
            setSelectedAssignmentId(first?.id ?? "");
          }
        } catch {
          setAssignmentsOnEquipment([]);
          setSelectedAreaCategoryKey(AREA_CATEGORY_DEFAULT_KEY);
          setSelectedAssignmentId("");
        }
      })();
    } else {
      setSelectedEquipmentUuid("");
      setAssignmentsOnEquipment([]);
      setSelectedAreaCategoryKey(AREA_CATEGORY_DEFAULT_KEY);
      setSelectedAssignmentId("");
    }
    setEditingLogId(log.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error("You must be logged in to submit entries");
      return;
    }
    // For non-operation activities, do not block submit on all readings fields.
    if (!formData.equipmentId) {
      toast.error("Select equipment with an assigned filter (Filter Register → Assign to equipment).");
      return;
    }
    // formData.equipmentId is the assignment filter_id (e.g. FMT-0001). The interval map uses that
    // key for only one row when the same filter is on multiple equipment—wrong for save. Always
    // prefer the equipment UUID from the Equipment Name dropdown.
    const equipUuid = (selectedEquipmentUuid || "").trim();
    const timingMeta =
      (equipUuid ? filterIdToEquipmentInterval.get(equipUuid) : undefined) ??
      filterIdToEquipmentInterval.get(formData.equipmentId);
    const equipmentIdForPatch = equipUuid || timingMeta?.equipment_id || "";
    if (equipmentIdForPatch) {
      if (
        entryLogInterval === "shift" &&
        (entryShiftDurationHours === "" ||
          Number(entryShiftDurationHours) < 1 ||
          Number(entryShiftDurationHours) > 24)
      ) {
        toast.error("Shift duration must be between 1 and 24 hours.");
        return;
      }
      await equipmentAPI.patch(equipmentIdForPatch, {
        log_entry_interval: entryLogInterval || null,
        shift_duration_hours:
          entryLogInterval === "shift" && entryShiftDurationHours !== ""
            ? Number(entryShiftDurationHours)
            : null,
        tolerance_minutes:
          entryToleranceMinutes === "" ? null : Math.max(0, Number(entryToleranceMinutes) || 0),
      });
      setFilterIdToEquipmentInterval((prev) => {
        const next = new Map(prev);
        const meta = {
          ...(next.get(formData.equipmentId) || {}),
          equipment_id: equipmentIdForPatch,
          log_entry_interval: entryLogInterval || null,
          shift_duration_hours:
            entryLogInterval === "shift" && entryShiftDurationHours !== ""
              ? Number(entryShiftDurationHours)
              : null,
          tolerance_minutes:
            entryToleranceMinutes === "" ? null : Math.max(0, Number(entryToleranceMinutes) || 0),
        };
        next.set(formData.equipmentId, meta);
        if (equipmentIdForPatch && equipmentIdForPatch !== formData.equipmentId) {
          next.set(equipmentIdForPatch, { ...meta, equipment_id: equipmentIdForPatch });
        }
        return next;
      });
    }
    if (!formData.remarks.trim()) {
      toast.error("Remarks are required.");
      return;
    }
    if (maintenanceTimings.activityType === "operation") {
      const required = [
        { key: "equipmentId", label: "Assigned filter (select equipment above)" },
        { key: "filterNo", label: "Filter No" },
        { key: "tagInfo", label: "Tag Information" },
        { key: "filterMicron", label: "Filter Micron" },
        { key: "filterSize", label: "Filter Size" },
        { key: "installedDate", label: "Filter Installed Date" },
        { key: "remarks", label: "Remarks" },
      ] as const;
      const requiredWithApplicability: { key: string; label: string }[] = [...required];
      if (scheduleApplicability.integrity) {
        requiredWithApplicability.push(
          { key: "integrityDoneDate", label: "Integrity Done Date" },
          { key: "integrityDueDate", label: "Integrity Due Date" },
        );
      }
      if (scheduleApplicability.cleaning) {
        requiredWithApplicability.push(
          { key: "cleaningDoneDate", label: "Cleaning Done Date" },
          { key: "cleaningDueDate", label: "Cleaning Due Date" },
        );
      }
      if (scheduleApplicability.replacement) {
        requiredWithApplicability.push({ key: "replacementDueDate", label: "Replacement Due Date" });
      }

      const err = firstRequiredFieldError(formData, requiredWithApplicability as any);
      if (err) {
        toast.error(err);
        return;
      }
      if (!selectedEquipmentUuid) {
        toast.error("Please select Equipment Name (for tag info).");
        return;
      }
    }

    try {
      const timestampStr =
        formData.date && formData.time
          ? new Date(`${formData.date}T${formData.time}:00`)
          : new Date();

      const assignmentForSubmit =
        assignmentsForSelectedArea.find((a) => a.id === selectedAssignmentId) ??
        assignmentsOnEquipment.find((a) => a.id === selectedAssignmentId);
      const areaCategorySubmit = (assignmentForSubmit?.area_category || "").trim() || null;

      const payload: any = {
        equipment_id: equipmentIdForPatch || formData.equipmentId,
        area_category: areaCategorySubmit,
        activity_type: maintenanceTimings.activityType,
        activity_from_date: maintenanceTimings.fromDate || null,
        activity_to_date: maintenanceTimings.toDate || null,
        activity_from_time: maintenanceTimings.fromTime || null,
        activity_to_time: maintenanceTimings.toTime || null,
        category: formData.category,
        filter_no: formData.filterNo,
        filter_micron: formData.filterMicron || null,
        filter_size: formData.filterSize || null,
        tag_info: formData.tagInfo || null,
        installed_date: formData.installedDate,
        integrity_done_date: scheduleApplicability.integrity ? (formData.integrityDoneDate || null) : null,
        cleaning_done_date: scheduleApplicability.cleaning ? (formData.cleaningDoneDate || null) : null,
        integrity_due_date: scheduleApplicability.integrity ? (formData.integrityDueDate || null) : null,
        cleaning_due_date: scheduleApplicability.cleaning ? (formData.cleaningDueDate || null) : null,
        replacement_due_date: scheduleApplicability.replacement ? (formData.replacementDueDate || null) : null,
        replacement_applicable: scheduleApplicability.replacement,
        cleaning_applicable: scheduleApplicability.cleaning,
        integrity_applicable: scheduleApplicability.integrity,
        remarks: formData.remarks || "",
        timestamp: timestampStr.toISOString(),
      };

      const existing = logs.find((log) => log.id === editingLogId) || null;

      if (editingLogId && existing) {
        const isCorrection =
          existing.status === "rejected" || existing.status === "pending_secondary_approval";
        if (isCorrection && existing.operator_id !== user?.id) {
          toast.error(CREATOR_ONLY_REJECTED_EDIT_MESSAGE);
          return;
        }
        if (isCorrection) {
          await filterLogAPI.correct(editingLogId, payload);
          toast.success("Correction entry created successfully");
        } else {
          await filterLogAPI.update(editingLogId, payload);
          toast.success("Filter log updated successfully");
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
      const raw = error?.data?.detail;
      const msg =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw.map((x: unknown) => (typeof x === "string" ? x : String(x))).join(" ")
            : error?.message || "Failed to save filter log entry";
      toast.error(msg);
    }
  };

  const handleApproveClick = (logId: string, log: FilterLog) => {
    if (!user) return;
    const isMaintenanceOrShutdown =
      log.activity_type === "maintenance" || log.activity_type === "shutdown";

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
    if (isMaintenanceOrShutdown && !editedMaintenanceLogIds.has(logId)) {
      toast.error("Please edit this maintenance/shutdown entry first, then approve.");
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
    const log = filteredLogs.find((l) => l.id === logId);
    if (log?.operator_id === user?.id) {
      toast.error("The log book entry must be rejected by a different user than the operator (Log Book Done By).");
      return;
    }
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
    if (log.status === "pending_secondary_approval" && log.approved_by_id === user?.id) return false;
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
    user && (user.role === "admin" || user.role === "super_admin");

  return (
    <>
      <Header
        title="Filter Log Book"
        subtitle="Manage filter installation, integrity, cleaning and replacement logs"
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
          logTypeLabel="Filter"
          nextDue={missedReadingNextDue}
          equipmentList={missedEquipments ?? undefined}
        />
      )}
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
              disabled={!hasMissedReadings}
              onClick={() => setShowMissedReadingPopup(true)}
              title={
                !hasMissedReadings
                  ? "No missed readings"
                  : "Expected readings for the selected day across all eligible filter equipment (hourly/shift). The count is not limited to rows shown in the table below."
              }
            >
              <Clock className="w-4 h-4 mr-2" />
              Missing Readings
              {missedReadingsCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                  {missedReadingsCount}
                </span>
              )}
            </Button>
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
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader>
                  <DialogTitle>
                    {editingLogId ? "Edit Filter Log Entry" : "New Filter Log Entry"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-4">
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

                  <div className="space-y-2">
                    <Label>Equipment Name *</Label>
                    <Select
                      value={selectedEquipmentUuid}
                      onValueChange={(value) => onEquipmentSelectedForTagInfo(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select equipment (loads assigned filter & approved schedules)" />
                      </SelectTrigger>
                      <SelectContent
                        className="!z-[9999] max-h-60 max-w-[min(100vw-2rem,24rem)] overflow-y-auto"
                        position="popper"
                      >
                        {equipmentOptions.length === 0 ? (
                          <SelectItem value="__none__" disabled className="text-muted-foreground">
                            No equipment available
                          </SelectItem>
                        ) : (
                          equipmentOptions.map((eq) => (
                            <SelectItem key={eq.id} value={eq.id}>
                              {eq.equipment_number} – {eq.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground max-w-full break-words">
                      {equipmentOptions.length === 0 ? (
                        <>
                          No eligible equipment yet. Assign a filter in{" "}
                          <span className="font-medium">Filter Register</span>, then approve{" "}
                          <span className="font-medium">replacement</span>,{" "}
                          <span className="font-medium">cleaning</span>, and{" "}
                          <span className="font-medium">integrity</span> schedules under{" "}
                          <span className="font-medium">Filter → Schedule approvals</span>.
                        </>
                      ) : (
                        <>
                          Uses the active assignment and only{" "}
                          <span className="font-medium">approved</span> filter schedules for frequencies and due
                          dates.
                        </>
                      )}
                    </p>
                  </div>

                  {assignmentsOnEquipment.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Area category{uniqueAreaCategoryKeys.length > 1 ? " *" : ""}</Label>
                      {uniqueAreaCategoryKeys.length > 1 ? (
                        <Select
                          value={selectedAreaCategoryKey}
                          onValueChange={(value) => {
                            if (selectedEquipmentUuid) {
                              void onAreaCategorySelected(value, selectedEquipmentUuid);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select area for this equipment" />
                          </SelectTrigger>
                          <SelectContent className="!z-[9999] max-h-60 overflow-y-auto" position="popper">
                            {uniqueAreaCategoryKeys.map((k) => (
                              <SelectItem key={k} value={k}>
                                {assignmentAreaCategoryLabel(k)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="text"
                          value={assignmentAreaCategoryLabel(selectedAreaCategoryKey)}
                          readOnly
                          disabled
                          className="bg-muted"
                          aria-label="Area category"
                        />
                      )}
                      <p className="text-xs text-muted-foreground max-w-full break-words">
                        {uniqueAreaCategoryKeys.length > 1
                          ? "Choose the area when this equipment has filters assigned under more than one area category in Filter Register."
                          : "From Filter Register when assigning the filter to this equipment. Shown for all equipment so it matches Schedule approvals."}
                      </p>
                    </div>
                  ) : null}

                  {assignmentsForSelectedArea.length > 1 ? (
                    <div className="space-y-2">
                      <Label>Assigned filter *</Label>
                      <Select
                        value={selectedAssignmentId || "__none__"}
                        onValueChange={(value) => {
                          if (value !== "__none__" && selectedEquipmentUuid) {
                            void onAssignmentRowSelected(value, selectedEquipmentUuid);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select filter on this equipment" />
                        </SelectTrigger>
                        <SelectContent className="!z-[9999] max-h-60 overflow-y-auto" position="popper">
                          {assignmentsForSelectedArea.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {formatAssignmentSelectLabel(a, assignmentsForSelectedArea)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground max-w-full break-words">
                        If two lines look the same, the extra text is tag info or assignment id to tell them
                        apart.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input
                        type="text"
                        value={formData.category}
                        readOnly
                        disabled
                        className="bg-muted"
                        placeholder="From assignment"
                      />
                      <p className="text-xs text-muted-foreground">From filter assignment category.</p>
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
                        placeholder="e.g., FMT-0001"
                      />
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
                              <span className="font-medium">{format(log.timestamp, "yyyy-MM-dd HH:mm")}</span>
                              <span className="text-muted-foreground"> — Entered by: {log.checkedBy || "—"}</span>
                              <div className="mt-1 text-muted-foreground">
                                {log.category} · {log.filterNo}
                                {log.filterMicron ? ` · ${log.filterMicron}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <MaintenanceTimingsSection value={maintenanceTimings} onChange={setMaintenanceTimings} />

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
                      <Label>
                        Integrity Done Date {!scheduleApplicability.integrity ? "(N/A)" : ""}
                      </Label>
                      <Input
                        type="date"
                        value={formData.integrityDoneDate}
                        disabled={!scheduleApplicability.integrity}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            integrityDoneDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Cleaning Done Date {!scheduleApplicability.cleaning ? "(N/A)" : ""}
                      </Label>
                      <Input
                        type="date"
                        value={formData.cleaningDoneDate}
                        disabled={!scheduleApplicability.cleaning}
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
                      <Label>
                        Replacement Due Date {!scheduleApplicability.replacement ? "(N/A)" : ""}
                      </Label>
                      <Input
                        type="date"
                        value={formData.replacementDueDate}
                        disabled={!scheduleApplicability.replacement}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            replacementDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Calculated from installed date and approved assignment schedules; you may override.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Integrity Due Date {!scheduleApplicability.integrity ? "(N/A)" : ""}
                      </Label>
                      <Input
                        type="date"
                        value={formData.integrityDueDate}
                        disabled={!scheduleApplicability.integrity}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            integrityDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Calculated from installed date and approved assignment schedules; you may override.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Cleaning Due Date {!scheduleApplicability.cleaning ? "(N/A)" : ""}
                      </Label>
                      <Input
                        type="date"
                        value={formData.cleaningDueDate}
                        disabled={!scheduleApplicability.cleaning}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cleaningDueDate: e.target.value,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Calculated from installed date and approved assignment schedules; you may override.
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
                <Label className="text-base font-semibold">Equipment ID (Filter)</Label>
                <Select
                  value={filters.equipmentId || "all"}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, equipmentId: v === "all" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {filterIdFilterOptions.map((f) => (
                      <SelectItem key={f.filter_id} value={f.filter_id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <table className="min-w-full text-xs md:text-sm" style={{ minWidth: "1780px" }}>
              <thead className="bg-muted">
                <tr className="border-b">
                  <th className="px-3 py-2 text-center align-middle w-12">
{approvablePendingIds.length > 0 && user?.role !== "operator" && (
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
                  <th className="px-3 py-2 text-center align-middle min-w-[280px] w-[280px]">
                    <span className="whitespace-nowrap">Equipment name</span>
                  </th>
                  <th className="px-3 py-2 text-center align-middle min-w-[130px] w-[140px]">
                    <span className="whitespace-nowrap">Area category</span>
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
                  <th className="px-3 py-2 text-center align-middle min-w-[180px]">
                    Comment
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[140px]">
                    Done by
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[160px]">
                    Approved By
                  </th>
                  <th className="px-3 py-2 text-center align-middle w-[160px]">
                    Rejected By
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
                    <td colSpan={22} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {isLoading ? "Loading entries..." : "No entries found"}
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => {
                  const dateStr = format(log.timestamp, "yyyy-MM-dd");
                  const timeStr = format(log.timestamp, "HH:mm:ss");
                  const isSelected = selectedLogIds.includes(log.id);
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
                    <tr key={log.id} className={cn(tolClass, "border-b hover:bg-muted/40")}>
                      <td className="px-3 py-2 align-top">
                        {(log.status === "pending" ||
                          log.status === "draft" ||
                          log.status === "pending_secondary_approval") &&
                          user?.role !== "operator" &&
                          isSelectableForApproval(log) && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectLog(log)}
                              aria-label="Select row"
                            />
                          )}
                      </td>
                      <td className="px-3 py-2 align-top">{dateStr}</td>
                      <td className="px-3 py-2 align-top">{timeStr}</td>
                      <td className="px-3 py-2 align-top text-center whitespace-nowrap min-w-[280px]">
                        {resolveEquipmentDisplayForLog(log)}
                      </td>
                      <td className="px-3 py-2 align-top text-center text-sm whitespace-nowrap min-w-[130px]">
                        {resolveAreaCategoryForLog(log)}
                      </td>
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
                        {log.integrityApplicable === false ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          log.integrityDoneDate || <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {log.integrityApplicable === false ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          log.integrityDueDate || <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {log.cleaningApplicable === false ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          log.cleaningDoneDate || <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {log.cleaningApplicable === false ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          log.cleaningDueDate || <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {log.replacementApplicable === false ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          log.replacementDueDate || <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top max-w-xs">
                        <div className="whitespace-pre-wrap break-words text-xs">
                          {log.remarks || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top max-w-xs">
                        <div className="whitespace-pre-wrap break-words text-xs">
                          {log.comment || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">{log.checkedBy}</td>
                      <td className="px-3 py-2 align-top">{log.approvedBy || "—"}</td>
                      <td className="px-3 py-2 align-top">{log.rejectedBy || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              log.has_corrections && !log.corrects_id
                                ? "destructive"
                                : getStatusBadgeVariant(log.status)
                            }
                            className="w-fit text-xs"
                          >
                            {log.has_corrections && !log.corrects_id
                              ? "Rejected"
                              : getStatusLabel(log.status)}
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
                                    : isMaintenanceOrShutdown &&
                                      (log.status === "pending" ||
                                        log.status === "draft" ||
                                        log.status === "pending_secondary_approval") &&
                                      !editedMaintenanceLogIds.has(log.id)
                                    ? "Please edit this maintenance/shutdown entry first, then approve."
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
                                  canEditAction
                                    ? ""
                                    : "opacity-40 cursor-not-allowed",
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
                          {user?.role === "operator" &&
                            log.status === "rejected" &&
                            log.operator_id === user?.id &&
                            !(log.has_corrections && !log.corrects_id) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="Edit entry"
                                onClick={() => handleEditLog(log)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}

                          {user?.role === "super_admin" && (
                            <Button
                              size="icon"
                              variant="ghost"
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

