import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Calendar,
  Search,
  Eye,
  Printer,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  generateAirVelocityPDF,
  generateFilterIntegrityPDF,
  generateRecoveryTestPDF,
  generateDifferentialPressurePDF,
  generateNVPCPDF,
  generateChillerMonitoringPDF,
  generateBoilerMonitoringPDF,
  generateChemicalMonitoringPDF,
  generateFilterMonitoringPDF,
  downloadPDF,
  printPDF,
  type MonitoringPDFData,
} from '@/lib/pdf-generator';
import {
  reportsAPI,
  chemicalPrepAPI,
  chillerLogAPI,
  boilerLogAPI,
  compressorLogAPI,
  hvacValidationAPI,
  testCertificateAPI,
  filterMasterAPI,
  filterLogAPI,
  equipmentAPI,
} from '@/lib/api';

type ApprovedReportType =
  | 'utility'
  | 'chemical'
  | 'validation'
  | 'filter_register'
  | 'air_velocity'
  | 'filter_integrity'
  | 'recovery'
  | 'differential_pressure'
  | 'nvpc';

interface Report {
  id: string;
  type: ApprovedReportType;
  title: string;
  site: string;
  createdBy: string;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'approved' | 'rejected';
  remarks?: string;
  originalData?: any; // Store original log data for viewing
}

interface UserReport {
  id: string;
  email: string;
  role: string;
  role_display: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  first_login: string | null;
  last_logout: string | null;
}

interface UserActivityRow {
  id: string;
  user: string;
  user_email: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditEventRow {
  id: string;
  timestamp: string;
  user: string | null;
  user_email: string | null;
  user_name: string | null;
  target_user_email?: string | null;
  event_type: string;
  object_type: string;
  object_id: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

const mapChillerLogForMonitoringPdf = (l: any) => ({
  date: l.timestamp ? format(new Date(l.timestamp), 'dd/MM/yy') : '',
  time: l.timestamp ? format(new Date(l.timestamp), 'HH:mm') : '',
  id: l.id,
  equipmentType: 'chiller',
  equipmentId: l.equipment_id,
  evapWaterInletPressure: l.evap_water_inlet_pressure,
  evapWaterOutletPressure: l.evap_water_outlet_pressure,
  evapEnteringWaterTemp: l.evap_entering_water_temp,
  evapLeavingWaterTemp: l.evap_leaving_water_temp,
  evapApproachTemp: l.evap_approach_temp,
  condWaterInletPressure: l.cond_water_inlet_pressure,
  condWaterOutletPressure: l.cond_water_outlet_pressure,
  condEnteringWaterTemp: l.cond_entering_water_temp,
  condLeavingWaterTemp: l.cond_leaving_water_temp,
  condApproachTemp: l.cond_approach_temp,
  chillerControlSignal: l.chiller_control_signal,
  avgMotorCurrent: l.avg_motor_current,
  compressorRunningTimeMin: l.compressor_running_time_min,
  starterEnergyKwh: l.starter_energy_kwh,
  coolingTowerPumpStatus: l.cooling_tower_pump_status,
  chilledWaterPumpStatus: l.chilled_water_pump_status,
  coolingTowerFanStatus: l.cooling_tower_fan_status,
  coolingTowerBlowoffValveStatus: l.cooling_tower_blowoff_valve_status,
  coolingTowerBlowdownTimeMin: l.cooling_tower_blowdown_time_min,
  dailyWaterConsumptionCt1Liters: l.daily_water_consumption_ct1_liters,
  dailyWaterConsumptionCt2Liters: l.daily_water_consumption_ct2_liters,
  dailyWaterConsumptionCt3Liters: l.daily_water_consumption_ct3_liters,
  coolingTowerChemicalName: l.cooling_tower_chemical_name,
  coolingTowerChemicalQtyPerDay: l.cooling_tower_chemical_qty_per_day,
  chilledWaterPumpChemicalName: l.chilled_water_pump_chemical_name,
  chilledWaterPumpChemicalQtyKg: l.chilled_water_pump_chemical_qty_kg,
  coolingTowerFanChemicalName: l.cooling_tower_fan_chemical_name,
  coolingTowerFanChemicalQtyKg: l.cooling_tower_fan_chemical_qty_kg,
  operatorSign: l.operator_sign,
  verifiedBy: l.verified_by,
  comment: l.comment,
  remarks: l.remarks,
  checkedBy: l.operator_name,
  timestamp: new Date(l.timestamp),
  status: l.status,
  raw: l,
});

const mapBoilerLogForMonitoringPdf = (l: any) => ({
  date: l.timestamp ? format(new Date(l.timestamp), 'dd/MM/yy') : '',
  time: l.timestamp ? format(new Date(l.timestamp), 'HH:mm') : '',
  id: l.id,
  equipmentType: 'boiler',
  equipmentId: l.equipment_id,
  feedWaterTemp: l.feed_water_temp,
  oilTemp: l.oil_temp,
  steamTemp: l.steam_temp,
  steamPressure: l.steam_pressure,
  steamFlowLPH: l.steam_flow_lph,
  foHsdNgDayTankLevel: l.fo_hsd_ng_day_tank_level,
  feedWaterTankLevel: l.feed_water_tank_level,
  foPreHeaterTemp: l.fo_pre_heater_temp,
  burnerOilPressure: l.burner_oil_pressure,
  burnerHeaterTemp: l.burner_heater_temp,
  boilerSteamPressure: l.boiler_steam_pressure,
  stackTemperature: l.stack_temperature,
  steamPressureAfterPrv: l.steam_pressure_after_prv,
  feedWaterHardnessPpm: l.feed_water_hardness_ppm,
  feedWaterTdsPpm: l.feed_water_tds_ppm,
  foHsdNgConsumption: l.fo_hsd_ng_consumption,
  mobreyFunctioning: l.mobrey_functioning,
  manualBlowdownTime: l.manual_blowdown_time,
  dieselStockLiters: l.diesel_stock_liters,
  dieselCostRupees: l.diesel_cost_rupees,
  furnaceOilStockLiters: l.furnace_oil_stock_liters,
  furnaceOilCostRupees: l.furnace_oil_cost_rupees,
  brigadeStockKg: l.brigade_stock_kg,
  brigadeCostRupees: l.brigade_cost_rupees,
  dailyPowerConsumptionKwh: l.daily_power_consumption_kwh,
  dailyWaterConsumptionLiters: l.daily_water_consumption_liters,
  dailyChemicalConsumptionKg: l.daily_chemical_consumption_kg,
  dailyDieselConsumptionLiters: l.daily_diesel_consumption_liters,
  dailyFurnaceOilConsumptionLiters: l.daily_furnace_oil_consumption_liters,
  dailyBrigadeConsumptionKg: l.daily_brigade_consumption_kg,
  steamConsumptionKgHr: l.steam_consumption_kg_hr,
  comment: l.comment,
  remarks: l.remarks,
  checkedBy: l.operator_name,
  timestamp: new Date(l.timestamp),
  status: l.status,
  raw: l,
});

const mapChemicalLogForMonitoringPdf = (l: any) => ({
  date: l.timestamp ? format(new Date(l.timestamp), 'dd/MM/yy') : '',
  time: l.timestamp ? format(new Date(l.timestamp), 'HH:mm') : '',
  id: l.id,
  equipmentType: 'chemical',
  equipmentName: l.equipment_name,
  chemicalName: l.chemical_name,
  chemicalPercent: l.chemical_percent,
  solutionConcentration: l.solution_concentration,
  waterQty: l.water_qty,
  chemicalQty: l.chemical_qty,
  batchNo: l.batch_no,
  doneBy: l.done_by,
  operatorName: l.operator_name,
  approvedAt: l.approved_at,
  secondaryApprovedAt: l.secondary_approved_at,
  comment: l.comment,
  remarks: l.remarks,
  checkedBy: l.checked_by || l.operator_name,
  timestamp: new Date(l.timestamp),
  status: l.status,
  raw: l,
});

const mapFilterLogForMonitoringPdf = (l: any) => {
  const fd = (val: string | null | undefined) => (val ? format(new Date(val), 'dd/MM/yyyy') : '');
  return {
    date: l.timestamp ? format(new Date(l.timestamp), 'dd/MM/yy') : '',
    time: l.timestamp ? format(new Date(l.timestamp), 'HH:mm') : '',
    id: l.id,
    equipmentType: 'filter',
    equipmentId: l.equipment_id ?? '',
    category: l.category ?? '',
    filterNo: l.filter_no ?? '',
    filterMicron: l.filter_micron ?? '',
    filterSize: l.filter_size ?? '',
    tagInfo: l.tag_info ?? '',
    activityType: l.activity_type ?? '',
    installedDate: fd(l.installed_date),
    integrityDoneDate: fd(l.integrity_done_date),
    integrityDueDate: fd(l.integrity_due_date),
    cleaningDoneDate: fd(l.cleaning_done_date),
    cleaningDueDate: fd(l.cleaning_due_date),
    replacementDueDate: fd(l.replacement_due_date),
    remarks: l.remarks ?? '',
    checkedBy: l.operator_name ?? '',
    timestamp: l.timestamp ? new Date(l.timestamp) : new Date(),
    status: l.status,
    raw: l,
  };
};

const isApprovedReportRow = (row: any): boolean =>
  String(row?.status ?? '').toLowerCase() === 'approved';

// TODO: Replace with API call to fetch reports
const typeIcons = {
  utility: FileText,
  chemical: FileText,
  validation: FileText,
  filter_register: FileText,
  air_velocity: FileText,
  filter_integrity: FileText,
  recovery: FileText,
  differential_pressure: FileText,
  nvpc: FileText,
};

const typeLabels = {
  utility: 'E Log Book',
  chemical: 'Chemical Prep',
  validation: 'HVAC Validation',
  filter_register: 'Filter Register',
  air_velocity: 'Air Velocity Test',
  filter_integrity: 'Filter Integrity Test',
  recovery: 'Recovery Test',
  differential_pressure: 'Differential Pressure Test',
  nvpc: 'NVPC Test',
};

const auditEventLabels: Record<string, string> = {
  limit_update: 'Limit Update',
  config_update: 'Config Update',
  log_update: 'Log Update',
  log_correction: 'Log Correction',
  log_created: 'Log Created',
  log_deleted: 'Log Deleted',
  entity_created: 'Entity Created',
  entity_updated: 'Entity Updated',
  entity_deleted: 'Entity Deleted',
  entity_approved: 'Entity Approved',
  entity_rejected: 'Entity Rejected',
  consumption_updated: 'Consumption Updated',
  user_created: 'User created',
  password_changed: 'Password changed',
  user_locked: 'User locked',
  user_unlocked: 'User unlocked',
};

export default function ReportsPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'approved' | 'user-management' | 'user-activity' | 'audit-trail'
  >('approved');

  // Load reports from centralized reports API (only approved reports for all roles)
  const loadReportsFromAPI = useCallback(async () => {
    try {
      const reportsData = await reportsAPI.list();
      
      // Transform API response to Report format; only include approved reports
      const reportsList: Report[] = reportsData
        .filter((report: any) => report.approved_at != null)
        .map((report: any) => ({
          id: report.id,
          type: report.report_type,
          title: report.title,
          site: report.site,
          createdBy: report.created_by,
          createdAt: new Date(report.created_at),
          approvedBy:
            (report.approved_by_name && String(report.approved_by_name).trim()) ||
            (report.approved_by_email && String(report.approved_by_email).trim()) ||
            undefined,
          approvedAt: report.approved_at ? new Date(report.approved_at) : undefined,
          status: 'approved' as const,
          remarks: report.remarks,
          originalData: {
            sourceId: report.source_id,
            sourceTable: report.source_table,
          },
        }));
      
      return reportsList;
    } catch (error) {
      console.error('Error loading reports from API:', error);
      toast.error('Failed to load reports');
      return [];
    }
  }, []);

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userReports, setUserReports] = useState<UserReport[]>([]);
  const [userReportsLoading, setUserReportsLoading] = useState(false);
  const [userReportRoleFilter, setUserReportRoleFilter] = useState<string>('all');
  const [userReportActiveFilter, setUserReportActiveFilter] = useState<string>('all');
  const [userReportActivityDate, setUserReportActivityDate] = useState<string>('');

