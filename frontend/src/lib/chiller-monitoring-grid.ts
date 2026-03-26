import { format } from 'date-fns';
import {
  formatChillerLimitHint,
  isChillerValueOutOfLimit,
} from '@/lib/chiller-monitoring-limits';

/** Mapped row shape from ReportsPage mapChillerLogForMonitoringPdf (subset used by grid). */
export interface ChillerMonitoringMappedLog {
  date: string;
  time: string;
  timestamp: Date;
  equipmentId: string;
  activity_type?: string;
  evapWaterInletPressure?: number;
  evapWaterOutletPressure?: number;
  evapEnteringWaterTemp?: number;
  evapLeavingWaterTemp?: number;
  evapApproachTemp?: number;
  condWaterInletPressure?: number;
  condWaterOutletPressure?: number;
  condEnteringWaterTemp?: number;
  condLeavingWaterTemp?: number;
  condApproachTemp?: number;
  chillerControlSignal?: number;
  avgMotorCurrent?: number;
  compressorRunningTimeMin?: number;
  starterEnergyKwh?: number;
  coolingTowerPumpStatus?: string;
  chilledWaterPumpStatus?: string;
  coolingTowerFanStatus?: string;
  coolingTowerBlowoffValveStatus?: string;
  coolingTowerBlowdownTimeMin?: number | string;
  dailyWaterConsumptionCt1Liters?: number;
  dailyWaterConsumptionCt2Liters?: number;
  dailyWaterConsumptionCt3Liters?: number;
  coolingTowerChemicalName?: string;
  coolingTowerChemicalQtyPerDay?: number;
  chilledWaterPumpChemicalName?: string;
  chilledWaterPumpChemicalQtyKg?: number;
  coolingTowerFanChemicalName?: string;
  coolingTowerFanChemicalQtyKg?: number;
  operatorSign?: string;
  verifiedBy?: string;
  remarks?: string;
  checkedBy?: string;
  raw?: { activity_type?: string };
}

export interface ChillerGridColumn {
  id: string;
  label: string;
  at: Date;
  log: ChillerMonitoringMappedLog;
}

export interface ChillerGridRow {
  /** Description column: parameter + limit hint (handwritten “DESCRIPTION” column). */
  label: string;
  fieldKey?: string;
  values: (string | number | null)[];
  /** Per-cell out-of-limit (numeric fields only) */
  flags: boolean[];
}

export interface ChillerGridSection {
  title: string;
  rows: ChillerGridRow[];
}

/** One physical row in the logbook-style grid (Section | Description | …times). */
export interface ChillerGridFlatRow {
  /** Left group column — printed only on first row of each section (rowspan simulation). */
  sectionLabel: string;
  description: string;
  fieldKey?: string;
  values: (string | number | null)[];
  flags: boolean[];
}

/** Chemicals sub-table: same time columns as main grid (legacy). */
export interface ChillerChemicalSubTable {
  nameRow: ChillerGridFlatRow;
  qtyRow: ChillerGridFlatRow;
}

/**
 * Handwritten logbook chemical block: DESCRIPTION column + one column per product (C4501, C1810, …).
 */
export interface ChillerHandwrittenChemicalTable {
  productColumns: string[];
  qtyCells: string[];
  secondaryRows: { label: string; cells: string[] }[];
}

export interface ChillerMonitoringGridModel {
  equipmentId: string;
  reportDateLabel: string;
  columns: ChillerGridColumn[];
  sections: ChillerGridSection[];
  /** All sections flattened for a single continuous table (handwritten layout). */
  flatRows: ChillerGridFlatRow[];
  /** Evaporator + Condenser + Compressor only (main bordered grid). */
  coreFlatRows: ChillerGridFlatRow[];
  /** Last row inside main grid: Operator Sign & Date. */
  operatorFooterRow: ChillerGridFlatRow;
  /** Pump / fan / blowdown rows (rendered as status strip below main grid). */
  statusRows: ChillerGridFlatRow[];
  chemicalSubTable: ChillerChemicalSubTable;
  handwrittenChemicalTable: ChillerHandwrittenChemicalTable;
  /** CHW / fan chemical rows (after CT name + qty). */
  chemicalExtraRows: ChillerGridFlatRow[];
  /** Verified + Done By (last rows in chemical block area). */
  finalSignoffRows: ChillerGridFlatRow[];
}

