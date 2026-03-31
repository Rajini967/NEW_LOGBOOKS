import { toDateTime, resolveApprovedBy, resolveRejectedBy } from "./logbookMapperUtils";

type LogStatus = "pending" | "approved" | "rejected" | "draft" | "pending_secondary_approval";

type BaseApiLog = {
  id: string;
  timestamp: string;
  status: LogStatus | string;
  remarks?: string | null;
  comment?: string | null;
  operator_name?: string | null;
  approved_by_name?: string | null;
  secondary_approved_by_name?: string | null;
  operator_id?: string | null;
  approved_by_id?: string | null;
  corrects_id?: string | null;
  has_corrections?: boolean | null;
  tolerance_status?: "none" | "within" | "outside" | null;
  activity_type?: "operation" | "maintenance" | "shutdown" | null;
  activity_from_date?: string | null;
  activity_to_date?: string | null;
  activity_from_time?: string | null;
  activity_to_time?: string | null;
};

type BoilerLikeLog = BaseApiLog & {
  equipment_id?: string | null;
  feed_water_temp?: number | null;
  oil_temp?: number | null;
  steam_temp?: number | null;
  steam_pressure?: number | null;
  steam_flow_lph?: number | null;
  fo_hsd_ng_day_tank_level?: number | null;
  feed_water_tank_level?: number | null;
  fo_pre_heater_temp?: number | null;
  burner_oil_pressure?: number | null;
  burner_heater_temp?: number | null;
  boiler_steam_pressure?: number | null;
  stack_temperature?: number | null;
  steam_pressure_after_prv?: number | null;
  feed_water_hardness_ppm?: number | null;
  feed_water_tds_ppm?: number | null;
  fo_hsd_ng_consumption?: number | null;
  mobrey_functioning?: string | null;
  manual_blowdown_time?: string | null;
  diesel_stock_liters?: number | null;
  diesel_cost_rupees?: number | null;
  furnace_oil_stock_liters?: number | null;
  furnace_oil_cost_rupees?: number | null;
  brigade_stock_kg?: number | null;
  brigade_cost_rupees?: number | null;
  daily_power_consumption_kwh?: number | null;
  daily_water_consumption_liters?: number | null;
  daily_chemical_consumption_kg?: number | null;
  daily_diesel_consumption_liters?: number | null;
  daily_furnace_oil_consumption_liters?: number | null;
  daily_brigade_consumption_kg?: number | null;
  steam_consumption_kg_hr?: number | null;
  furnace_pressure_mmwc?: number | null;
  id_fan_op_percent?: number | null;
  pa_damper_position_1?: number | null;
  pa_damper_position_2?: number | null;
  metering_screw_percent?: number | null;
  steam_reading_ton?: number | null;
  steam_flow_kg_hr?: number | null;
  stack_temp?: number | null;
  furnace_temp?: number | null;
  hot_air_temp?: string | null;
  feed_pump_1_2?: string | null;
  operator_sign_date?: string | null;
  verified_sign_date?: string | null;
  feed_water_ph?: number | null;
  boiler_water_ph?: number | null;
  boiler_water_hardness_ppm?: number | null;
  boiler_water_tds_ppm?: number | null;
  total_steam_in_1_day?: string | null;
  total_steam_flow_ratio?: string | null;
};

type ChemicalLikeLog = BaseApiLog & {
  equipment_name?: string | null;
  chemical_name?: string | null;
  chemical_percent?: number | null;
  chemical_category?: "major" | "minor" | null;
  chemical_concentration?: number | null;
  solution_concentration?: number | null;
  water_qty?: number | null;
  chemical_qty?: number | null;
  batch_no?: string | null;
  done_by?: string | null;
  checked_by?: string | null;
};

type FilterLikeLog = BaseApiLog & {
  equipment_id?: string | null;
  category?: string | null;
  filter_no?: string | null;
  filter_micron?: string | null;
  filter_size?: string | null;
  tag_info?: string | null;
  area_category?: string | null;
  replacement_applicable?: boolean | null;
  cleaning_applicable?: boolean | null;
  integrity_applicable?: boolean | null;
  installed_date?: string | null;
  integrity_done_date?: string | null;
  integrity_due_date?: string | null;
  cleaning_done_date?: string | null;
  cleaning_due_date?: string | null;
  replacement_due_date?: string | null;
};