  // Client-side filter so Role and Status dropdowns always show the correct subset (fixes Admin showing all, Super Admin not showing)
  const filteredUserReports = useMemo(() => {
    let list = userReports;
    if (userReportRoleFilter !== 'all') {
      list = list.filter((u) => u.role === userReportRoleFilter);
    }
    if (userReportActiveFilter !== 'all') {
      list = list.filter((u) => (userReportActiveFilter === 'true') === u.is_active);
    }
    return list;
  }, [userReports, userReportRoleFilter, userReportActiveFilter]);

  const [activityRows, setActivityRows] = useState<UserActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFromDate, setActivityFromDate] = useState<string>('');
  const [activityToDate, setActivityToDate] = useState<string>('');
  const [activityEventType, setActivityEventType] = useState<string>('all');

  const [auditRows, setAuditRows] = useState<AuditEventRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFromDate, setAuditFromDate] = useState<string>('');
  const [auditToDate, setAuditToDate] = useState<string>('');
  const [auditEventType, setAuditEventType] = useState<string>('all');
  const [auditObjectType, setAuditObjectType] = useState<string>('all');
  const [auditObjectId, setAuditObjectId] = useState<string>('');
  const [auditViewRow, setAuditViewRow] = useState<AuditEventRow | null>(null);

  const [reportFilterOpen, setReportFilterOpen] = useState(false);
  const [reportFilters, setReportFilters] = useState<{
    fromDate: string;
    toDate: string;
    fromTime: string;
    toTime: string;
    equipmentId: string;
    createdBy: string;
  }>({ fromDate: '', toDate: '', fromTime: '', toTime: '', equipmentId: '', createdBy: '' });
  const [equipmentOptions, setEquipmentOptions] = useState<{ value: string; label: string }[]>([]);

  const isSupervisor = user?.role === 'supervisor' || user?.role === 'super_admin';
  const isManager = user?.role === 'manager';
  const isCustomer = user?.role === 'customer';
  const canSeeUserReports = !isCustomer && (isSupervisor || isManager || user?.role === 'super_admin');
  const canSeeActivity = !isCustomer && (isSupervisor || isManager || user?.role === 'super_admin');
  const canSeeAudit = !isCustomer && (isSupervisor || isManager || user?.role === 'super_admin');

  const reportCreatedByOptions = useMemo(() => {
    const unique = Array.from(new Set(reports.map((r) => r.createdBy).filter(Boolean))) as string[];
    return unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [reports]);

  const activeReportFilterCount = useMemo(
    () =>
      [
        reportFilters.fromDate,
        reportFilters.toDate,
        reportFilters.fromTime,
        reportFilters.toTime,
        reportFilters.equipmentId,
        reportFilters.createdBy,
      ].filter(Boolean).length,
    [reportFilters]
  );

  const filteredReports = reports.filter(report => {
    // Only show approved reports
    if (report.status !== 'approved') return false;

    const matchesType = filterType === 'all' || report.type === filterType;
    const matchesSearch =
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesType || !matchesSearch) return false;

    if (reportFilters.fromDate) {
      const fromStart = new Date(reportFilters.fromDate);
      fromStart.setHours(0, 0, 0, 0);
      if (report.createdAt < fromStart) return false;
    }
    if (reportFilters.toDate) {
      const toEnd = new Date(reportFilters.toDate);
      toEnd.setHours(23, 59, 59, 999);
      if (report.createdAt > toEnd) return false;
    }
    if (reportFilters.equipmentId && report.site !== reportFilters.equipmentId) return false;
    if (reportFilters.createdBy && report.createdBy !== reportFilters.createdBy) return false;

    const reportTime = format(report.createdAt, 'HH:mm');
    if (reportFilters.fromTime && reportTime < reportFilters.fromTime) return false;
    if (reportFilters.toTime && reportTime > reportFilters.toTime) return false;

    return true;
  });

  // Check if all visible reports are selected
  const allSelected = filteredReports.length > 0 && filteredReports.every(report => selectedReports.includes(report.id));
  const someSelected = filteredReports.some(report => selectedReports.includes(report.id));

  // Handle individual checkbox toggle
  const handleReportToggle = (reportId: string) => {
    setSelectedReports(prev => {
      if (prev.includes(reportId)) {
        // Unselect
        return prev.filter(id => id !== reportId);
      } else {
        // Select
        return [...prev, reportId];
      }
    });
  };

  // Handle select all toggle
  const handleSelectAll = () => {
    if (allSelected) {
      // Unselect all visible reports
      setSelectedReports(prev => prev.filter(id => !filteredReports.some(r => r.id === id)));
    } else {
      // Select all visible reports
      const visibleIds = filteredReports.map(r => r.id);
      setSelectedReports(prev => {
        const newIds = visibleIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
  };

  // Load approved reports from API on mount and refresh periodically
  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      const reportsList = await loadReportsFromAPI();
      setReports(reportsList);
      setIsLoading(false);
    };
    
    fetchReports();
    
    // Refresh every 30 seconds to keep data fresh
    const intervalId = setInterval(fetchReports, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [loadReportsFromAPI]);

  useEffect(() => {
    const loadEquipmentOptions = async () => {
      try {
        const [equipmentList, filterList] = await Promise.all([
          equipmentAPI.list(),
          filterMasterAPI.list({ status: 'approved' }),
        ]);
        const eqItems = (Array.isArray(equipmentList) ? equipmentList : [])
          .filter((e: any) => e?.is_active !== false && e?.status === 'approved')
          .map((e: any) => ({
            value: e.equipment_number,
            label: `${e.equipment_number} - ${e.name || ''}`.trim(),
          }));
        const filterItems = (Array.isArray(filterList) ? filterList : [])
          .filter((f: any) => f?.filter_id)
          .map((f: any) => ({
            value: f.filter_id,
            label: `${f.filter_id} - ${f.category_name ?? f.category?.name ?? ''}`.trim(),
          }));
        const combined = [...eqItems, ...filterItems].sort((a, b) =>
          a.value.localeCompare(b.value, undefined, { sensitivity: 'base' })
        );
        setEquipmentOptions(combined);
      } catch (err) {
        console.error('Failed to load equipment options for report filter', err);
        setEquipmentOptions([]);
      }
    };
    loadEquipmentOptions();
  }, []);

  const loadUserReports = useCallback(
    async (params?: { role?: string; is_active?: string; activity_date?: string }) => {
      try {
        setUserReportsLoading(true);
        const data = await reportsAPI.listUsers(params);

        // Normalize is_active to a strict boolean so status
        // badges and filters correctly show Active/Inactive
        const normalizedData: UserReport[] = data.map((u: any) => ({
          ...u,
          is_active:
            u.is_active === true ||
            u.is_active === 1 ||
            u.is_active === '1' ||
            u.is_active === 'true' ||
            u.is_active === 'True' ||
            u.is_active === 'ACTIVE' ||
            u.is_active === 'Active',
        }));

        setUserReports(normalizedData);
      } catch (error) {
        console.error('Error loading user management reports:', error);
        toast.error('Failed to load user management report');
      } finally {
        setUserReportsLoading(false);
      }
    },
    [],
  );

  const loadUserActivity = useCallback(
    async (params?: {
      from_date?: string;
      to_date?: string;
      user?: string;
      event_type?: string;
    }) => {
      try {
        setActivityLoading(true);
        const data = await reportsAPI.listUserActivity(params);
        setActivityRows(data);
      } catch (error) {
        console.error('Error loading user activity report:', error);
        toast.error('Failed to load user activity report');
      } finally {
        setActivityLoading(false);
      }
    },
    [],
  );

  const loadAuditEvents = useCallback(
    async (params?: {
      from_date?: string;
      to_date?: string;
      user?: string;
      object_type?: string;
      event_type?: string;
    }) => {
      try {
        setAuditLoading(true);
        const data = await reportsAPI.listAuditEvents(params);
        setAuditRows(data);
      } catch (error: any) {
        console.error('Error loading audit trail report:', {
          error,
          status: error?.status,
          data: error?.data,
        });

        if (error?.status && error.status >= 500) {
          toast.error('Server error while loading audit trail report');
        } else if (error?.status && error.status >= 400) {
          toast.error('Failed to load audit trail report (check filters and permissions)');
        } else {
          toast.error('Failed to load audit trail report');
        }
      } finally {
        setAuditLoading(false);
      }
    },
    [],
  );

  const handleAuditView = (row: AuditEventRow) => setAuditViewRow(row);
  const handleAuditDownload = (row: AuditEventRow) => {
    const blob = new Blob([JSON.stringify(row, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-event-${row.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit event downloaded');
  };
  const handleAuditPrint = (row: AuditEventRow) => {
    const rowHtml = `
      <tr>
        <td>${row.timestamp ? format(new Date(row.timestamp), 'dd/MM/yy HH:mm') : ''}</td>
        <td>${row.user_email ?? row.target_user_email ?? ''}</td>
        <td>${auditEventLabels[row.event_type] ?? row.event_type}</td>
        <td>${row.object_type}</td>
        <td>${row.object_id ?? ''}</td>
        <td>${row.field_name}</td>
        <td>${row.old_value ?? ''}</td>
        <td>${row.new_value ?? ''}</td>
      </tr>`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Audit Event</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Audit Event</h1>
          <table>
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>User Email</th>
                <th>Event</th>
                <th>Object Type</th>
                <th>Object ID</th>
                <th>Field</th>
                <th>Old Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>${rowHtml}</tbody>
          </table>
        </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.visibility = 'hidden';
    iframe.style.zIndex = '-1';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error('Print failed');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          toast.success('Opening print dialog...');
        }
      } catch (e) {
        console.error('Error triggering print:', e);
        toast.error('Print failed');
      }
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 500);
    };

    if (iframe.contentWindow?.document.readyState === 'complete') {
      triggerPrint();
    } else {
      iframe.onload = triggerPrint;
    }
  };

  // Read URL params on mount (e.g. from "View history" link on log pages)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const object_type = params.get('object_type');
    const object_id = params.get('object_id');
    if (tab === 'audit-trail') {
      setActiveTab('audit-trail');
      if (object_type) setAuditObjectType(object_type);
      if (object_id) setAuditObjectId(object_id);
    }
  }, []);

  // Lazy-load data when switching tabs
  useEffect(() => {
    if (activeTab === 'user-management' && canSeeUserReports && userReports.length === 0) {
      const roleParam = userReportRoleFilter === 'all' ? undefined : userReportRoleFilter;
      const activeParam = userReportActiveFilter === 'all' ? undefined : userReportActiveFilter;
      loadUserReports({ role: roleParam, is_active: activeParam });
    } else if (activeTab === 'user-activity' && canSeeActivity && activityRows.length === 0) {
      loadUserActivity();
    } else if (activeTab === 'audit-trail' && canSeeAudit && auditRows.length === 0) {
      const params: Record<string, string> = {};
      if (auditFromDate) params.from_date = auditFromDate;
      if (auditToDate) params.to_date = auditToDate;
      if (auditEventType !== 'all') params.event_type = auditEventType;
      if (auditObjectType !== 'all' && auditObjectType.trim()) params.object_type = auditObjectType.trim();
      if (auditObjectId.trim()) params.object_id = auditObjectId.trim();
      loadAuditEvents(params);
    }
  }, [
    activeTab,
    canSeeUserReports,
    canSeeActivity,
    canSeeAudit,
    userReports.length,
    activityRows.length,
    auditRows.length,
    auditFromDate,
    auditToDate,
    auditEventType,
    auditObjectType,
    auditObjectId,
    loadUserReports,
    loadUserActivity,
    loadAuditEvents,
  ]);

  // Poll user activity periodically when the User Activity tab is active
  useEffect(() => {
    if (!(activeTab === 'user-activity' && canSeeActivity)) {
      return;
    }

    const buildParams = () => {
      const params: any = {};
      if (activityFromDate) params.from_date = activityFromDate;
      if (activityToDate) params.to_date = activityToDate;
      if (activityEventType !== 'all') params.event_type = activityEventType;
      return params;
    };

    const params = buildParams();
    loadUserActivity(params);

    const intervalId = window.setInterval(() => {
      loadUserActivity(buildParams());
    }, 30000); // 30 seconds

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeTab,
    canSeeActivity,
    activityFromDate,
    activityToDate,
    activityEventType,
    loadUserActivity,
  ]);


  const handleApprove = async () => {
    if (!selectedReport) return;
    
    try {
      // Call API to approve the report
      if (selectedReport.type === 'utility') {
        const log = selectedReport.originalData;
        if (log.equipmentType === 'chiller') {
          await chillerLogAPI.approve(selectedReport.id, 'approve', approvalRemarks);
        } else if (log.equipmentType === 'boiler') {
          await boilerLogAPI.approve(selectedReport.id, 'approve', approvalRemarks);
        } else if (log.equipmentType === 'compressor') {
          await compressorLogAPI.approve(selectedReport.id, 'approve', approvalRemarks);
        } else if (log.equipmentType === 'chemical') {
          await chemicalPrepAPI.approve(selectedReport.id, 'approve', approvalRemarks);
        }
      } else if (selectedReport.type === 'validation') {
        await hvacValidationAPI.approve(selectedReport.id, 'approve', approvalRemarks);
      } else {
        // Handle test certificates
        const approveMap: Record<string, (id: string, action: string, remarks?: string) => Promise<any>> = {
          air_velocity: (id, action, remarks) => testCertificateAPI.airVelocity.approve(id, action as 'approve' | 'reject', remarks),
          filter_integrity: (id, action, remarks) => testCertificateAPI.filterIntegrity.approve(id, action as 'approve' | 'reject', remarks),
          recovery: (id, action, remarks) => testCertificateAPI.recovery.approve(id, action as 'approve' | 'reject', remarks),
          differential_pressure: (id, action, remarks) => testCertificateAPI.differentialPressure.approve(id, action as 'approve' | 'reject', remarks),
          nvpc: (id, action, remarks) => testCertificateAPI.nvpc.approve(id, action as 'approve' | 'reject', remarks),
        };
        const approveFn = approveMap[selectedReport.type];
        if (approveFn) {
          await approveFn(selectedReport.id, 'approve', approvalRemarks);
        }
      }
      
      // Refresh reports from API
      const reportsList = await loadReportsFromAPI();
      setReports(reportsList);
      
      setIsApprovalDialogOpen(false);
      setSelectedReport(null);
      setApprovalRemarks('');
      toast.success('Report approved successfully');
    } catch (error: any) {
      console.error('Error approving report:', error);
      toast.error(error?.message || 'Failed to approve report');
    }
  };

  const handleReject = async () => {
    if (!selectedReport || !approvalRemarks) {
      toast.error('Please provide remarks for rejection');
      return;
    }
    
    try {
      // Call API to reject the report
      if (selectedReport.type === 'utility') {
        const log = selectedReport.originalData;
        if (log.equipmentType === 'chiller') {
          await chillerLogAPI.approve(selectedReport.id, 'reject', approvalRemarks);
        } else if (log.equipmentType === 'boiler') {
          await boilerLogAPI.approve(selectedReport.id, 'reject', approvalRemarks);
        } else if (log.equipmentType === 'compressor') {
          await compressorLogAPI.approve(selectedReport.id, 'reject', approvalRemarks);
        } else if (log.equipmentType === 'chemical') {
          await chemicalPrepAPI.approve(selectedReport.id, 'reject', approvalRemarks);
        }
      } else if (selectedReport.type === 'validation') {
        await hvacValidationAPI.approve(selectedReport.id, 'reject', approvalRemarks);
      } else {
        // Handle test certificates
        const approveMap: Record<string, (id: string, action: string, remarks?: string) => Promise<any>> = {
          air_velocity: (id, action, remarks) => testCertificateAPI.airVelocity.approve(id, action as 'approve' | 'reject', remarks),
          filter_integrity: (id, action, remarks) => testCertificateAPI.filterIntegrity.approve(id, action as 'approve' | 'reject', remarks),
          recovery: (id, action, remarks) => testCertificateAPI.recovery.approve(id, action as 'approve' | 'reject', remarks),
          differential_pressure: (id, action, remarks) => testCertificateAPI.differentialPressure.approve(id, action as 'approve' | 'reject', remarks),
          nvpc: (id, action, remarks) => testCertificateAPI.nvpc.approve(id, action as 'approve' | 'reject', remarks),
        };
        const approveFn = approveMap[selectedReport.type];
        if (approveFn) {
          await approveFn(selectedReport.id, 'reject', approvalRemarks);
        }
      }
      
      // Refresh reports from API
      const reportsList = await loadReportsFromAPI();
      setReports(reportsList);
      
      setIsApprovalDialogOpen(false);
      setSelectedReport(null);
      setApprovalRemarks('');
      toast.error('Report rejected');
    } catch (error: any) {
      console.error('Error rejecting report:', error);
      toast.error(error?.message || 'Failed to reject report');
    }
  };

  // Helper function to fetch full data from original source
  const fetchFullReportData = useCallback(async (report: Report): Promise<any> => {
    // If originalData already holds a fully resolved object (set by handleView),
    // reuse it instead of trying to refetch by sourceId/sourceTable.
    if (
      report.originalData &&
      !('sourceId' in report.originalData) &&
      !('sourceTable' in report.originalData)
    ) {
      return report.originalData;
    }

    const { sourceId, sourceTable } = report.originalData || {};
    if (!sourceTable) return null;

    // For utility (E Log Book) reports without sourceId, return minimal equipmentType
    // so export/print can still show type when the original log was deleted.
    if (report.type === 'utility' && !sourceId) {
      if (sourceTable === 'chiller_logs') {
        return { equipmentType: 'chiller' };
      }
      if (sourceTable === 'boiler_logs') {
        return { equipmentType: 'boiler' };
      }
      if (sourceTable === 'compressor_logs') {
        return { equipmentType: 'compressor' };
      }
      if (sourceTable === 'chemical_preparations') {
        return { equipmentType: 'chemical' };
      }
      if (sourceTable === 'filter_logs') {
        return { equipmentType: 'filter' };
      }
    }

    if (!sourceId) return null;

    try {
      // Map source table names to API functions
      const apiMap: Record<string, (id: string) => Promise<any>> = {
        'chiller_logs': (id) => chillerLogAPI.get(id),
        'boiler_logs': (id) => boilerLogAPI.get(id),
        'compressor_logs': (id) => compressorLogAPI.get(id),
        'chemical_preparations': (id) => chemicalPrepAPI.get(id),
        'filter_logs': (id) => filterLogAPI.get(id),
        'hvac_validations': (id) => hvacValidationAPI.get(id),
        'filter_master': (id) => filterMasterAPI.get(id),
        'air_velocity_tests': (id) => testCertificateAPI.airVelocity.get(id),
        'filter_integrity_tests': (id) => testCertificateAPI.filterIntegrity.get(id),
        'recovery_tests': (id) => testCertificateAPI.recovery.get(id),
        'differential_pressure_tests': (id) => testCertificateAPI.differentialPressure.get(id),
        'nvpc_tests': (id) => testCertificateAPI.nvpc.get(id),
      };

      const fetchFn = apiMap[sourceTable];
      if (!fetchFn) {
        console.error(`Unknown source table: ${sourceTable}`);
        return null;
      }

      const data = await fetchFn(sourceId);
      
      // Transform data based on source table
      if (sourceTable === 'chiller_logs') {
        return { ...data, equipmentType: 'chiller' };
      } else if (sourceTable === 'boiler_logs') {
        return { ...data, equipmentType: 'boiler' };
      } else if (sourceTable === 'compressor_logs') {
        return { ...data, equipmentType: 'compressor' };
      } else if (sourceTable === 'chemical_preparations') {
        return { ...data, equipmentType: 'chemical' };
      } else if (sourceTable === 'filter_logs') {
        return { ...data, equipmentType: 'filter' };
      } else if (sourceTable === 'filter_master') {
        return { ...data, reportType: 'filter_register' };
      } else if (sourceTable === 'air_velocity_tests') {
        // Transform air velocity test data
        return {
          id: data.id,
          clientInfo: { name: data.client_name, address: data.client_address },
          certificateNo: data.certificate_no,
          date: data.date,
          testReference: data.test_reference || '',
          instrument: {
            name: data.instrument_name,
            make: data.instrument_make,
            model: data.instrument_model,
            serialNumber: data.instrument_serial_number,
            idNumber: data.instrument_id_number || undefined,
            calibrationDate: data.instrument_calibration_date || '',
            calibrationDueDate: data.instrument_calibration_due_date || '',
            flowRate: data.instrument_flow_rate || undefined,
            samplingTime: data.instrument_sampling_time || undefined,
          },
          ahuNumber: data.ahu_number,
          inference: data.inference || undefined,
          rooms: data.rooms?.map((room: any) => ({
            roomName: room.room_name,
            roomNumber: room.room_number || undefined,
            filters: room.filters?.map((filter: any) => ({
              filterId: filter.filter_id,
              filterArea: filter.filter_area,
              readings: [
                filter.reading_1,
                filter.reading_2,
                filter.reading_3,
                filter.reading_4,
                filter.reading_5,
              ] as [number, number, number, number, number],
              avgVelocity: filter.avg_velocity,
              airFlowCFM: filter.air_flow_cfm,
            })) || [],
            totalAirFlowCFM: room.total_air_flow_cfm,
            roomVolumeCFT: room.room_volume_cft,
            ach: room.ach,
            designACPH: room.design_acph || undefined,
          })) || [],
          preparedBy: data.prepared_by,
          approvedBy: data.approved_by_id ? data.operator_name : undefined,
          timestamp: new Date(data.timestamp),
          status: data.status as 'pending' | 'approved' | 'rejected',
        };
      } else if (sourceTable === 'filter_integrity_tests') {
        return {
          id: data.id,
          clientInfo: { name: data.client_name, address: data.client_address },
          certificateNo: data.certificate_no,
          date: data.date,
          testReference: data.test_reference || '',
          instrument: {
            name: data.instrument_name,
            make: data.instrument_make,
            model: data.instrument_model,
            serialNumber: data.instrument_serial_number,
            idNumber: data.instrument_id_number || undefined,
            calibrationDate: data.instrument_calibration_date || '',
            calibrationDueDate: data.instrument_calibration_due_date || '',
            flowRate: data.instrument_flow_rate || undefined,
            samplingTime: data.instrument_sampling_time || undefined,
          },
          ahuNumber: data.ahu_number,
          inference: data.inference,
          rooms: data.rooms?.map((room: any) => ({
            roomName: room.room_name,
            roomNumber: room.room_number || undefined,
            readings: room.readings?.map((reading: any) => ({
              filterId: reading.filter_id,
              upstreamConcentration: reading.upstream_concentration,
              aerosolConcentration: reading.aerosol_concentration,
              downstreamConcentration: reading.downstream_concentration,
              downstreamLeakage: reading.downstream_leakage,
              acceptableLimit: reading.acceptable_limit,
              testStatus: reading.test_status,
            })) || [],
          })) || [],
          preparedBy: data.prepared_by,
          approvedBy: data.approved_by_id ? data.operator_name : undefined,
          timestamp: new Date(data.timestamp),
          status: data.status as 'pending' | 'approved' | 'rejected',
        };
      } else if (sourceTable === 'recovery_tests') {
        return {
          id: data.id,
          clientInfo: { name: data.client_name, address: data.client_address },
          certificateNo: data.certificate_no,
          date: data.date,
          areaClassification: data.area_classification,
          instrument: {
            name: data.instrument_name,
            make: data.instrument_make,
            model: data.instrument_model,
            serialNumber: data.instrument_serial_number,
            idNumber: data.instrument_id_number || undefined,
            calibrationDate: data.instrument_calibration_date || '',
            calibrationDueDate: data.instrument_calibration_due_date || '',
            flowRate: data.instrument_flow_rate || undefined,
            samplingTime: data.instrument_sampling_time || undefined,
          },
          ahuNumber: data.ahu_number,
          roomName: data.room_name || undefined,
          roomNumber: data.room_number || undefined,
          testCondition: data.test_condition || undefined,
          timeSeries: data.data_points?.map((dp: any) => ({
            time: dp.time,
            ahuStatus: dp.ahu_status as 'ON' | 'OFF',
            particleCount05: dp.particle_count_05,
            particleCount5: dp.particle_count_5,
          })) || [],
          recoveryTime: data.recovery_time,
          testStatus: data.test_status as 'PASS' | 'FAIL' | undefined,
          auditStatement: data.audit_statement || undefined,
          preparedBy: data.prepared_by,
          approvedBy: data.approved_by_id ? data.operator_name : undefined,
          timestamp: new Date(data.timestamp),
          status: data.status as 'pending' | 'approved' | 'rejected',
        };
      } else if (sourceTable === 'differential_pressure_tests') {
        return {
          id: data.id,
          clientInfo: { name: data.client_name, address: data.client_address },
          certificateNo: data.certificate_no,
          date: data.date,
          instrument: {
            name: data.instrument_name,
            make: data.instrument_make,
            model: data.instrument_model,
            serialNumber: data.instrument_serial_number,
            idNumber: data.instrument_id_number || undefined,
            calibrationDate: data.instrument_calibration_date || '',
            calibrationDueDate: data.instrument_calibration_due_date || '',
            flowRate: data.instrument_flow_rate || undefined,
            samplingTime: data.instrument_sampling_time || undefined,
          },
          ahuNumber: data.ahu_number,
          readings: data.readings?.map((reading: any) => ({
            roomPositive: reading.room_positive,
            roomNegative: reading.room_negative,
            dpReading: reading.dp_reading,
            limit: reading.limit,
            testStatus: reading.test_status,
          })) || [],
          preparedBy: data.prepared_by,
          approvedBy: data.approved_by_id ? data.operator_name : undefined,
          timestamp: new Date(data.timestamp),
          status: data.status as 'pending' | 'approved' | 'rejected',
        };
      } else if (sourceTable === 'nvpc_tests') {
        return {
          id: data.id,
          clientInfo: { name: data.client_name, address: data.client_address },
          certificateNo: data.certificate_no,
          date: data.date,
          areaClassification: data.area_classification,
          instrument: {
            name: data.instrument_name,
            make: data.instrument_make,
            model: data.instrument_model,
            serialNumber: data.instrument_serial_number,
            idNumber: data.instrument_id_number || undefined,
            calibrationDate: data.instrument_calibration_date || '',
            calibrationDueDate: data.instrument_calibration_due_date || '',
            flowRate: data.instrument_flow_rate || undefined,
            samplingTime: data.instrument_sampling_time || undefined,
          },
          ahuNumber: data.ahu_number,
          areaName: data.area_name || undefined,
          inference: data.inference || undefined,
          rooms: data.rooms?.map((room: any) => ({
            roomName: room.room_name,
            roomNumber: room.room_number || undefined,
            isoClass: room.iso_class || undefined,
            mean05: room.mean_05 || undefined,
            mean5: room.mean_5 || undefined,
            roomStatus: room.room_status || undefined,
            samplingPoints: room.sampling_points?.map((point: any) => ({
              pointId: point.point_id,
              location: point.location,
              readings05: point.readings_05 || [],
              readings5: point.readings_5 || [],
              average05: point.average_05,
              average5: point.average_5,
              limit05: point.limit_05,
              limit5: point.limit_5,
              testStatus: point.test_status,
            })) || [],
          })) || [],
          preparedBy: data.prepared_by,
          approvedBy: data.approved_by_id ? data.operator_name : undefined,
          timestamp: new Date(data.timestamp),
          status: data.status as 'pending' | 'approved' | 'rejected',
        };
      }
      
      return data;
    } catch (error) {
      console.error(`Error fetching full data for ${sourceTable}:`, error);
      return null;
    }
  }, []);

  const handleView = async (report: Report) => {
    // Fetch full data for viewing
    const fullData = await fetchFullReportData(report);
    setSelectedReport({ ...report, originalData: fullData });
    setIsViewDialogOpen(true);
  };

  const handleExport = async (report: Report) => {
    // Fetch full data from original source (or minimal info for utility reports)
    const log = await fetchFullReportData(report);
    if (!log) {
      toast.error(
        report.type === 'utility'
          ? 'Failed to determine report equipment type for export.'
          : 'Original report data was deleted or not found; cannot export this report.'
      );
      return;
    }
    
    // For test certificates, generate PDF with specific filename format
    if (report.type === 'air_velocity' && log) {
      try {
        const blob = await generateAirVelocityPDF(log);
        downloadPDF(blob, 'Air Velocity.pdf');
        toast.success('PDF generated successfully');
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'filter_integrity' && log) {
      try {
        const blob = await generateFilterIntegrityPDF(log);
        downloadPDF(blob, 'Filter Intigrity.pdf');
        toast.success('PDF generated successfully');
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'recovery' && log) {
      try {
        const blob = await generateRecoveryTestPDF(log);
        downloadPDF(blob, 'Recovery test.pdf');
        toast.success('PDF generated successfully');
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'differential_pressure' && log) {
      try {
        const blob = await generateDifferentialPressurePDF(log);
        // Format: SVU-DP-{year}-{month}
        // Example: Certificate "SVU/01-002" with date "2023-10-13" -> "SVU-DP-2023-01"
        let filename = 'SVU-DP-';
        if (log.date) {
          const dateObj = new Date(log.date);
          const year = dateObj.getFullYear();
          filename += `${year}-`;
        }
        if (log.certificateNo) {
          // Extract month/number part from certificate (e.g., "SVU/01-002" -> "01")
          // Certificate format is typically "SVU/MM-XXX" where MM is the month
          const match = log.certificateNo.match(/\/(\d+)-/);
          if (match && match[1]) {
            filename += match[1].padStart(2, '0');
          } else {
            // Fallback: try to extract any number after the slash
            const parts = log.certificateNo.split('/');
            if (parts.length > 1) {
              const numberPart = parts[1].split('-')[0];
              filename += numberPart.padStart(2, '0');
            }
          }
        }
        filename += '.pdf';
        downloadPDF(blob, filename);
        toast.success('PDF generated successfully');
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'nvpc' && log) {
      try {
        const blob = await generateNVPCPDF(log);
        downloadPDF(blob, 'NVPC.pdf');
        toast.success('PDF generated successfully');
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    // For utility reports (and legacy chemical report rows), generate PDF with equipment-wise logs
    if ((report.type === 'utility' || report.type === 'chemical') && log) {
      try {
        // Fetch all logs of the same equipment type from API
        let allLogs: any[] = [];
        
        if (log.equipmentType === 'chiller') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const chillerLogs = await chillerLogAPI.list();
          allLogs = chillerLogs
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId)
            )
            .map(mapChillerLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const chillerPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateChillerMonitoringPDF(chillerPdfData);
          downloadPDF(blob, 'Chiller Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        } else if (log.equipmentType === 'boiler') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const boilerLogs = await boilerLogAPI.list();
          allLogs = boilerLogs
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId)
            )
            .map(mapBoilerLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const boilerPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateBoilerMonitoringPDF(boilerPdfData);
          downloadPDF(blob, 'Boiler Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        } else if (log.equipmentType === 'chemical') {
          const targetEquipmentName = (log.equipment_name ?? log.equipmentName ?? report.site ?? '').toString();
          const chemicalPreps = await chemicalPrepAPI.list();
          allLogs = chemicalPreps
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentName || String(l.equipment_name ?? '') === targetEquipmentName)
            )
            .map(mapChemicalLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const chemicalPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateChemicalMonitoringPDF(chemicalPdfData);
          downloadPDF(blob, 'Chemical Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        } else if (log.equipmentType === 'filter') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const targetFilterNo = (log.filter_no ?? log.filterNo ?? '').toString();
          const filterLogs = await filterLogAPI.list();
          allLogs = filterLogs
            .filter((l: any) => {
              if (!isApprovedReportRow(l)) return false;
              const matchEquipment = !targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId;
              const matchFilter = !targetFilterNo || String(l.filter_no ?? '') === targetFilterNo;
              return matchEquipment && matchFilter;
            })
            .map(mapFilterLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const filterPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateFilterMonitoringPDF(filterPdfData);
          downloadPDF(blob, 'Filter Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        }
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    // For other report types, use the existing print window approach
    const reportData = {
      title: report.title,
      type: typeLabels[report.type],
      site: report.site,
      createdBy: report.createdBy,
      createdAt: format(report.createdAt, 'PPpp'),
      status: report.status,
      remarks: report.remarks || 'No remarks',
      approvedBy: report.approvedBy,
      approvedAt: report.approvedAt ? format(report.approvedAt, 'PPpp') : null,
    };

    // Create a new window with the report content
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${report.title} - Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
              h2 { color: #555; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
              .info { margin: 15px 0; }
              .label { font-weight: bold; color: #666; }
              .value { margin-left: 10px; }
              .status { display: inline-block; padding: 5px 10px; border-radius: 4px; margin: 5px 0; }
              .approved { background-color: #d4edda; color: #155724; }
              .pending { background-color: #fff3cd; color: #856404; }
              .rejected { background-color: #f8d7da; color: #721c24; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>${reportData.title}</h1>
            <div class="info"><span class="label">Type:</span><span class="value">${reportData.type}</span></div>
            <div class="info"><span class="label">Site:</span><span class="value">${reportData.site}</span></div>
            <div class="info"><span class="label">Created By:</span><span class="value">${reportData.createdBy}</span></div>
            <div class="info"><span class="label">Created At:</span><span class="value">${reportData.createdAt}</span></div>
            <div class="info"><span class="label">Status:</span><span class="value"><span class="status ${reportData.status}">${reportData.status}</span></span></div>
            ${reportData.approvedBy ? `<div class="info"><span class="label">Approved By:</span><span class="value">${reportData.approvedBy}</span></div>` : ''}
            ${reportData.approvedAt ? `<div class="info"><span class="label">Approved At:</span><span class="value">${reportData.approvedAt}</span></div>` : ''}
            <div class="info"><span class="label">Remarks:</span><span class="value">${reportData.remarks}</span></div>
            ${log ? generateLogDetailsHTML(log, report.type) : ''}
            <button onclick="window.print()">Print</button>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
      printWindow.document.close();
      toast.success('Report opened in new window');
    } else {
      toast.error('Please allow popups to export reports');
    }
  };

  const generateLogDetailsHTML = (log: any, reportType?: string): string => {
    if (!log) return '';
    
    // Handle test certificates
    if (reportType && ['air_velocity', 'filter_integrity', 'recovery', 'differential_pressure', 'nvpc'].includes(reportType)) {
      let detailsHTML = '<h2>Test Certificate Details</h2>';
      detailsHTML += `<div class="info"><span class="label">Certificate No:</span><span class="value">${log.certificateNo || 'N/A'}</span></div>`;
      detailsHTML += `<div class="info"><span class="label">Date:</span><span class="value">${log.date || 'N/A'}</span></div>`;
      detailsHTML += `<div class="info"><span class="label">Client:</span><span class="value">${log.clientInfo?.name || 'N/A'}</span></div>`;
      detailsHTML += `<div class="info"><span class="label">AHU Number:</span><span class="value">${log.ahuNumber || 'N/A'}</span></div>`;
      if (log.instrument) {
        detailsHTML += `<div class="info"><span class="label">Instrument:</span><span class="value">${log.instrument.name || 'N/A'}</span></div>`;
        detailsHTML += `<div class="info"><span class="label">Make:</span><span class="value">${log.instrument.make || 'N/A'}</span></div>`;
        detailsHTML += `<div class="info"><span class="label">Model:</span><span class="value">${log.instrument.model || 'N/A'}</span></div>`;
      }
      if (reportType === 'recovery' && log.recoveryTime) {
        detailsHTML += `<div class="info"><span class="label">Recovery Time:</span><span class="value">${log.recoveryTime} minutes</span></div>`;
      }
      return detailsHTML;
    }
    
    if (reportType === 'filter_register' || log.reportType === 'filter_register') {
      const safe = (v: any) => (v === null || v === undefined || v === '' ? 'N/A' : String(v));
      const renderRow = (label: string, value: any) =>
        `<div class=\"info\"><span class=\"label\">${label}:</span><span class=\"value\">${safe(value)}</span></div>`;

      let detailsHTML = '<h2>Filter Register Details</h2>';

      // Primary fields (friendly order)
      detailsHTML += renderRow('Filter ID', log.filter_id || log.filterId || 'N/A');
      detailsHTML += renderRow('Category', log.category_name || log.categoryName || log.category || 'N/A');
      detailsHTML += renderRow('Make', log.make);
      detailsHTML += renderRow('Model', log.model);
      detailsHTML += renderRow('Serial Number', log.serial_number || log.serialNumber);
      detailsHTML += renderRow('Micron Size', log.micron_size || log.micronSize);
      detailsHTML += renderRow('Size (L)', log.size_l ?? log.sizeL);
      detailsHTML += renderRow('Size (W)', log.size_w ?? log.sizeW);
      detailsHTML += renderRow('Size (H)', log.size_h ?? log.sizeH);
      detailsHTML += renderRow('Certificate File', log.certificate_file || log.certificateFile);
      detailsHTML += renderRow('Status', log.status);
      detailsHTML += renderRow('Client ID', log.client_id || log.clientId);
      detailsHTML += renderRow('Active', log.is_active ?? log.isActive);
      detailsHTML += renderRow('Created At', log.created_at || log.createdAt);
      detailsHTML += renderRow('Updated At', log.updated_at || log.updatedAt);
      detailsHTML += renderRow('Created By', log.created_by || log.createdBy);
      detailsHTML += renderRow('Approved By', log.approved_by || log.approvedBy);
      detailsHTML += renderRow('Approved At', log.approved_at || log.approvedAt);

      // Additional fields (anything else returned by API)
      const known = new Set([
        'id',
        'filter_id',
        'filterId',
        'category',
        'category_name',
        'categoryName',
        'make',
        'model',
        'serial_number',
        'serialNumber',
        'size_l',
        'sizeL',
        'size_w',
        'sizeW',
        'size_h',
        'sizeH',
        'micron_size',
        'micronSize',
        'certificate_file',
        'certificateFile',
        'status',
        'created_by',
        'createdBy',
        'approved_by',
        'approvedBy',
        'approved_at',
        'approvedAt',
        'client_id',
        'clientId',
        'is_active',
        'isActive',
        'created_at',
        'createdAt',
        'updated_at',
        'updatedAt',
        'reportType',
      ]);

      const extraKeys = Object.keys(log).filter((k) => !known.has(k)).sort();
      if (extraKeys.length > 0) {
        detailsHTML += '<h2>Additional Fields</h2>';
        for (const k of extraKeys) {
          const v = (log as any)[k];
          detailsHTML += renderRow(k, typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }

      return detailsHTML;
    }

    let detailsHTML = '<h2>Log Details</h2>';
    
    if (log.equipmentType === 'chiller') {
      detailsHTML += `
        <div class="info"><span class="label">Evap Entering Temp:</span><span class="value">${log.evapEnteringWaterTemp !== undefined ? log.evapEnteringWaterTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Evap Leaving Temp:</span><span class="value">${log.evapLeavingWaterTemp !== undefined ? log.evapLeavingWaterTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Cond Entering Temp:</span><span class="value">${log.condEnteringWaterTemp !== undefined ? log.condEnteringWaterTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Cond Leaving Temp:</span><span class="value">${log.condLeavingWaterTemp !== undefined ? log.condLeavingWaterTemp + '°C' : 'N/A'}</span></div>
      `;
    } else if (log.equipmentType === 'boiler') {
      detailsHTML += `
        <div class="info"><span class="label">Feed Water Temp:</span><span class="value">${log.feedWaterTemp !== undefined ? log.feedWaterTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Oil Temp:</span><span class="value">${log.oilTemp !== undefined ? log.oilTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Steam Temp:</span><span class="value">${log.steamTemp !== undefined ? log.steamTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Steam Pressure:</span><span class="value">${log.steamPressure !== undefined ? log.steamPressure + ' bar' : 'N/A'}</span></div>
        <div class="info"><span class="label">Steam Flow LPH:</span><span class="value">${log.steamFlowLPH !== undefined ? log.steamFlowLPH + ' LPH' : 'N/A'}</span></div>
      `;
    } else if (log.equipmentType === 'compressor') {
      detailsHTML += `
        <div class="info"><span class="label">Compressor Supply Temp:</span><span class="value">${log.compressorSupplyTemp !== undefined ? log.compressorSupplyTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Compressor Return Temp:</span><span class="value">${log.compressorReturnTemp !== undefined ? log.compressorReturnTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Compressor Pressure:</span><span class="value">${log.compressorPressure !== undefined ? log.compressorPressure + ' bar' : 'N/A'}</span></div>
        <div class="info"><span class="label">Compressor Flow:</span><span class="value">${log.compressorFlow !== undefined ? log.compressorFlow + ' L/min' : 'N/A'}</span></div>
      `;
    } else if (log.equipmentType === 'chemical') {
      detailsHTML += `
        <div class="info"><span class="label">Equipment Name:</span><span class="value">${log.equipmentName || 'N/A'}</span></div>
        <div class="info"><span class="label">Chemical Name:</span><span class="value">${log.chemicalName || 'N/A'}</span></div>
        <div class="info"><span class="label">Chemical %:</span><span class="value">${log.chemicalPercent !== undefined ? log.chemicalPercent + '%' : 'N/A'}</span></div>
        <div class="info"><span class="label">Solution Concentration %:</span><span class="value">${log.solutionConcentration !== undefined ? log.solutionConcentration + '%' : 'N/A'}</span></div>
        <div class="info"><span class="label">Water Qty:</span><span class="value">${log.waterQty !== undefined ? log.waterQty + ' L' : 'N/A'}</span></div>
        <div class="info"><span class="label">Chemical Qty:</span><span class="value">${log.chemicalQty !== undefined ? log.chemicalQty + ' G' : 'N/A'}</span></div>
      `;
    } else if (log.equipmentType === 'filter') {
      const fd = (val: string | null | undefined) => (val ? format(new Date(val), 'dd/MM/yyyy') : 'N/A');
      const ft = (val: string | null | undefined) => (val ? format(new Date('1970-01-01T' + val), 'HH:mm') : 'N/A');
      const v = (val: string | null | undefined) => (val != null && val !== '' ? String(val) : 'N/A');
      detailsHTML += `
        <div class="info"><span class="label">Equipment ID:</span><span class="value">${v(log.equipment_id ?? log.equipmentId)}</span></div>
        <div class="info"><span class="label">Category:</span><span class="value">${v(log.category)}</span></div>
        <div class="info"><span class="label">Filter No:</span><span class="value">${v(log.filter_no ?? log.filterNo)}</span></div>
        <div class="info"><span class="label">Filter Micron:</span><span class="value">${v(log.filter_micron ?? log.filterMicron)}</span></div>
        <div class="info"><span class="label">Filter Size:</span><span class="value">${v(log.filter_size ?? log.filterSize)}</span></div>
        <div class="info"><span class="label">Tag Info:</span><span class="value">${v(log.tag_info ?? log.tagInfo)}</span></div>
        <div class="info"><span class="label">Activity Type:</span><span class="value">${v(log.activity_type ?? log.activityType)}</span></div>
        <div class="info"><span class="label">Activity From Date:</span><span class="value">${fd(log.activity_from_date ?? log.activityFromDate)}</span></div>
        <div class="info"><span class="label">Activity To Date:</span><span class="value">${fd(log.activity_to_date ?? log.activityToDate)}</span></div>
        <div class="info"><span class="label">Activity From Time:</span><span class="value">${ft(log.activity_from_time ?? log.activityFromTime)}</span></div>
        <div class="info"><span class="label">Activity To Time:</span><span class="value">${ft(log.activity_to_time ?? log.activityToTime)}</span></div>
        <div class="info"><span class="label">Installed Date:</span><span class="value">${fd(log.installed_date ?? log.installedDate)}</span></div>
        <div class="info"><span class="label">Integrity Done Date:</span><span class="value">${fd(log.integrity_done_date ?? log.integrityDoneDate)}</span></div>
        <div class="info"><span class="label">Integrity Due Date:</span><span class="value">${fd(log.integrity_due_date ?? log.integrityDueDate)}</span></div>
        <div class="info"><span class="label">Cleaning Done Date:</span><span class="value">${fd(log.cleaning_done_date ?? log.cleaningDoneDate)}</span></div>
        <div class="info"><span class="label">Cleaning Due Date:</span><span class="value">${fd(log.cleaning_due_date ?? log.cleaningDueDate)}</span></div>
        <div class="info"><span class="label">Replacement Due Date:</span><span class="value">${fd(log.replacement_due_date ?? log.replacementDueDate)}</span></div>
        <div class="info"><span class="label">Remarks:</span><span class="value">${v(log.remarks)}</span></div>
        <div class="info"><span class="label">Operator Name:</span><span class="value">${v(log.operator_name ?? log.operatorName)}</span></div>
        <div class="info"><span class="label">Timestamp:</span><span class="value">${log.timestamp ? format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm') : 'N/A'}</span></div>
      `;
    }
    
    return detailsHTML;
  };

  const handlePrint = async (report: Report) => {
    // Fetch full data from original source (or minimal info for utility reports)
    const log = await fetchFullReportData(report);
    if (!log) {
      toast.error(
        report.type === 'utility'
          ? 'Failed to determine report equipment type for printing.'
          : 'Original report data was deleted or not found; cannot print this report.'
      );
      return;
    }
    
    // For test certificates, generate PDF and open print dialog directly
    if (report.type === 'air_velocity' && log) {
      try {
        const blob = await generateAirVelocityPDF(log);
        const success = printPDF(blob);
        if (success) {
          toast.success('Opening print dialog...');
        } else {
          toast.error('Please allow popups to print PDFs');
        }
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'filter_integrity' && log) {
      try {
        const blob = await generateFilterIntegrityPDF(log);
        const success = printPDF(blob);
        if (success) {
          toast.success('Opening print dialog...');
        } else {
          toast.error('Please allow popups to print PDFs');
        }
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'recovery' && log) {
      try {
        const blob = await generateRecoveryTestPDF(log);
        const success = printPDF(blob);
        if (success) {
          toast.success('Opening print dialog...');
        } else {
          toast.error('Please allow popups to print PDFs');
        }
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'differential_pressure' && log) {
      try {
        const blob = await generateDifferentialPressurePDF(log);
        const success = printPDF(blob);
        if (success) {
          toast.success('Opening print dialog...');
        } else {
          toast.error('Please allow popups to print PDFs');
        }
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    if (report.type === 'nvpc' && log) {
      try {
        const blob = await generateNVPCPDF(log);
        const success = printPDF(blob);
        if (success) {
          toast.success('Opening print dialog...');
        } else {
          toast.error('Please allow popups to print PDFs');
        }
        return;
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    // For utility reports (and legacy chemical report rows), generate PDF with equipment-wise logs
    if ((report.type === 'utility' || report.type === 'chemical') && log) {
      try {
        // Fetch all logs of the same equipment type from API
        let allLogs: any[] = [];
        
        if (log.equipmentType === 'chiller') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const chillerLogs = await chillerLogAPI.list();
          allLogs = chillerLogs
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId)
            )
            .map(mapChillerLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const chillerPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateChillerMonitoringPDF(chillerPdfData);
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        } else if (log.equipmentType === 'boiler') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const boilerLogs = await boilerLogAPI.list();
          allLogs = boilerLogs
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId)
            )
            .map(mapBoilerLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const boilerPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateBoilerMonitoringPDF(boilerPdfData);
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        } else if (log.equipmentType === 'chemical') {
          const targetEquipmentName = (log.equipment_name ?? log.equipmentName ?? report.site ?? '').toString();
          const chemicalPreps = await chemicalPrepAPI.list();
          allLogs = chemicalPreps
            .filter(
              (l: any) =>
                isApprovedReportRow(l) &&
                (!targetEquipmentName || String(l.equipment_name ?? '') === targetEquipmentName)
            )
            .map(mapChemicalLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const chemicalPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateChemicalMonitoringPDF(chemicalPdfData);
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        } else if (log.equipmentType === 'filter') {
          const targetEquipmentId = (log.equipment_id ?? log.equipmentId ?? report.site ?? '').toString();
          const targetFilterNo = (log.filter_no ?? log.filterNo ?? '').toString();
          const filterLogs = await filterLogAPI.list();
          allLogs = filterLogs
            .filter((l: any) => {
              if (!isApprovedReportRow(l)) return false;
              const matchEquipment = !targetEquipmentId || String(l.equipment_id ?? '') === targetEquipmentId;
              const matchFilter = !targetFilterNo || String(l.filter_no ?? '') === targetFilterNo;
              return matchEquipment && matchFilter;
            })
            .map(mapFilterLogForMonitoringPdf);
          if (allLogs.length === 0) {
            toast.error('No logs found for this equipment');
            return;
          }
          const filterPdfData: MonitoringPDFData = { logs: allLogs, approvedBy: report.approvedBy, printedBy: user?.name || user?.email || '' };
          const blob = await generateFilterMonitoringPDF(filterPdfData);
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        }
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
        return;
      }
    }
    
    // For other report types, use the existing print window approach
    const reportData = {
      title: report.title,
      type: typeLabels[report.type],
      site: report.site,
      createdBy: report.createdBy,
      createdAt: format(report.createdAt, 'PPpp'),
      status: report.status,
      remarks: report.remarks || 'No remarks',
      approvedBy: report.approvedBy,
      approvedAt: report.approvedAt ? format(report.approvedAt, 'PPpp') : null,
      log: log, // Include original log data
    };

    // Create a new window with the report content
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${report.title} - Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .info { margin: 15px 0; }
              .label { font-weight: bold; color: #666; }
              .value { margin-left: 10px; }
              .status { display: inline-block; padding: 5px 10px; border-radius: 4px; margin: 5px 0; }
              .approved { background-color: #d4edda; color: #155724; }
              .pending { background-color: #fff3cd; color: #856404; }
              .rejected { background-color: #f8d7da; color: #721c24; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>${reportData.title}</h1>
            <div class="info"><span class="label">Type:</span><span class="value">${reportData.type}</span></div>
            <div class="info"><span class="label">Site:</span><span class="value">${reportData.site}</span></div>
            <div class="info"><span class="label">Created By:</span><span class="value">${reportData.createdBy}</span></div>
            <div class="info"><span class="label">Created At:</span><span class="value">${reportData.createdAt}</span></div>
            <div class="info"><span class="label">Status:</span><span class="value"><span class="status ${reportData.status}">${reportData.status}</span></span></div>
            ${reportData.approvedBy ? `<div class="info"><span class="label">Approved By:</span><span class="value">${reportData.approvedBy}</span></div>` : ''}
            ${reportData.approvedAt ? `<div class="info"><span class="label">Approved At:</span><span class="value">${reportData.approvedAt}</span></div>` : ''}
            <div class="info"><span class="label">Remarks:</span><span class="value">${reportData.remarks}</span></div>
            ${log ? generateLogDetailsHTML(log, report.type) : ''}
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print reports');
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Reports"
        subtitle="View and export reports"
      />

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          <Button
            variant={activeTab === 'approved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('approved')}
          >
            Approved Reports
          </Button>
          {canSeeUserReports && (
            <Button
              variant={activeTab === 'user-management' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('user-management')}
            >
              User Management
            </Button>
          )}
          {canSeeActivity && (
            <Button
              variant={activeTab === 'user-activity' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('user-activity')}
            >
              User Activity
            </Button>
          )}
          {canSeeAudit && (
            <Button
              variant={activeTab === 'audit-trail' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('audit-trail')}
            >
              Audit Trail
            </Button>
          )}
        </div>

        {activeTab === 'approved' && (isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading reports...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="metric-card">
                <p className="data-label">Total Approved Reports</p>
                <p className="reading-display text-2xl text-success">
                  {reports.filter(r => r.status === 'approved').length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">Chiller</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && r.type === 'utility' && r.originalData?.sourceTable === 'chiller_logs').length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">Boiler</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && r.type === 'utility' && r.originalData?.sourceTable === 'boiler_logs').length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">Chemical</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && (r.type === 'chemical' || (r.type === 'utility' && r.originalData?.sourceTable === 'chemical_preparations'))).length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">Filter</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && r.type === 'utility' && r.originalData?.sourceTable === 'filter_logs').length}
                </p>
              </div>
            </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Dialog open={reportFilterOpen} onOpenChange={setReportFilterOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="w-4 h-4 mr-2" />
                Filter
                {activeReportFilterCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                    {activeReportFilterCount}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filter Reports
                </DialogTitle>
                <DialogDescription>
                  Filter by date range, time range, equipment ID, and created by.
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
                        value={reportFilters.fromDate}
                        onChange={(e) =>
                          setReportFilters((prev) => ({ ...prev, fromDate: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>To Date</Label>
                      <Input
                        type="date"
                        value={reportFilters.toDate}
                        onChange={(e) =>
                          setReportFilters((prev) => ({ ...prev, toDate: e.target.value }))
                        }
                        min={reportFilters.fromDate}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Time Range (Optional)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>From Time</Label>
                      <Input
                        type="time"
                        value={reportFilters.fromTime}
                        onChange={(e) =>
                          setReportFilters((prev) => ({ ...prev, fromTime: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>To Time</Label>
                      <Input
                        type="time"
                        value={reportFilters.toTime}
                        onChange={(e) =>
                          setReportFilters((prev) => ({ ...prev, toTime: e.target.value }))
                        }
                        min={reportFilters.fromTime}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Equipment ID</Label>
                  <Select
                    value={reportFilters.equipmentId || 'all'}
                    onValueChange={(v) =>
                      setReportFilters((prev) => ({
                        ...prev,
                        equipmentId: v === 'all' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {equipmentOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Created By</Label>
                  <Select
                    value={reportFilters.createdBy || 'all'}
                    onValueChange={(v) =>
                      setReportFilters((prev) => ({
                        ...prev,
                        createdBy: v === 'all' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {reportCreatedByOptions.map((email) => (
                        <SelectItem key={email} value={email}>
                          {email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReportFilters({
                      fromDate: '',
                      toDate: '',
                      fromTime: '',
                      toTime: '',
                      equipmentId: '',
                      createdBy: '',
                    });
                    setReportFilterOpen(false);
                    toast.success('Filters cleared');
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
                <Button type="button" variant="outline" onClick={() => setReportFilterOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => {
                    setReportFilterOpen(false);
                    toast.success(
                      activeReportFilterCount > 0
                        ? `Showing ${filteredReports.length} report(s)`
                        : 'Filters applied'
                    );
                  }}
                >
                  Apply Filters
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="utility">E Log Book</SelectItem>
                <SelectItem value="chemical">Chemical Prep</SelectItem>
                <SelectItem value="validation">Validations</SelectItem>
                <SelectItem value="air_velocity">Air Velocity Test</SelectItem>
                <SelectItem value="filter_integrity">Filter Integrity Test</SelectItem>
                <SelectItem value="recovery">Recovery Test</SelectItem>
                <SelectItem value="differential_pressure">Differential Pressure Test</SelectItem>
                <SelectItem value="nvpc">NVPC Test</SelectItem>
              </SelectContent>
            </Select>

            {/* Status filter removed - only approved reports are shown */}
          </div>
        </div>

        {/* Reports Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Report</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Site</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedReports.includes(report.id)}
                        onCheckedChange={() => handleReportToggle(report.id)}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{report.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{report.id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="accent">{typeLabels[report.type]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{report.site}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{report.createdBy}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {format(report.createdAt, 'dd/MM/yy HH:mm')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={
                        report.status === 'approved' ? 'success' : 
                        report.status === 'rejected' ? 'danger' : 'pending'
                      }>
                        {report.status === 'approved' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {report.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                        {report.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {report.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleView(report)}
                          title="View Report"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleExport(report)}
                          title="Export Report"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handlePrint(report)}
                          title="Print Report"
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* View Report Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Report Details
              </DialogTitle>
              <DialogDescription>
                Summary of the approved report information. Use Export or Print to generate a PDF.
              </DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Report Title</Label>
                    <p className="text-sm font-medium">{selectedReport.title}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <div className="text-sm">
                        <Badge variant="accent">{typeLabels[selectedReport.type]}</Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <div className="text-sm">
                        <Badge
                          variant={
                            selectedReport.status === 'approved'
                              ? 'success'
                              : selectedReport.status === 'rejected'
                              ? 'danger'
                              : 'pending'
                          }
                        >
                          {selectedReport.status === 'approved' && (
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                          )}
                          {selectedReport.status === 'rejected' && (
                            <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {selectedReport.status === 'pending' && (
                            <Clock className="w-3 h-3 mr-1" />
                          )}
                          {selectedReport.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Site</Label>
                      <p className="text-sm">{selectedReport.site}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created By</Label>
                      <p className="text-sm">{selectedReport.createdBy}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created At</Label>
                      <p className="text-sm flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(selectedReport.createdAt, 'PPpp')}
                      </p>
                    </div>
                    {selectedReport.approvedBy && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Approved By</Label>
                        <p className="text-sm">{selectedReport.approvedBy}</p>
                      </div>
                    )}
                    {selectedReport.approvedAt && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Approved At</Label>
                        <p className="text-sm flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(selectedReport.approvedAt, 'PPpp')}
                        </p>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const data = selectedReport.originalData;
                    const operatorRemarks =
                      typeof data?.remarks === 'string' ? data.remarks.trim() : '';
                    const operatorComment =
                      typeof data?.comment === 'string' ? data.comment.trim() : '';
                    const approvalRemarks = (selectedReport.remarks || '').trim();

                    // Prefer showing operator-entered fields from the original record.
                    // The Report row "remarks" is approver remarks; show it separately to avoid confusion.
                    const showOperatorRemarks = !!operatorRemarks;
                    const showOperatorComment = !!operatorComment;
                    const showApprovalRemarks =
                      !!approvalRemarks &&
                      approvalRemarks !== operatorRemarks &&
                      approvalRemarks !== operatorComment;

                    if (!showOperatorRemarks && !showOperatorComment && !showApprovalRemarks) return null;

                    return (
                      <div className="space-y-3">
                        {showOperatorRemarks && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Remarks</Label>
                            <p className="text-sm mt-1 whitespace-pre-wrap">{operatorRemarks}</p>
                          </div>
                        )}
                        {showOperatorComment && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Comment</Label>
                            <p className="text-sm mt-1 whitespace-pre-wrap">{operatorComment}</p>
                          </div>
                        )}
                        {showApprovalRemarks && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Approval remarks</Label>
                            <p className="text-sm mt-1 whitespace-pre-wrap">{approvalRemarks}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Close
                  </Button>
                  {selectedReport.status === 'approved' && (
                    <>
                      <Button variant="outline" onClick={() => handleExport(selectedReport)}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                      <Button variant="outline" onClick={() => handlePrint(selectedReport)}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Approval Dialog */}
        <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Review Report</DialogTitle>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold">{selectedReport.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    Created by {selectedReport.createdBy} on {format(selectedReport.createdAt, 'PPpp')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Remarks / Notes</Label>
                  <Textarea
                    value={approvalRemarks}
                    onChange={(e) => setApprovalRemarks(e.target.value)}
                    placeholder="Add remarks (required for rejection)..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsApprovalDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleReject}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button variant="success" onClick={handleApprove}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
          </>
        ))}

        {activeTab === 'user-management' && canSeeUserReports && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Role</Label>
                <Select
                  value={userReportRoleFilter}
                  onValueChange={(value) => {
                    setUserReportRoleFilter(value);
                    const roleParam = value === 'all' ? undefined : value;
                    const activeParam =
                      userReportActiveFilter === 'all' ? undefined : userReportActiveFilter;
                    const activityDateParam = userReportActivityDate || undefined;
                    loadUserReports({
                      role: roleParam,
                      is_active: activeParam,
                      activity_date: activityDateParam,
                    });
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="manager">Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label>Status</Label>
                <Select
                  value={userReportActiveFilter}
                  onValueChange={(value) => {
                    setUserReportActiveFilter(value);
                    const roleParam =
                      userReportRoleFilter === 'all' ? undefined : userReportRoleFilter;
                    const activeParam = value === 'all' ? undefined : value;
                    const activityDateParam = userReportActivityDate || undefined;
                    loadUserReports({
                      role: roleParam,
                      is_active: activeParam,
                      activity_date: activityDateParam,
                    });
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label>Activity date</Label>
                <Input
                  type="date"
                  value={userReportActivityDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setUserReportActivityDate(value);
                    const roleParam =
                      userReportRoleFilter === 'all' ? undefined : userReportRoleFilter;
                    const activeParam =
                      userReportActiveFilter === 'all' ? undefined : userReportActiveFilter;
                    const activityDateParam = value || undefined;
                    loadUserReports({
                      role: roleParam,
                      is_active: activeParam,
                      activity_date: activityDateParam,
                    });
                  }}
                  className="w-[180px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rowsHtml = filteredUserReports
                    .map(
                      (u) => `
                        <tr>
                          <td>${u.email}</td>
                          <td>${u.role_display}</td>
                          <td>${u.is_active ? 'Active' : 'Inactive'}</td>
                          <td>${u.created_at ? format(new Date(u.created_at), 'dd/MM/yy HH:mm') : ''}</td>
                          <td>${
                            u.first_login
                              ? format(new Date(u.first_login), 'dd/MM/yy HH:mm')
                              : ''
                          }</td>
                          <td>${
                            u.last_logout
                              ? format(new Date(u.last_logout), 'dd/MM/yy HH:mm')
                              : ''
                          }</td>
                        </tr>
                      `,
                    )
                    .join('');

                  const html = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>User Management Report</title>
                        <style>
                          body {
                            font-family: Arial, sans-serif;
                            margin: 0;
                            padding: 16px;
                            font-size: 12px;
                          }
                          h1 {
                            margin: 0 0 12px 0;
                            font-size: 18px;
                            text-align: left;
                          }
                          table {
                            width: 100%;
                            border-collapse: collapse;
                          }
                          th, td {
                            border: 1px solid #ccc;
                            padding: 6px 8px;
                            font-size: 11px;
                          }
                          th {
                            background: #f5f5f5;
                          }
                        </style>
                      </head>
                      <body>
                        <h1>User Management Report</h1>
                        <table>
                          <thead>
                            <tr>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Status</th>
                              <th>Date Joined</th>
                              <th>First Login</th>
                              <th>Last Logout</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${rowsHtml}
                          </tbody>
                        </table>
                      </body>
                    </html>
                  `;

                  try {
                    const blob = new Blob([html], { type: 'text/html' });
                    const success = printPDF(blob);
                    if (!success) {
                      toast.error('Please allow popups to print reports');
                    }
                  } catch (error) {
                    console.error('Error preparing User Management printout:', error);
                    toast.error('Failed to open print dialog for User Management report');
                  }
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                PDF / Print
              </Button>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {userReportsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Loading user management report...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Date Joined
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          First Login
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Last Logout
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUserReports.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-sm">{u.email}</td>
                          <td className="px-4 py-3 text-sm">{u.role_display}</td>
                          <td className="px-4 py-3 text-sm">
                            <Badge variant={u.is_active ? 'success' : 'outline'}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {u.created_at
                              ? format(new Date(u.created_at), 'dd/MM/yy HH:mm')
                              : ''}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {u.first_login
                              ? format(new Date(u.first_login), 'dd/MM/yy HH:mm')
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {u.last_logout
                              ? format(new Date(u.last_logout), 'dd/MM/yy HH:mm')
                              : '-'}
                          </td>
                        </tr>
                      ))}
                      {filteredUserReports.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-sm text-muted-foreground"
                          >
                            No users found for selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'user-activity' && canSeeActivity && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>From date</Label>
                <Input
                  type="date"
                  value={activityFromDate}
                  onChange={(e) => setActivityFromDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>To date</Label>
                <Input
                  type="date"
                  value={activityToDate}
                  onChange={(e) => setActivityToDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Event type</Label>
                <Select
                  value={activityEventType}
                  onValueChange={(value) => setActivityEventType(value)}
                >
                  <SelectTrigger className="w-[180px] mt-1">
                    <SelectValue placeholder="Event type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                    <SelectItem value="manual_login">Manual Login</SelectItem>
                    <SelectItem value="manual_logout">Manual Logout</SelectItem>
                    <SelectItem value="auto_logout">Auto Logout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params: any = {};
                  if (activityFromDate) params.from_date = activityFromDate;
                  if (activityToDate) params.to_date = activityToDate;
                  if (activityEventType !== 'all') params.event_type = activityEventType;
                  loadUserActivity(params);
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Apply Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rowsHtml = activityRows
                    .map(
                      (row) => `
                        <tr>
                          <td>${row.created_at ? format(new Date(row.created_at), 'dd/MM/yy HH:mm') : ''}</td>
                          <td>${row.user_email}</td>
                          <td>${row.event_type}</td>
                          <td>${row.ip_address || ''}</td>
                          <td>${row.user_agent || ''}</td>
                        </tr>
                      `,
                    )
                    .join('');

                  const html = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>User Activity Report</title>
                        <style>
                          body {
                            font-family: Arial, sans-serif;
                            margin: 0;
                            padding: 20px;
                            font-size: 13px;
                            line-height: 1.4;
                          }
                          h1 {
                            margin: 0 0 16px 0;
                            font-size: 20px;
                            text-align: left;
                          }
                          table {
                            width: 100%;
                            border-collapse: collapse;
                          }
                          th, td {
                            border: 1px solid #ccc;
                            padding: 8px 10px;
                            font-size: 12px;
                          }
                          th {
                            background: #f5f5f5;
                          }
                        </style>
                      </head>
                      <body>
                        <h1>User Activity Report</h1>
                        <table>
                          <thead>
                            <tr>
                              <th>Date/Time</th>
                              <th>User Email</th>
                              <th>Event</th>
                              <th>IP Address</th>
                              <th>User Agent</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${rowsHtml}
                          </tbody>
                        </table>
                      </body>
                    </html>
                  `;

                  try {
                    const blob = new Blob([html], { type: 'text/html' });
                    const success = printPDF(blob);
                    if (!success) {
                      toast.error('Please allow popups to print reports');
                    }
                  } catch (error) {
                    console.error('Error preparing User Activity printout:', error);
                    toast.error('Failed to open print dialog for User Activity report');
                  }
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                PDF / Print
              </Button>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {activityLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Loading user activity report...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Date/Time
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          User Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Event
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          IP Address
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          User Agent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activityRows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-sm">
                            {row.created_at
                              ? format(new Date(row.created_at), 'dd/MM/yy HH:mm')
                              : ''}
                          </td>
                          <td className="px-4 py-3 text-sm">{row.user_email}</td>
                          <td className="px-4 py-3 text-sm">
                            {auditEventLabels[row.event_type] ?? row.event_type}
                          </td>
                          <td className="px-4 py-3 text-sm">{row.ip_address}</td>
                          <td className="px-4 py-3 text-sm truncate max-w-xs">
                            {row.user_agent}
                          </td>
                        </tr>
                      ))}
                      {activityRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-sm text-muted-foreground"
                          >
                            No activity found for selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audit-trail' && canSeeAudit && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>From date</Label>
                <Input
                  type="date"
                  value={auditFromDate}
                  onChange={(e) => setAuditFromDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>To date</Label>
                <Input
                  type="date"
                  value={auditToDate}
                  onChange={(e) => setAuditToDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Event type</Label>
                <Select
                  value={auditEventType}
                  onValueChange={(value) => setAuditEventType(value)}
                >
                  <SelectTrigger className="w-[180px] mt-1">
                    <SelectValue placeholder="Event type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="limit_update">Limit Update</SelectItem>
                    <SelectItem value="config_update">Config Update</SelectItem>
                    <SelectItem value="log_update">Log Update</SelectItem>
                    <SelectItem value="log_correction">Log Correction</SelectItem>
                    <SelectItem value="log_created">Log Created</SelectItem>
                    <SelectItem value="log_deleted">Log Deleted</SelectItem>
                    <SelectItem value="entity_created">Entity Created</SelectItem>
                    <SelectItem value="entity_updated">Entity Updated</SelectItem>
                    <SelectItem value="entity_deleted">Entity Deleted</SelectItem>
                    <SelectItem value="entity_approved">Entity Approved</SelectItem>
                    <SelectItem value="entity_rejected">Entity Rejected</SelectItem>
                    <SelectItem value="consumption_updated">Consumption Updated</SelectItem>
                    <SelectItem value="user_created">User created</SelectItem>
                    <SelectItem value="password_changed">Password changed</SelectItem>
                    <SelectItem value="user_locked">User locked</SelectItem>
                    <SelectItem value="user_unlocked">User unlocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Object type</Label>
                <Input
                  value={auditObjectType === 'all' ? '' : auditObjectType}
                  onChange={(e) =>
                    setAuditObjectType(e.target.value ? e.target.value : 'all')
                  }
                  placeholder="e.g. user, chiller_log"
                  className="mt-1 w-[180px]"
                />
              </div>
              <div>
                <Label>Object ID</Label>
                <Input
                  value={auditObjectId}
                  onChange={(e) => setAuditObjectId(e.target.value)}
                  placeholder="e.g. log entry ID"
                  className="mt-1 w-[180px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params: any = {};
                  if (auditFromDate) params.from_date = auditFromDate;
                  if (auditToDate) params.to_date = auditToDate;
                  if (auditEventType !== 'all') params.event_type = auditEventType;
                  if (auditObjectType !== 'all' && auditObjectType.trim()) {
                    params.object_type = auditObjectType.trim();
                  }
                  if (auditObjectId.trim()) params.object_id = auditObjectId.trim();
                  loadAuditEvents(params);
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Apply Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rowsHtml = auditRows
                    .map(
                      (row) => `
                        <tr>
                          <td>${row.timestamp ? format(new Date(row.timestamp), 'dd/MM/yy HH:mm') : ''}</td>
                          <td>${row.user_email || row.target_user_email || ''}</td>
                          <td>${auditEventLabels[row.event_type] ?? row.event_type}</td>
                          <td>${row.object_type}</td>
                          <td>${row.object_id || ''}</td>
                          <td>${row.field_name}</td>
                          <td>${row.old_value || ''}</td>
                          <td>${row.new_value || ''}</td>
                        </tr>
                      `,
                    )
                    .join('');

                  const html = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Audit Trail Report</title>
                        <style>
                          body { font-family: Arial, sans-serif; padding: 20px; }
                          h1 { margin-bottom: 16px; }
                          table { width: 100%; border-collapse: collapse; }
                          th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; }
                          th { background: #f5f5f5; }
                        </style>
                      </head>
                      <body>
                        <h1>Audit Trail Report</h1>
                        <table>
                          <thead>
                            <tr>
                              <th>Date/Time</th>
                              <th>User Email</th>
                              <th>Event</th>
                              <th>Object Type</th>
                              <th>Object ID</th>
                              <th>Field</th>
                              <th>Old Value</th>
                              <th>New Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${rowsHtml}
                          </tbody>
                        </table>
                      </body>
                    </html>`;

                  const iframe = document.createElement('iframe');
                  iframe.style.position = 'fixed';
                  iframe.style.right = '0';
                  iframe.style.bottom = '0';
                  iframe.style.width = '0';
                  iframe.style.height = '0';
                  iframe.style.border = 'none';
                  iframe.style.opacity = '0';
                  iframe.style.pointerEvents = 'none';
                  iframe.style.visibility = 'hidden';
                  iframe.style.zIndex = '-1';
                  document.body.appendChild(iframe);

                  const doc = iframe.contentDocument;
                  if (!doc) {
                    document.body.removeChild(iframe);
                    toast.error('Print failed');
                    return;
                  }
                  doc.open();
                  doc.write(html);
                  doc.close();

                  const triggerPrint = () => {
                    try {
                      if (iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                        toast.success('Opening print dialog...');
                      }
                    } catch (e) {
                      console.error('Error triggering print:', e);
                      toast.error('Print failed');
                    }
                    setTimeout(() => {
                      if (iframe.parentNode) document.body.removeChild(iframe);
                    }, 500);
                  };

                  if (iframe.contentWindow?.document.readyState === 'complete') {
                    triggerPrint();
                  } else {
                    iframe.onload = triggerPrint;
                  }
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                PDF / Print
              </Button>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {auditLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Loading audit trail report...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Date/Time
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          User Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Event
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Object Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Object ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Field
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Old Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          New Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {auditRows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-sm">
                            {row.timestamp
                              ? format(new Date(row.timestamp), 'dd/MM/yy HH:mm')
                              : ''}
                          </td>
                          <td className="px-4 py-3 text-sm">{row.user_email ?? row.target_user_email ?? '—'}</td>
                          <td className="px-4 py-3 text-sm">{auditEventLabels[row.event_type] ?? row.event_type}</td>
                          <td className="px-4 py-3 text-sm">{row.object_type}</td>
                          <td className="px-4 py-3 text-sm">{row.object_id}</td>
                          <td className="px-4 py-3 text-sm">{row.field_name}</td>
                          <td className="px-4 py-3 text-sm">{row.old_value}</td>
                          <td className="px-4 py-3 text-sm">{row.new_value}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAuditView(row)}
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAuditDownload(row)}
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAuditPrint(row)}
                                title="Print"
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {auditRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-6 text-center text-sm text-muted-foreground"
                          >
                            No audit events found for selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Audit Event View Dialog */}
            <Dialog open={!!auditViewRow} onOpenChange={(open) => !open && setAuditViewRow(null)}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Audit Event Details
                  </DialogTitle>
                </DialogHeader>
                {auditViewRow && (
                  <div className="space-y-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Date/Time</Label>
                      <p className="font-medium">
                        {auditViewRow.timestamp
                          ? format(new Date(auditViewRow.timestamp), 'PPpp')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">User Email</Label>
                      <p className="font-medium">{auditViewRow.user_email ?? auditViewRow.target_user_email ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Event</Label>
                      <p className="font-medium">{auditEventLabels[auditViewRow.event_type] ?? auditViewRow.event_type}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Object Type</Label>
                      <p className="font-medium">{auditViewRow.object_type}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Object ID</Label>
                      <p className="font-medium break-all">{auditViewRow.object_id ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Field</Label>
                      <p className="font-medium">{auditViewRow.field_name}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Old Value</Label>
                      <p className="font-medium break-all">{auditViewRow.old_value ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">New Value</Label>
                      <p className="font-medium break-all">{auditViewRow.new_value ?? '—'}</p>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