const COL_TIME_KEY_FMT = "yyyy-MM-dd HH:mm";

function isOperationLog(log: ChillerMonitoringMappedLog): boolean {
  const a = log.activity_type ?? log.raw?.activity_type;
  return !a || String(a).toLowerCase() === "operation";
}

/**
 * Parse pump/fan composite status for compact PDF cell (matches ChillerMonitoringCertificate intent).
 */
function parseStatusToken(value: string | undefined, key: string | undefined, index: number): string {
  if (!value) return "";
  const raw = String(value);
  const parts = raw
    .split(/[\/,\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const cleanToken = (token: string) =>
    token
      .replace(/^(?:pump|fan)?\s*[0-9]+\s*:\s*/i, "")
      .replace(/^[A-Za-z][0-9]+\s*:\s*/i, "")
      .trim();
  const normalizeOnOff = (token: string) => {
    const m = cleanToken(token).match(/\b(ON|OFF)\b/i);
    return m ? m[1].toUpperCase() : cleanToken(token);
  };
  if (key) {
    const keyMatch = raw.match(new RegExp(`${key}\\s*:\\s*(ON|OFF)`, "i"));
    if (keyMatch?.[1]) return keyMatch[1].toUpperCase();
  }
  const tokens = Array.from(raw.matchAll(/\b(ON|OFF)\b/gi)).map((m) => m[1].toUpperCase());
  if (tokens[index] != null) return tokens[index];
  if (parts[index] != null) return normalizeOnOff(parts[index]);
  return normalizeOnOff(parts[0] || raw);
}

function formatBlowdown(log: ChillerMonitoringMappedLog): string {
  const v = log.coolingTowerBlowdownTimeMin;
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && v.toUpperCase() === "N/A") return "N/A";
  return String(v);
}

/** Limit text aligned with physical chiller logbook where it differs from strict NMT/NLT labels. */
const HANDWRITTEN_LIMIT_LABELS: Partial<Record<string, string>> = {
  evapEnteringWaterTemp: "5 to 18 °C",
  evapLeavingWaterTemp: "5 to 13 °C",
  condApproachTemp: "6 °C",
};

function rowLabel(title: string, fieldKey: string): string {
  const manual = HANDWRITTEN_LIMIT_LABELS[fieldKey];
  if (manual) return `${title} (${manual})`;
  const hint = formatChillerLimitHint(fieldKey);
  return hint ? `${title} (${hint})` : title;
}

/** Display compressor running time as H:MM to match logbook “Hr. : Min”. */
function formatCompressorRunTime(min: number | null | undefined): string | number | null {
  if (min == null || !Number.isFinite(Number(min))) return null;
  const m = Math.max(0, Math.floor(Number(min)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

function pickField(log: ChillerMonitoringMappedLog, fieldKey: string): unknown {
  return (log as unknown as Record<string, unknown>)[fieldKey];
}

function makeNumericRow(
  title: string,
  fieldKey: string,
  columnLogs: ChillerMonitoringMappedLog[],
): ChillerGridRow {
  const values = columnLogs.map((log) => {
    const v = pickField(log, fieldKey);
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : n;
  });
  const flags = columnLogs.map((log) => {
    const v = pickField(log, fieldKey);
    const num = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(num) ? isChillerValueOutOfLimit(fieldKey, num) : false;
  });
  return {
    label: rowLabel(title, fieldKey),
    fieldKey,
    values,
    flags,
  };
}

function makeCompressorRunRow(
  fieldKey: "compressorRunningTimeMin",
  columnLogs: ChillerMonitoringMappedLog[],
): ChillerGridRow {
  const values = columnLogs.map((log) => formatCompressorRunTime(log.compressorRunningTimeMin));
  const flags = columnLogs.map((log) =>
    isChillerValueOutOfLimit(fieldKey, log.compressorRunningTimeMin ?? undefined),
  );
  return {
    label: rowLabel("Compressor Running time (Hr.: Min)", fieldKey),
    fieldKey,
    values,
    flags,
  };
}

function makeTextRow(title: string, values: (string | number | null)[]): ChillerGridRow {
  return { label: title, values, flags: values.map(() => false) };
}

const splitTokens = (s: string) =>
  s
    .split(/[,;/]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function formatQtyCell(q: string): string {
  if (!q || q === "—") return "—";
  if (/kg|g\b|l\b|ml\b/i.test(q)) return q;
  return `${q} kg`;
}

/** Chemical mini-table like handwritten sheet: product codes across columns. */
export function buildHandwrittenChemicalTable(
  columnLogs: ChillerMonitoringMappedLog[],
): ChillerHandwrittenChemicalTable {
  let bestNames: string[] = [];
  let bestQtys: string[] = [];

  for (const log of columnLogs) {
    const rawName = (log.coolingTowerChemicalName ?? "").trim();
    const nameTok = rawName ? splitTokens(rawName) : [];
    const names = nameTok.length > 0 ? nameTok : rawName ? [rawName] : [];
    const qtyRaw = log.coolingTowerChemicalQtyPerDay;
    const qtyStr = qtyRaw != null && String(qtyRaw).trim() !== "" ? String(qtyRaw).trim() : "";
    const qtyTok = qtyStr ? splitTokens(qtyStr) : [];
    const qs = qtyTok.length > 0 ? qtyTok : qtyStr ? [qtyStr] : [];
    const len = Math.max(names.length, qs.length, 0);
    if (len > Math.max(bestNames.length, bestQtys.length)) {
      bestNames = names;
      bestQtys = qs;
    }
  }

  if (bestNames.length === 0 && bestQtys.length === 0) {
    bestNames = ["—"];
  }

  const numCols = Math.max(bestNames.length, bestQtys.length, 1);
  const productColumns = Array.from({ length: numCols }, (_, i) => {
    const p = bestNames[i];
    return p != null && String(p).trim() !== "" ? String(p).trim() : "—";
  });
  const qtyCells = Array.from({ length: numCols }, (_, i) =>
    bestQtys[i] != null && String(bestQtys[i]).trim() !== ""
      ? formatQtyCell(String(bestQtys[i]).trim())
      : "—",
  );

  const pad = (val: string, cols: number): string[] => [
    val || "—",
    ...Array.from({ length: Math.max(cols - 1, 0) }, () => "—"),
  ];

  const ref = columnLogs[0];
  const chwN = (ref?.chilledWaterPumpChemicalName ?? "").trim();
  const chwQ = ref?.chilledWaterPumpChemicalQtyKg;
  const fanN = (ref?.coolingTowerFanChemicalName ?? "").trim();
  const fanQ = ref?.coolingTowerFanChemicalQtyKg;

  const secondaryRows: { label: string; cells: string[] }[] = [
    {
      label: "Chilled Water Pump Chemical Name",
      cells: pad(chwN, numCols),
    },
    {
      label: "CHW Pump Qty (kg)",
      cells: pad(chwQ != null && chwQ !== "" ? String(chwQ) : "", numCols),
    },
    {
      label: "Cooling Tower Fan Chemical Name",
      cells: pad(fanN, numCols),
    },
    {
      label: "CT Fan Qty (kg)",
      cells: pad(fanQ != null && fanQ !== "" ? String(fanQ) : "", numCols),
    },
  ];

  return { productColumns, qtyCells, secondaryRows };
}

/**
 * Build pivoted grid: parameter rows × time columns for one approved chiller operation day.
 *
 * reportDate: calendar day for columns (local). If logs fall back to "most recent day", caller sets reportDate accordingly.
 */
export function buildChillerMonitoringGrid(
  logs: ChillerMonitoringMappedLog[],
  opts: { equipmentId: string; reportDate: Date },
): ChillerMonitoringGridModel {
  const { equipmentId, reportDate } = opts;
  const dayStr = format(reportDate, "yyyy-MM-dd");

  let dayLogs = logs.filter(
    (l) => String(l.equipmentId ?? "") === String(equipmentId) && isOperationLog(l),
  );
  dayLogs = dayLogs.filter((l) => format(l.timestamp, "yyyy-MM-dd") === dayStr);

  dayLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Dedupe by minute slot: keep latest timestamp within same yyyy-MM-dd HH:mm
  const byMinute = new Map<string, ChillerMonitoringMappedLog>();
  for (const log of dayLogs) {
    const key = format(log.timestamp, COL_TIME_KEY_FMT);
    const prev = byMinute.get(key);
    if (!prev || log.timestamp.getTime() >= prev.timestamp.getTime()) {
      byMinute.set(key, log);
    }
  }
  const uniqueSorted = Array.from(byMinute.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  const columns: ChillerGridColumn[] = uniqueSorted.map((log) => ({
    id: format(log.timestamp, COL_TIME_KEY_FMT),
    label: format(log.timestamp, "HH:mm"),
    at: log.timestamp,
    log,
  }));

  const columnLogs = columns.map((c) => c.log);

  const sections: ChillerGridSection[] = [];

  sections.push({
    title: "Evaporator",
    rows: [
      makeNumericRow("Evap water inlet Pressure", "evapWaterInletPressure", columnLogs),
      makeNumericRow("Evap water outlet Pressure", "evapWaterOutletPressure", columnLogs),
      makeNumericRow("Evap. Entering water temp", "evapEnteringWaterTemp", columnLogs),
      makeNumericRow("Evap. Leaving water temp", "evapLeavingWaterTemp", columnLogs),
      makeNumericRow("Evap. approach temp", "evapApproachTemp", columnLogs),
    ],
  });

  sections.push({
    title: "Condenser",
    rows: [
      makeNumericRow("Cond water inlet Pressure", "condWaterInletPressure", columnLogs),
      makeNumericRow("Cond water outlet Pressure", "condWaterOutletPressure", columnLogs),
      makeNumericRow("Cond Entering water temp", "condEnteringWaterTemp", columnLogs),
      makeNumericRow("Cond Leaving water temp", "condLeavingWaterTemp", columnLogs),
      makeNumericRow("Cond approach temp", "condApproachTemp", columnLogs),
    ],
  });

  sections.push({
    title: "Compressor",
    rows: [
      makeNumericRow("Chiller control signal (%)", "chillerControlSignal", columnLogs),
      makeNumericRow("Average Motor current (%)", "avgMotorCurrent", columnLogs),
      makeCompressorRunRow("compressorRunningTimeMin", columnLogs),
      makeNumericRow("Starter energy consumption (KWH)", "starterEnergyKwh", columnLogs),
    ],
  });

  sections.push({
    title: "Equipment status",
    rows: [
      makeTextRow(
        "Cooling Tower Pump-1 / 2 (On/Off)",
        columnLogs.map(
          (log) =>
            `P1: ${parseStatusToken(log.coolingTowerPumpStatus, "P1", 0)} / P2: ${parseStatusToken(log.coolingTowerPumpStatus, "P2", 1)}`,
        ),
      ),
      makeTextRow(
        "Chilled Water Pump-1 / 2 (On/Off)",
        columnLogs.map(
          (log) =>
            `P1: ${parseStatusToken(log.chilledWaterPumpStatus, "P1", 0)} / P2: ${parseStatusToken(log.chilledWaterPumpStatus, "P2", 1)}`,
        ),
      ),
      makeTextRow(
        "Cooling Tower Fan 1/2/3 (On/Off)",
        columnLogs.map(
          (log) =>
            `F1: ${parseStatusToken(log.coolingTowerFanStatus, "F1", 0)} / F2: ${parseStatusToken(log.coolingTowerFanStatus, "F2", 1)} / F3: ${parseStatusToken(log.coolingTowerFanStatus, "F3", 2)}`,
        ),
      ),
      makeTextRow(
        "Cooling tower Blow down",
        columnLogs.map((log) => formatBlowdown(log)),
      ),
    ],
  });

  sections.push({
    title: "Cooling tower chemicals",
    rows: [
      makeTextRow(
        "Cooling Tower Chemical Name",
        columnLogs.map((log) => log.coolingTowerChemicalName ?? ""),
      ),
      makeTextRow(
        "Qty Added / Day",
        columnLogs.map((log) => log.coolingTowerChemicalQtyPerDay ?? null),
      ),
      makeTextRow(
        "Chilled Water Pump Chemical Name",
        columnLogs.map((log) => log.chilledWaterPumpChemicalName ?? ""),
      ),
      makeTextRow(
        "CHW Pump Qty (kg)",
        columnLogs.map((log) => log.chilledWaterPumpChemicalQtyKg ?? null),
      ),
      makeTextRow(
        "Cooling Tower Fan Chemical Name",
        columnLogs.map((log) => log.coolingTowerFanChemicalName ?? ""),
      ),
      makeTextRow(
        "CT Fan Qty (kg)",
        columnLogs.map((log) => log.coolingTowerFanChemicalQtyKg ?? null),
      ),
    ],
  });

  const signoffRows = [
    makeTextRow("Operator Sign & Date:", columnLogs.map((log) => log.operatorSign ?? "")),
    makeTextRow("Verified By (Sign & Date)", columnLogs.map((log) => log.verifiedBy ?? "")),
    makeTextRow("Done By", columnLogs.map((log) => log.checkedBy ?? "")),
  ];

  sections.push({
    title: "Sign-off",
    rows: signoffRows,
  });

  const toFlat = (sectionList: ChillerGridSection[]): ChillerGridFlatRow[] => {
    const out: ChillerGridFlatRow[] = [];
    for (const section of sectionList) {
      section.rows.forEach((row, idx) => {
        out.push({
          sectionLabel: idx === 0 ? section.title : "",
          description: row.label,
          fieldKey: row.fieldKey,
          values: row.values,
          flags: row.flags,
        });
      });
    }
    return out;
  };

  const flatRows = toFlat(sections);

  const coreSections = sections.slice(0, 3);
  const equipmentStatusSection = sections[3]!;
  const chemicalSection = sections[4]!;
  const coreFlatRows = toFlat(coreSections);

  const operatorSignRow = signoffRows[0]!;
  const operatorFooterRow: ChillerGridFlatRow = {
    sectionLabel: "",
    description: operatorSignRow.label,
    values: operatorSignRow.values,
    flags: operatorSignRow.flags,
  };

  const statusRowsFlat = toFlat([equipmentStatusSection]);
  const statusRows = statusRowsFlat.map((r) => ({ ...r, sectionLabel: "" }));

  const chemNameValues = columnLogs.map((log) => {
    const n = (log.coolingTowerChemicalName ?? "").trim();
    return n || null;
  });
  const chemQtyValues = columnLogs.map((log) => log.coolingTowerChemicalQtyPerDay ?? null);
  const chemicalSubTable: ChillerChemicalSubTable = {
    nameRow: {
      sectionLabel: "",
      description: "Cooling Tower Chemical Name",
      values: chemNameValues,
      flags: chemNameValues.map(() => false),
    },
    qtyRow: {
      sectionLabel: "",
      description: "Qty Added / Day",
      values: chemQtyValues,
      flags: chemQtyValues.map(() => false),
    },
  };

  const chemicalExtraRows: ChillerGridFlatRow[] = chemicalSection.rows.slice(2).map((row) => ({
    sectionLabel: "",
    description: row.label,
    values: row.values,
    flags: row.flags,
  }));

  const finalSignoffRows: ChillerGridFlatRow[] = [
    {
      sectionLabel: "",
      description: signoffRows[1]!.label,
      values: signoffRows[1]!.values,
      flags: signoffRows[1]!.flags,
    },
    {
      sectionLabel: "",
      description: signoffRows[2]!.label,
      values: signoffRows[2]!.values,
      flags: signoffRows[2]!.flags,
    },
  ];

  return {
    equipmentId,
    reportDateLabel: format(reportDate, "dd-MMM-yyyy"),
    columns,
    sections,
    flatRows,
    coreFlatRows,
    operatorFooterRow,
    statusRows,
    chemicalSubTable: {
      nameRow: chemicalSubTable.nameRow,
      qtyRow: chemicalSubTable.qtyRow,
    },
    handwrittenChemicalTable: buildHandwrittenChemicalTable(columnLogs),
    chemicalExtraRows,
    finalSignoffRows,
  };
}

/** Max time columns per landscape page (remaining width for parameter label). */
export const CHILLER_GRID_MAX_COLS_PER_PAGE = 10;

export function chunkColumnIndices(total: number, maxPerPage: number): number[][] {
  if (total <= 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < total; i += maxPerPage) {
    chunks.push(Array.from({ length: Math.min(maxPerPage, total - i) }, (_, j) => i + j));
  }
  return chunks;
}