type BoilerMappedLog = ReturnType<typeof mapBoilerLogPayload>;
type BriquetteMappedLog = ReturnType<typeof mapBriquetteLogPayload>;
type ChemicalMappedLog = ReturnType<typeof mapChemicalPrepPayload>;
type FilterMappedLog = ReturnType<typeof mapFilterLogPayload>;

export function mapBoilerLogPayload(log: BoilerLikeLog): {
  id: string;
  equipmentType: "boiler";
  equipmentId: string;
  date: string;
  time: string;
  remarks: string;
  comment: string;
  checkedBy: string | null | undefined;
  approvedBy: string;
  rejectedBy: string;
  timestamp: Date;
  status: LogStatus;
  operator_id: string | null | undefined;
  approved_by_id: string | null | undefined;
  corrects_id: string | null | undefined;
  has_corrections: boolean | null | undefined;
  tolerance_status: "none" | "within" | "outside" | null | undefined;
  activity_type: "operation" | "maintenance" | "shutdown" | null | undefined;
  activity_from_date: string | null | undefined;
  activity_to_date: string | null | undefined;
  activity_from_time: string | null | undefined;
  activity_to_time: string | null | undefined;
  [key: string]: unknown;
} {
  const { timestamp, date, time } = toDateTime(log.timestamp);
  return {
    id: log.id,
    equipmentType: "boiler" as const,
    equipmentId: log.equipment_id,
    date,
    time,
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
    dieselStockLiters: log.diesel_stock_liters ?? undefined,
    dieselCostRupees: log.diesel_cost_rupees ?? undefined,
    furnaceOilStockLiters: log.furnace_oil_stock_liters ?? undefined,
    furnaceOilCostRupees: log.furnace_oil_cost_rupees ?? undefined,
    brigadeStockKg: log.brigade_stock_kg ?? undefined,
    brigadeCostRupees: log.brigade_cost_rupees ?? undefined,
    dailyPowerConsumptionKwh: log.daily_power_consumption_kwh ?? undefined,
    dailyWaterConsumptionLiters: log.daily_water_consumption_liters ?? undefined,
    dailyChemicalConsumptionKg: log.daily_chemical_consumption_kg ?? undefined,
    dailyDieselConsumptionLiters: log.daily_diesel_consumption_liters ?? undefined,
    dailyFurnaceOilConsumptionLiters: log.daily_furnace_oil_consumption_liters ?? undefined,
    dailyBrigadeConsumptionKg: log.daily_brigade_consumption_kg ?? undefined,
    steamConsumptionKgHr: log.steam_consumption_kg_hr ?? undefined,
    remarks: log.remarks || "",
    comment: log.comment || "",
    checkedBy: log.operator_name,
    approvedBy: resolveApprovedBy(log.status, { approvedByName: log.approved_by_name }),
    rejectedBy: resolveRejectedBy(log.status, log.approved_by_name),
    timestamp,
    status: log.status as LogStatus,
    operator_id: log.operator_id,
    approved_by_id: log.approved_by_id,
    corrects_id: log.corrects_id,
    has_corrections: log.has_corrections,
    tolerance_status: log.tolerance_status,
    activity_type: log.activity_type,
    activity_from_date: log.activity_from_date,
    activity_to_date: log.activity_to_date,
    activity_from_time: log.activity_from_time,
    activity_to_time: log.activity_to_time,
  };
}

