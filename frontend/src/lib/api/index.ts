export { default as api } from "./client";
export type { ApiClientError } from "./client";
export type {
  ChillerDashboardSummary,
  BoilerDashboardSummary,
  BoilerDashboardSeriesPoint,
  ChemicalDashboardSummary,
  ChemicalDashboardSeriesPoint,
  FiltersDashboardSummary,
} from "./dashboard-types";
export type { MissingSlotsResponse, MissingSlotsEquipment } from "./types";

export { authAPI } from "./modules/auth";
export { reportsAPI, dashboardSummaryAPI } from "./modules/reports";
export {
  chemicalPrepAPI,
  chemicalMasterAPI,
  chemicalStockAPI,
  chemicalAssignmentAPI,
  chemicalDashboardAPI,
  chemicalLimitsAPI,
} from "./modules/chemical";
export {
  chillerLogAPI,
  chillerLimitsAPI,
  chillerDashboardAPI,
} from "./modules/chiller";
export {
  boilerLogAPI,
  boilerLimitsAPI,
  boilerDashboardAPI,
} from "./modules/boiler";
export { filterLogAPI, filtersDashboardAPI } from "./modules/filter";
export {
  filterCategoryAPI,
  filterMasterAPI,
  filterAssignmentAPI,
  filterScheduleAPI,
} from "./modules/filter-register";
export {
  departmentAPI,
  equipmentCategoryAPI,
  equipmentAPI,
} from "./modules/equipment";
export { userAPI } from "./modules/users";
export { logbookAPI } from "./modules/logbooks";
export { briquetteLogAPI } from "./modules/briquette";
export { compressorLogAPI } from "./modules/compressor";
export { hvacValidationAPI } from "./modules/hvac";
export { testCertificateAPI } from "./modules/test-certificates";
