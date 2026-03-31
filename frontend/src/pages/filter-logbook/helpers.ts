import { format } from "date-fns";

export type FilterCategory = string;

export interface FilterCategoryOption {
  value: string;
  label: string;
}

export interface EquipmentOption {
  id: string;
  equipment_number: string;
  name: string;
}

export interface FilterIdFilterOption {
  filter_id: string;
  label: string;
}

export interface FilterAssignmentRow {
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

export interface FilterLog {
  id: string;
  equipmentId: string;
  category: FilterCategory;
  filterNo: string;
  filterMicron?: string;
  filterSize?: string;
  tagInfo?: string;
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

export type LogEntryIntervalType = "hourly" | "shift" | "daily";

export type ScheduleFreqState = {
  replacement: number | null;
  cleaning: number | null;
  integrity: number | null;
};

export const emptyScheduleFreq = (): ScheduleFreqState => ({
  replacement: null,
  cleaning: null,
  integrity: null,
});

export function dueDatesForInstalled(installedDate: string, freq: ScheduleFreqState): {
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

export const CREATOR_ONLY_REJECTED_EDIT_MESSAGE =
  "Only the original creator can edit/correct a rejected entry.";

export const AREA_CATEGORY_DEFAULT_KEY = "__area_default__";

export function assignmentAreaCategoryKey(area: string | null | undefined): string {
  const t = String(area ?? "").trim();
  return t ? t : AREA_CATEGORY_DEFAULT_KEY;
}

export function assignmentAreaCategoryLabel(key: string): string {
  return key === AREA_CATEGORY_DEFAULT_KEY ? "General (unspecified area)" : key;
}

export function formatAssignmentSelectLabel(a: FilterAssignmentRow, siblings: FilterAssignmentRow[]): string {
  const makeModel =
    a.filter_make || a.filter_model ? ` – ${[a.filter_make, a.filter_model].filter(Boolean).join(" ")}` : "";
  let label = `${a.filter_id}${makeModel}`;
  const sameFilter = siblings.filter((x) => x.filter_id === a.filter_id);
  if (sameFilter.length > 1) {
    const hint = (a.tag_info || "").trim() || `id ${a.id.slice(0, 8)}…`;
    const short = hint.length > 44 ? `${hint.slice(0, 41)}…` : hint;
    label = `${label} · ${short}`;
  }
  return label;
}

export function formatAssignmentEquipmentLabel(a: FilterAssignmentRow): string {
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

export function pickAssignmentForEquipmentColumn(
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

export function equipmentUuidForFilterLogRow(
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

export function formatFilterSize(a: FilterAssignmentRow): string {
  const parts = [a.filter_size_l, a.filter_size_w, a.filter_size_h].filter((v) => v != null);
  if (parts.length === 3) return `${parts[0]} × ${parts[1]} × ${parts[2]}`;
  return "";
}

export function assignmentIdsWithAnyApprovedSchedules(
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