export function mapBriquetteLogPayload(log: BoilerLikeLog) {
  const { timestamp, date, time } = toDateTime(log.timestamp);
  return {
    id: log.id,
    equipmentType: "briquette" as const,
    equipmentId: log.equipment_id,
    date,
    time,
    remarks: log.remarks || "",
    comment: log.comment || "",
    checkedBy: log.operator_name,
    approvedBy: resolveApprovedBy(log.status, { approvedByName: log.approved_by_name }),
    rejectedBy: resolveRejectedBy(log.status, log.approved_by_name),
    timestamp,
    status: log.status as LogStatus,
    operator_id: log.operator_id,
    approved_by_id: log.approved_by_id,
    corrects_id: log.corrects_id,
    has_corrections: log.has_corrections,
    tolerance_status: log.tolerance_status,
    activity_type: log.activity_type,
    activity_from_date: log.activity_from_date,
    activity_to_date: log.activity_to_date,
    activity_from_time: log.activity_from_time,
    activity_to_time: log.activity_to_time,
    steamPressure: log.steam_pressure ?? undefined,
    furnacePressureMmwc: log.furnace_pressure_mmwc ?? undefined,
    idFanOpPercent: log.id_fan_op_percent ?? undefined,
    paDamperPosition1: log.pa_damper_position_1 ?? undefined,
    paDamperPosition2: log.pa_damper_position_2 ?? undefined,
    meteringScrewPercent: log.metering_screw_percent ?? undefined,
    steamReadingTon: log.steam_reading_ton ?? undefined,
    steamFlowKgHr: log.steam_flow_kg_hr ?? undefined,
    stackTemp: log.stack_temp ?? undefined,
    furnaceTemp: log.furnace_temp ?? undefined,
    hotAirTemp: log.hot_air_temp ?? "",
    feedPump12: log.feed_pump_1_2 ?? "",
    operatorSignDate: log.operator_sign_date ?? "",
    verifiedSignDate: log.verified_sign_date ?? "",
    feedWaterPh: log.feed_water_ph ?? undefined,
    feedWaterHardnessPpm: log.feed_water_hardness_ppm ?? undefined,
    feedWaterTdsPpm: log.feed_water_tds_ppm ?? undefined,
    boilerWaterPh: log.boiler_water_ph ?? undefined,
    boilerWaterHardnessPpm: log.boiler_water_hardness_ppm ?? undefined,
    boilerWaterTdsPpm: log.boiler_water_tds_ppm ?? undefined,
    totalSteamIn1Day: log.total_steam_in_1_day ?? "",
    totalSteamFlowRatio: log.total_steam_flow_ratio ?? "",
  };
}

export function mapChemicalPrepPayload(prep: ChemicalLikeLog) {
  const { timestamp, date, time } = toDateTime(prep.timestamp);
  return {
    id: prep.id,
    equipmentName: prep.equipment_name,
    chemicalName: prep.chemical_name,
    chemicalPercent: prep.chemical_percent ?? undefined,
    chemicalCategory: prep.chemical_category ?? null,
    chemicalConcentration: prep.chemical_concentration ?? null,
    solutionConcentration: prep.solution_concentration,
    waterQty: prep.water_qty,
    chemicalQty: prep.chemical_qty != null ? prep.chemical_qty / 1000 : 0,
    batchNo: prep.batch_no || "",
    doneBy: prep.done_by || prep.checked_by || prep.operator_name,
    date,
    time,
    remarks: prep.remarks || "",
    comment: prep.comment || "",
    checkedBy: prep.checked_by || prep.operator_name,
    approvedBy: resolveApprovedBy(prep.status, { approvedByName: prep.approved_by_name }),
    rejectedBy: resolveRejectedBy(prep.status, prep.approved_by_name),
    timestamp,
    status: prep.status as LogStatus,
    operator_id: prep.operator_id,
    approved_by_id: prep.approved_by_id,
    corrects_id: prep.corrects_id,
    has_corrections: prep.has_corrections,
    tolerance_status: prep.tolerance_status,
    activity_type: prep.activity_type,
    activity_from_date: prep.activity_from_date,
    activity_to_date: prep.activity_to_date,
    activity_from_time: prep.activity_from_time,
    activity_to_time: prep.activity_to_time,
  };
}

export function mapFilterLogPayload(log: FilterLikeLog) {
  const { timestamp } = toDateTime(log.timestamp);
  return {
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
    approvedBy: resolveApprovedBy(
      log.status,
      { approvedByName: log.approved_by_name, secondaryApprovedByName: log.secondary_approved_by_name },
      true,
    ),
    rejectedBy: resolveRejectedBy(log.status, log.approved_by_name),
    timestamp,
    status: log.status as LogStatus,
    operator_id: log.operator_id,
    approved_by_id: log.approved_by_id,
    corrects_id: log.corrects_id,
    has_corrections: log.has_corrections,
    tolerance_status: log.tolerance_status,
    activity_type: log.activity_type,
    activity_from_date: log.activity_from_date,
    activity_to_date: log.activity_to_date,
    activity_from_time: log.activity_from_time,
    activity_to_time: log.activity_to_time,
  };
}

export function mapBoilerPreviousReadingPayload(log: BoilerLikeLog, equipmentType: "boiler" | "briquette") {
  const { timestamp, date, time } = toDateTime(log.timestamp);
  return {
    id: log.id,
    equipmentId: log.equipment_id,
    date,
    time,
    feedWaterTemp: log.feed_water_temp,
    oilTemp: log.oil_temp,
    steamTemp: log.steam_temp,
    steamPressure: log.steam_pressure,
    steamFlowLPH: log.steam_flow_lph,
    remarks: log.remarks || "",
    comment: log.comment,
    checkedBy: log.operator_name,
    approvedBy: resolveApprovedBy(log.status, { approvedByName: log.approved_by_name }),
    rejectedBy: resolveRejectedBy(log.status, log.approved_by_name),
    timestamp,
    status: log.status as LogStatus,
    operator_id: log.operator_id,
    approved_by_id: log.approved_by_id,
    corrects_id: log.corrects_id,
    has_corrections: log.has_corrections,
    equipmentType,
    activity_type: log.activity_type,
    activity_from_date: log.activity_from_date,
    activity_to_date: log.activity_to_date,
    activity_from_time: log.activity_from_time,
    activity_to_time: log.activity_to_time,
  };
}

export function mapChemicalPreviousReadingPayload(prep: ChemicalLikeLog) {
  const { timestamp, date, time } = toDateTime(prep.timestamp);
  return {
    id: prep.id,
    equipmentName: prep.equipment_name,
    chemicalName: prep.chemical_name,
    chemicalPercent: prep.chemical_percent,
    chemicalCategory: prep.chemical_category ?? null,
    chemicalConcentration: prep.chemical_concentration,
    solutionConcentration: prep.solution_concentration,
    waterQty: prep.water_qty,
    chemicalQty: prep.chemical_qty != null ? prep.chemical_qty / 1000 : 0,
    batchNo: prep.batch_no,
    doneBy: prep.done_by || prep.checked_by || prep.operator_name,
    date,
    time,
    remarks: prep.remarks || "",
    comment: prep.comment,
    checkedBy: prep.checked_by || prep.operator_name,
    approvedBy: resolveApprovedBy(prep.status, { approvedByName: prep.approved_by_name }),
    rejectedBy: resolveRejectedBy(prep.status, prep.approved_by_name),
    timestamp,
    status: prep.status as LogStatus,
    operator_id: prep.operator_id,
    approved_by_id: prep.approved_by_id,
    corrects_id: prep.corrects_id,
    has_corrections: prep.has_corrections,
    activity_type: prep.activity_type,
    activity_from_date: prep.activity_from_date,
    activity_to_date: prep.activity_to_date,
    activity_from_time: prep.activity_from_time,
    activity_to_time: prep.activity_to_time,
  };
}

export function mapFilterPreviousReadingPayload(log: FilterLikeLog) {
  const { timestamp } = toDateTime(log.timestamp);
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
    approvedBy: resolveApprovedBy(
      log.status,
      { approvedByName: log.approved_by_name, secondaryApprovedByName: log.secondary_approved_by_name },
      true,
    ),
    rejectedBy: resolveRejectedBy(log.status, log.approved_by_name),
    timestamp,
    status: log.status as LogStatus,
    operator_id: log.operator_id,
    approved_by_id: log.approved_by_id,
    corrects_id: log.corrects_id,
    has_corrections: log.has_corrections,
  };
}

export type {
  BoilerLikeLog,
  ChemicalLikeLog,
  FilterLikeLog,
  BoilerMappedLog,
  BriquetteMappedLog,
  ChemicalMappedLog,
  FilterMappedLog,
};
