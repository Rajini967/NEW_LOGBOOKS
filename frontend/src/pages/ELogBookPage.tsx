import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Thermometer, Gauge, Droplets, Zap, Package, Save, Clock, Trash2, Filter, X, CheckCircle, XCircle, Edit, History, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logbookAPI, chemicalPrepAPI, chillerLogAPI, boilerLogAPI, compressorLogAPI, chemicalMasterAPI, equipmentAPI, equipmentCategoryAPI, filterLogAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LogbookSchema } from '@/types/logbook-config';
import { FieldWithValidation } from '@/components/logbook/FieldWithValidation';
import { EntryIntervalBadge } from '@/components/logbook/EntryIntervalBadge';
import { MissedReadingPopup } from '@/components/logbook/MissedReadingPopup';
import { MaintenanceTimingsSection } from "@/components/logbook/MaintenanceTimingsSection";
import {
  getNextDueAndMissed,
  computeMissedByEquipment,
  type EquipmentMissInfo,
} from '@/lib/missed-reading';
import type { MaintenanceTimingsValue } from "@/types/maintenance-timings";

interface ELogBook {
  id: string;
  equipmentType: 'chiller' | 'boiler' | 'compressor' | 'chemical' | (string & {});
  equipmentId: string;
  schemaId?: string; // For custom logbooks
  customFields?: Record<string, any>; // For custom logbook field values
  date: string;
  time: string;
  // Chiller fields
  dailyWaterCt1Liters?: number | null;
  dailyWaterCt2Liters?: number | null;
  dailyWaterCt3Liters?: number | null;
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
  coolingTowerBlowdownTimeMin?: number;
  coolingTowerChemicalName?: string;
  coolingTowerChemicalQtyPerDay?: number;
  chilledWaterPumpChemicalName?: string;
  chilledWaterPumpChemicalQtyKg?: number;
  coolingTowerFanChemicalName?: string;
  coolingTowerFanChemicalQtyKg?: number;
  recordingFrequency?: string;
  operatorSign?: string;
  verifiedBy?: string;
  // Boiler fields
  feedWaterTemp?: number;
  oilTemp?: number;
  steamTemp?: number;
  steamPressure?: number;
  steamFlowLPH?: number;
  // Compressor fields (similar to chiller but different parameters)
  compressorSupplyTemp?: number;
  compressorReturnTemp?: number;
  compressorPressure?: number;
  compressorFlow?: number;
  // Chemical fields
  equipmentName?: string;
  chemicalName?: string;
  chemicalPercent?: number;
  solutionConcentration?: number;
  waterQty?: number;
  chemicalQty?: number;
  remarks: string;
  comment?: string;
  checkedBy: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval';
  /** User who approved or rejected (rejector for rejected / pending_secondary_approval entries) */
  operator_id?: string;
  approved_by_id?: string;
  corrects_id?: string;
  has_corrections?: boolean;
  tolerance_status?: 'none' | 'within' | 'outside';
}

type PumpStatus = 'ON' | 'OFF';

const encodePumpPair = (p1: PumpStatus, p2: PumpStatus) => `P1:${p1};P2:${p2}`;

const decodePumpPair = (
  value?: string | null,
): { p1: PumpStatus; p2: PumpStatus } | null => {
  if (!value) return null;
  const match = value.match(/P1:(ON|OFF);P2:(ON|OFF)/i);
  if (!match) return null;
  return {
    p1: match[1].toUpperCase() as PumpStatus,
    p2: match[2].toUpperCase() as PumpStatus,
  };
};

const encodeFanTriple = (f1: PumpStatus, f2: PumpStatus, f3: PumpStatus) =>
  `F1:${f1};F2:${f2};F3:${f3}`;

const decodeFanTriple = (
  value?: string | null,
): { f1: PumpStatus; f2: PumpStatus; f3: PumpStatus } | null => {
  if (!value) return null;
  const match = value.match(/F1:(ON|OFF);F2:(ON|OFF);F3:(ON|OFF)/i);
  if (!match) return null;
  return {
    f1: match[1].toUpperCase() as PumpStatus,
    f2: match[2].toUpperCase() as PumpStatus,
    f3: match[3].toUpperCase() as PumpStatus,
  };
};

// Equipment limits based on the example documents
const equipmentLimits = {
  chiller: {
    // Detailed evaporator limits (approximate, based on physical sheet)
    evapWaterInletPressure: { min: 2.5, unit: 'kg/cm²', type: 'NLT' },
    evapWaterOutletPressure: { min: 2.0, unit: 'kg/cm²', type: 'NLT' },
    evapEnteringWaterTemp: { max: 18, unit: '°C', type: 'NMT' },
    evapLeavingWaterTemp: { max: 13, unit: '°C', type: 'NMT' },
    evapApproachTemp: { max: 4, unit: '°C', type: 'NMT' },
    // Condenser limits (approximate)
    condWaterInletPressure: { min: 1.5, unit: 'kg/cm²', type: 'NLT' },
    condWaterOutletPressure: { min: 1.0, unit: 'kg/cm²', type: 'NLT' },
    condEnteringWaterTemp: { max: 35, unit: '°C', type: 'NMT' },
    condLeavingWaterTemp: { max: 40, unit: '°C', type: 'NMT' },
    condApproachTemp: { max: 6, unit: '°C', type: 'NMT' },
    // Compressor / electrical
    chillerControlSignal: { max: 100, unit: '%', type: 'NMT' },
    avgMotorCurrent: { max: 100, unit: 'A', type: 'NMT' },
    compressorRunningTimeMin: { max: 60 * 24, unit: 'min', type: 'NMT' },
    starterEnergyKwh: { max: 1000, unit: 'kWh', type: 'NMT' },
  },
  boiler: {
    feedWaterTemp: { min: 50, unit: '°C', type: 'NLT' },
    oilTemp: { min: 50, unit: '°C', type: 'NLT' },
    steamTemp: { min: 150, unit: '°C', type: 'NLT' },
    steamPressure: { min: 6, unit: 'bar', type: 'NLT' },
  },
  compressor: {
    compressorSupplyTemp: { max: 10, unit: '°C', type: 'NMT' },
    compressorReturnTemp: { max: 20, unit: '°C', type: 'NMT' },
    compressorPressure: { min: 5, unit: 'bar', type: 'NLT' },
  },
};

const CHILLER_LIST_FIELDS: { key: keyof ELogBook; label: string; unit: string }[] = [
  { key: 'evapWaterInletPressure', label: 'Evap Inlet P', unit: 'kg/cm²' },
  { key: 'evapWaterOutletPressure', label: 'Evap Outlet P', unit: 'kg/cm²' },
  { key: 'evapEnteringWaterTemp', label: 'Evap Enter T', unit: '°C' },
  { key: 'evapLeavingWaterTemp', label: 'Evap Leave T', unit: '°C' },
  { key: 'evapApproachTemp', label: 'Evap Approach', unit: '°C' },
  { key: 'condWaterInletPressure', label: 'Cond Inlet P', unit: 'kg/cm²' },
  { key: 'condWaterOutletPressure', label: 'Cond Outlet P', unit: 'kg/cm²' },
  { key: 'condEnteringWaterTemp', label: 'Cond Enter T', unit: '°C' },
  { key: 'condLeavingWaterTemp', label: 'Cond Leave T', unit: '°C' },
  { key: 'condApproachTemp', label: 'Cond Approach', unit: '°C' },
  { key: 'chillerControlSignal', label: 'Control', unit: '%' },
  { key: 'avgMotorCurrent', label: 'Motor Current', unit: 'A' },
  { key: 'compressorRunningTimeMin', label: 'Comp Run', unit: 'min' },
  { key: 'starterEnergyKwh', label: 'Energy', unit: 'kWh' },
  { key: 'coolingTowerBlowdownTimeMin', label: 'CT Blowdown', unit: 'min' },
  { key: 'coolingTowerChemicalQtyPerDay', label: 'CT Chemical', unit: 'Kg' },
  { key: 'chilledWaterPumpChemicalQtyKg', label: 'CHW Pump Chemical', unit: 'Kg' },
  { key: 'coolingTowerFanChemicalQtyKg', label: 'CT Fan Chemical', unit: 'Kg' },
];
const BOILER_LIST_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'feedWaterTemp', label: 'Feed Water', unit: '°C' },
  { key: 'oilTemp', label: 'Oil', unit: '°C' },
  { key: 'steamTemp', label: 'Steam', unit: '°C' },
  { key: 'steamPressure', label: 'Pressure', unit: 'bar' },
  { key: 'steamFlowLPH', label: 'Flow', unit: 'LPH' },
  { key: 'foHsdNgDayTankLevel', label: 'Day Tank', unit: 'Ltr' },
  { key: 'feedWaterTankLevel', label: 'Feed Tank', unit: 'KL' },
  { key: 'foPreHeaterTemp', label: 'Pre Heater', unit: '°C' },
  { key: 'burnerOilPressure', label: 'Burner Oil P', unit: 'kg/cm²' },
  { key: 'burnerHeaterTemp', label: 'Burner Heater', unit: '°C' },
  { key: 'boilerSteamPressure', label: 'Boiler Steam P', unit: 'kg/cm²' },
  { key: 'stackTemperature', label: 'Stack', unit: '°C' },
  { key: 'steamPressureAfterPrv', label: 'Steam After PRV', unit: 'kg/cm²' },
  { key: 'feedWaterHardnessPpm', label: 'Hardness', unit: 'PPM' },
  { key: 'feedWaterTdsPpm', label: 'TDS', unit: 'PPM' },
  { key: 'foHsdNgConsumption', label: 'Consumption', unit: 'Ltr' },
  { key: 'mobreyFunctioning', label: 'Mobrey', unit: '' },
  { key: 'manualBlowdownTime', label: 'Blowdown Time', unit: '' },
];
const COMPRESSOR_LIST_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'compressorSupplyTemp', label: 'Supply', unit: '°C' },
  { key: 'compressorReturnTemp', label: 'Return', unit: '°C' },
  { key: 'compressorPressure', label: 'Pressure', unit: 'bar' },
  { key: 'compressorFlow', label: 'Flow', unit: 'L/min' },
];

// Chemical equipment name options (plan: Equipment ID dropdown is for chiller/boiler/compressor/filter; chemical uses equipment_name, kept as static fallback)
const CHEMICAL_EQUIPMENT_NAMES = ['EN0001-MGF', 'EN0002-RO', 'EN0003-PW', 'EN0004-Other', 'EN0005-Other'];

interface EquipmentOption {
  id: string;
  equipment_number: string;
  name: string;
  log_entry_interval?: string | null;
  shift_duration_hours?: number | null;
}

export default function ELogBookPage() {
  // This page is now dedicated to the Chiller log book only.
  // Boiler and Chemical have their own independent pages.
  const equipmentType: 'chiller' = 'chiller';
  const { user, sessionSettings } = useAuth();
  const [logbookSchemas, setLogbookSchemas] = useState<LogbookSchema[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<LogbookSchema | null>(null);
  const [customFormData, setCustomFormData] = useState<Record<string, any>>({});
  const [logs, setLogs] = useState<ELogBook[]>([]);
  const [firstChillerLogByDay, setFirstChillerLogByDay] = useState<Record<string, ELogBook>>({});
  const [firstChillerLogByDate, setFirstChillerLogByDate] = useState<Record<string, ELogBook>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [chemicalOptions, setChemicalOptions] = useState<{ id: string; label: string }[]>([]);
  const [equipmentByType, setEquipmentByType] = useState<Record<'chiller' | 'boiler' | 'compressor', EquipmentOption[]>>({
    chiller: [],
    boiler: [],
    compressor: [],
  });
  const [maintenanceTimings, setMaintenanceTimings] = useState<MaintenanceTimingsValue>({
    activityType: "operation",
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
  });
  const [formData, setFormData] = useState({
    equipmentType: 'chiller' as 'chiller' | 'boiler' | 'compressor' | 'chemical',
    equipmentId: '',
    // Chiller fields
    dailyWaterCt1Liters: '',
    dailyWaterCt2Liters: '',
    dailyWaterCt3Liters: '',
    evapWaterInletPressure: '',
    evapWaterOutletPressure: '',
    evapEnteringWaterTemp: '',
    evapLeavingWaterTemp: '',
    evapApproachTemp: '',
    condWaterInletPressure: '',
    condWaterOutletPressure: '',
    condEnteringWaterTemp: '',
    condLeavingWaterTemp: '',
    condApproachTemp: '',
    chillerControlSignal: '',
    avgMotorCurrent: '',
    compressorRunningTimeMin: '',
    starterEnergyKwh: '',
    // Structured pump/fan status (per equipment)
    coolingTowerPump1: 'OFF' as PumpStatus,
    coolingTowerPump2: 'OFF' as PumpStatus,
    chilledWaterPump1: 'OFF' as PumpStatus,
    chilledWaterPump2: 'OFF' as PumpStatus,
    coolingTowerFan1: 'OFF' as PumpStatus,
    coolingTowerFan2: 'OFF' as PumpStatus,
    coolingTowerFan3: 'OFF' as PumpStatus,
    // Legacy aggregated strings sent to backend (for list views)
    coolingTowerPumpStatus: '',
    chilledWaterPumpStatus: '',
    coolingTowerFanStatus: '',
    coolingTowerBlowoffValveStatus: '',
    coolingTowerBlowdownTimeMin: '',
    coolingTowerChemicalName: '',
    coolingTowerChemicalQtyPerDay: '',
    chilledWaterPumpChemicalName: '',
    chilledWaterPumpChemicalQtyKg: '',
    coolingTowerFanChemicalName: '',
    coolingTowerFanChemicalQtyKg: '',
    recordingFrequency: '',
    operatorSign: '',
    verifiedBy: '',
    // Boiler fields
    feedWaterTemp: '',
    oilTemp: '',
    steamTemp: '',
    steamPressure: '',
    steamFlowLPH: '',
    // Compressor fields
    compressorSupplyTemp: '',
    compressorReturnTemp: '',
    compressorPressure: '',
    compressorFlow: '',
    // Chemical fields
    equipmentName: '',
    chemicalName: '',
    solutionConcentration: '',
    waterQty: '',
    chemicalQty: '',
    remarks: '',
    date: '',
    time: '',
  });
  const isReadingsApplicable = maintenanceTimings.activityType === "operation";
  
  // Filter state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveCommentOpen, setApproveCommentOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectCommentOpen, setRejectCommentOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showMissedReadingPopup, setShowMissedReadingPopup] = useState(false);
  const [missedReadingNextDue, setMissedReadingNextDue] = useState<Date | null>(null);
  const [missedEquipments, setMissedEquipments] = useState<EquipmentMissInfo[] | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [approvalComment, setApprovalComment] = useState('');
  const [editingCommentLogId, setEditingCommentLogId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [readingsModalLogId, setReadingsModalLogId] = useState<string | null>(null);
  const [viewedReadingsLogIds, setViewedReadingsLogIds] = useState<Set<string>>(new Set());

  // Pump/fan running section can be edited only for the first chiller reading of the day (global).
  // Subsequent entries (and all edits) can view but cannot change these values.
  const activeDateKey = formData.date || format(new Date(), 'yyyy-MM-dd');
  const hasFirstChillerLogForDay =
    formData.equipmentType === 'chiller' && !!firstChillerLogByDate[activeDateKey];
  const isEditingLog = !!editingLogId;
  const canEditRunningSection = !isEditingLog && !hasFirstChillerLogForDay;
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    status: 'all',
    equipmentId: '',
    checkedBy: '',
    fromTime: '',
    toTime: '',
  });
  const [filteredLogs, setFilteredLogs] = useState<ELogBook[]>(logs);
  const [previousReadingsForEquipment, setPreviousReadingsForEquipment] = useState<ELogBook[]>([]);
  const [previousReadingsLoading, setPreviousReadingsLoading] = useState(false);

  // Fetch logbook schemas and initial logs from API
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch logbook schemas (used for custom logbooks; kept for future extensibility)
        const schemas = await logbookAPI.list();
        setLogbookSchemas(schemas);

        // Load chiller logs (including all new fields) using shared refresh logic
        await refreshLogs();
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load log entries');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Listen for new logbook creation
    const handleLogbookSaved = () => {
      fetchData();
    };
    window.addEventListener('logbookSaved', handleLogbookSaved);

    return () => {
      window.removeEventListener('logbookSaved', handleLogbookSaved);
    };
  }, []);

  // Load shared chemical list for cooling tower chemical dropdown (no hardcoded list)
  useEffect(() => {
    (async () => {
      try {
        const data = await chemicalMasterAPI.list();
        const opts = (data as any[]).map((c) => ({
          id: String((c as any).id),
          label: `${(c as any).location_label ?? (c as any).location ?? ''} – ${(c as any).formula} – ${
            (c as any).name
          }`,
        }));
        setChemicalOptions(opts);
      } catch (error) {
        // Cooling tower chemical list is a helper; log but don't block the whole page
        console.error('Failed to load chemical master list for cooling tower section:', error);
      }
    })();
  }, []);

  // Load equipment from master by category for Equipment ID dropdown (chiller, boiler, compressor)
  useEffect(() => {
    (async () => {
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const typeToCategory: Record<string, string> = {};
        for (const c of categories) {
          const name = (c.name || '').toLowerCase().trim();
          if (name === 'chiller' || name === 'chillers') typeToCategory.chiller = c.id;
          else if (name === 'boiler' || name === 'boilers') typeToCategory.boiler = c.id;
          else if (name === 'compressor' || name === 'compressors') typeToCategory.compressor = c.id;
        }
        const [chillerEq, boilerEq, compressorEq] = await Promise.all([
          typeToCategory.chiller ? equipmentAPI.list({ category: typeToCategory.chiller }) : Promise.resolve([]),
          typeToCategory.boiler ? equipmentAPI.list({ category: typeToCategory.boiler }) : Promise.resolve([]),
          typeToCategory.compressor ? equipmentAPI.list({ category: typeToCategory.compressor }) : Promise.resolve([]),
        ]);
        const map = (arr: any[]) =>
          (arr || [])
            .filter((e) => e?.is_active !== false && e?.status === 'approved')
            .map((e) => ({
              id: e.id,
              equipment_number: e.equipment_number,
              name: e.name || '',
              log_entry_interval: e.log_entry_interval ?? null,
              shift_duration_hours: e.shift_duration_hours ?? null,
            }));
        setEquipmentByType({
          chiller: map(chillerEq as any[]),
          boiler: map(boilerEq as any[]),
          compressor: map(compressorEq as any[]),
        });
      } catch (error) {
        console.error('Failed to load equipment for log book dropdown', error);
      }
    })();
  }, []);

  // Update selected schema when equipment type changes
  useEffect(() => {
    if (formData.equipmentType?.startsWith('custom_')) {
      const schemaId = formData.equipmentType.replace('custom_', '');
      const schema = logbookSchemas.find(s => s.id === schemaId);
      setSelectedSchema(schema || null);
      // Reset custom form data
      setCustomFormData({});
    } else {
      setSelectedSchema(null);
      setCustomFormData({});
    }
  }, [formData.equipmentType, logbookSchemas]);

  // After equipment selection, fetch previous readings with entered-by for that equipment (chiller/boiler/compressor)
  useEffect(() => {
    const eqId = formData.equipmentId;
    const eqType = formData.equipmentType;
    if (!eqId || eqType === 'chemical') {
      setPreviousReadingsForEquipment([]);
      return;
    }
    let cancelled = false;
    setPreviousReadingsLoading(true);
    const fetchList = async () => {
      if (eqType === 'chiller') {
        return chillerLogAPI.list({ equipment_id: eqId });
      }
      if (eqType === 'boiler') {
        return boilerLogAPI.list({ equipment_id: eqId });
      }
      if (eqType === 'compressor') {
        return compressorLogAPI.list({ equipment_id: eqId });
      }
      return [];
    };
    fetchList()
      .then((raw: any[]) => {
        if (cancelled) return;
        const list = (Array.isArray(raw) ? raw : []).slice(0, 10).map((log: any) => {
          const timestamp = new Date(log.timestamp);
          return {
            id: log.id,
            equipmentType: eqType,
            equipmentId: log.equipment_id,
            date: format(timestamp, 'yyyy-MM-dd'),
            time: format(timestamp, 'HH:mm:ss'),
            feedWaterTemp: log.feed_water_temp,
            oilTemp: log.oil_temp,
            steamTemp: log.steam_temp,
            steamPressure: log.steam_pressure,
            compressorSupplyTemp: log.compressor_supply_temp,
            compressorReturnTemp: log.compressor_return_temp,
            remarks: log.remarks || '',
            checkedBy: log.operator_name,
            timestamp,
            status: log.status,
          } as ELogBook;
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
  }, [formData.equipmentId, formData.equipmentType]);

  // Missed scheduled reading popup: when logs and session settings are ready, check if next due has passed (equipment-wise)
  useEffect(() => {
    if (!sessionSettings?.log_entry_interval || logs.length === 0) return;
    const chillerLogsOnly = logs.filter((l) => l.equipmentType === 'chiller');
    if (chillerLogsOnly.length === 0) {
      setMissedEquipments(null);
      setShowMissedReadingPopup(false);
      setMissedReadingNextDue(null);
      return;
    }
    const chillerOptions = equipmentByType.chiller ?? [];
    const metaByNumber = new Map<
      string,
      { log_entry_interval?: string | null; shift_duration_hours?: number | null }
    >();
    for (const e of chillerOptions) {
      metaByNumber.set(e.equipment_number, {
        log_entry_interval: e.log_entry_interval ?? null,
        shift_duration_hours: e.shift_duration_hours ?? null,
      });
    }
    const defaultInterval = sessionSettings.log_entry_interval as 'hourly' | 'shift' | 'daily';
    const defaultShift = sessionSettings.shift_duration_hours ?? 8;

    const resolveInterval = (equipmentId?: string): 'hourly' | 'shift' | 'daily' => {
      const meta = equipmentId ? metaByNumber.get(equipmentId) : undefined;
      return (meta?.log_entry_interval as 'hourly' | 'shift' | 'daily') || defaultInterval || 'daily';
    };
    const resolveShift = (equipmentId?: string): number => {
      const meta = equipmentId ? metaByNumber.get(equipmentId) : undefined;
      return meta?.shift_duration_hours ?? defaultShift;
    };

    const perEquipment = computeMissedByEquipment(
      chillerLogsOnly.map((l) => ({
        equipment_id: l.equipmentId,
        timestamp: l.timestamp,
      })),
      {
        resolveInterval: (eqId) => resolveInterval(eqId),
        resolveShiftHours: (eqId) => resolveShift(eqId),
      },
    );

    const missedOnly = perEquipment.filter((m) => m.isMissed);
    if (missedOnly.length > 0) {
      setMissedEquipments(missedOnly);
      // Use the earliest missed nextDue for the legacy description
      const firstNext =
        missedOnly
          .map((m) => m.nextDue)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime())[0] || null;
      setMissedReadingNextDue(firstNext);
      setShowMissedReadingPopup(true);
    } else {
      setMissedEquipments(null);
      setShowMissedReadingPopup(false);
      setMissedReadingNextDue(null);
    }
  }, [logs, sessionSettings, equipmentByType]);

  // Refresh logs from API
  const refreshLogs = async () => {
    try {
      const [
        chillerLogs,
        boilerLogs,
        chemicalLogs,
        filterLogs,
      ] = await Promise.all([
        chillerLogAPI.list().catch(err => {
          console.error('Error fetching chiller logs:', err);
          return [];
        }),
        boilerLogAPI.list().catch(err => {
          console.error('Error fetching boiler logs:', err);
          return [];
        }),
        chemicalPrepAPI.list().catch(err => {
          console.error('Error fetching chemical logs:', err);
          return [];
        }),
        filterLogAPI.list().catch(err => {
          console.error('Error fetching filter logs:', err);
          return [];
        }),
      ]);
      
      console.log('Refreshed log data:', { chillerLogs, boilerLogs, chemicalLogs, filterLogs });

      const allLogs: ELogBook[] = [];

      // Convert chiller logs
      chillerLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentType: 'chiller',
          equipmentId: log.equipment_id,
          date: format(timestamp, 'yyyy-MM-dd'),
          time: format(timestamp, 'HH:mm:ss'),
          dailyWaterCt1Liters: log.daily_water_consumption_ct1_liters,
          dailyWaterCt2Liters: log.daily_water_consumption_ct2_liters,
          dailyWaterCt3Liters: log.daily_water_consumption_ct3_liters,
          evapWaterInletPressure: log.evap_water_inlet_pressure,
              evapWaterOutletPressure: log.evap_water_outlet_pressure,
              evapEnteringWaterTemp: log.evap_entering_water_temp,
              evapLeavingWaterTemp: log.evap_leaving_water_temp,
              evapApproachTemp: log.evap_approach_temp,
              condWaterInletPressure: log.cond_water_inlet_pressure,
              condWaterOutletPressure: log.cond_water_outlet_pressure,
              condEnteringWaterTemp: log.cond_entering_water_temp,
              condLeavingWaterTemp: log.cond_leaving_water_temp,
              condApproachTemp: log.cond_approach_temp,
              chillerControlSignal: log.chiller_control_signal,
              avgMotorCurrent: log.avg_motor_current,
              compressorRunningTimeMin: log.compressor_running_time_min,
              starterEnergyKwh: log.starter_energy_kwh,
          coolingTowerPumpStatus: log.cooling_tower_pump_status,
          chilledWaterPumpStatus: log.chilled_water_pump_status,
          coolingTowerFanStatus: log.cooling_tower_fan_status,
          coolingTowerBlowoffValveStatus: log.cooling_tower_blowoff_valve_status,
          coolingTowerBlowdownTimeMin: log.cooling_tower_blowdown_time_min,
          coolingTowerChemicalName: log.cooling_tower_chemical_name,
          coolingTowerChemicalQtyPerDay: log.cooling_tower_chemical_qty_per_day,
          chilledWaterPumpChemicalName: log.chilled_water_pump_chemical_name,
          chilledWaterPumpChemicalQtyKg: log.chilled_water_pump_chemical_qty_kg,
          coolingTowerFanChemicalName: log.cooling_tower_fan_chemical_name,
          coolingTowerFanChemicalQtyKg: log.cooling_tower_fan_chemical_qty_kg,
          recordingFrequency: log.recording_frequency,
          operatorSign: log.operator_sign,
          verifiedBy: log.verified_by,
          remarks: log.remarks || '',
          comment: log.comment || '',
          checkedBy: log.operator_name,
          timestamp: timestamp,
          status: log.status as 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval',
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
          tolerance_status: log.tolerance_status as 'none' | 'within' | 'outside' | undefined,
        });
      });

      // Convert boiler logs
      boilerLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentType: 'boiler',
          equipmentId: log.equipment_id,
          date: format(timestamp, 'yyyy-MM-dd'),
          time: format(timestamp, 'HH:mm:ss'),
          remarks: log.remarks || '',
          comment: log.comment || '',
          checkedBy: log.operator_name,
          timestamp,
          status: log.status as 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval',
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
          tolerance_status: log.tolerance_status as 'none' | 'within' | 'outside' | undefined,
        });
      });

      // Convert chemical logs
      chemicalLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentType: 'chemical',
          equipmentId: log.equipment_name,
          date: format(timestamp, 'yyyy-MM-dd'),
          time: format(timestamp, 'HH:mm:ss'),
          remarks: log.remarks || '',
          comment: log.comment || '',
          checkedBy: log.operator_name,
          timestamp,
          status: log.status as 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval',
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
          tolerance_status: log.tolerance_status as 'none' | 'within' | 'outside' | undefined,
        });
      });

      // Convert filter logs
      filterLogs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        allLogs.push({
          id: log.id,
          equipmentType: 'filter',
          equipmentId: log.equipment_id,
          date: format(timestamp, 'yyyy-MM-dd'),
          time: format(timestamp, 'HH:mm:ss'),
          remarks: log.remarks || '',
          comment: log.comment || '',
          checkedBy: log.operator_name,
          timestamp,
          status: log.status as 'pending' | 'approved' | 'rejected' | 'draft' | 'pending_secondary_approval',
          operator_id: log.operator_id,
          approved_by_id: log.approved_by_id,
          corrects_id: log.corrects_id,
          has_corrections: log.has_corrections,
          tolerance_status: log.tolerance_status as 'none' | 'within' | 'outside' | undefined,
        });
      });

      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      console.log('Total logs after refresh:', allLogs.length, allLogs);
      setLogs(allLogs);

      // Rebuild map of first chiller log per operator per day (legacy; kept for other logic)
      const firstMap: Record<string, ELogBook> = {};
      // First chiller log per date (global day baseline)
      const firstByDate: Record<string, ELogBook> = {};
      allLogs.forEach(log => {
        if (log.equipmentType !== 'chiller') return;
        if (log.operator_id) {
          const key = `${log.operator_id}_${log.date}`;
          const existing = firstMap[key];
          if (!existing || log.timestamp.getTime() < existing.timestamp.getTime()) {
            firstMap[key] = log;
          }
        }

        const dateKey = log.date;
        const existingForDate = firstByDate[dateKey];
        if (!existingForDate || log.timestamp.getTime() < existingForDate.timestamp.getTime()) {
          firstByDate[dateKey] = log;
        }
      });
      setFirstChillerLogByDay(firstMap);
      setFirstChillerLogByDate(firstByDate);
    } catch (error) {
      console.error('Error refreshing logs:', error);
      toast.error('Failed to refresh log entries');
    }
  };

  // Get unique equipment IDs, equipment types, and checked by users
  const uniqueEquipmentIds = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return Array.from(new Set(logs.map(log => log.equipmentId).filter(Boolean))).sort();
  }, [logs]);
  
  const uniqueCheckedBy = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return Array.from(new Set(logs.map(log => log.checkedBy).filter(Boolean))).sort();
  }, [logs]);

  // Apply filters function
  const applyFilters = () => {
    let result = [...logs];

    // Date range filter
    if (filters.fromDate) {
      result = result.filter(log => log.date >= filters.fromDate);
    }
    if (filters.toDate) {
      result = result.filter(log => log.date <= filters.toDate);
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(log => log.status === filters.status);
    }

    // Equipment ID filter
    if (filters.equipmentId) {
      result = result.filter(
        (log) => log.equipmentId && log.equipmentId.toString().toLowerCase() === filters.equipmentId.toLowerCase()
      );
    }

    // Checked By filter
    if (filters.checkedBy) {
      result = result.filter(log => log.checkedBy === filters.checkedBy);
    }

    // Time range filter
    if (filters.fromTime) {
      result = result.filter(log => log.time >= filters.fromTime);
    }
    if (filters.toTime) {
      result = result.filter(log => log.time <= filters.toTime);
    }

    setFilteredLogs(result);
    setIsFilterOpen(false);
    toast.success(`Filtered ${result.length} entries`);
  };

  // Clear filters
  const clearFilters = () => {
    const clearedFilters = {
      fromDate: '',
      toDate: '',
      status: 'all',
      equipmentId: '',
      checkedBy: '',
      fromTime: '',
      toTime: '',
    };
    setFilters(clearedFilters);
    setFilteredLogs(logs);
    setIsFilterOpen(false);
    toast.success('Filters cleared');
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return [
      filters.fromDate,
      filters.toDate,
      filters.status !== 'all',
      filters.equipmentId,
      filters.checkedBy,
      filters.fromTime,
      filters.toTime,
    ].filter(Boolean).length;
  }, [filters]);

  // Update filtered logs when logs or filters change
  useEffect(() => {
    // Check if there are active filters
    const hasActiveFilters = activeFilterCount > 0;
    if (hasActiveFilters) {
      // Re-apply existing filters with new logs
      let result = [...logs];
      if (filters.fromDate) result = result.filter(log => log.date >= filters.fromDate);
      if (filters.toDate) result = result.filter(log => log.date <= filters.toDate);
      if (filters.status !== 'all') result = result.filter(log => log.status === filters.status);
      if (filters.equipmentId)
        result = result.filter(
          (log) => log.equipmentId && log.equipmentId.toString().toLowerCase() === filters.equipmentId.toLowerCase()
        );
      if (filters.checkedBy) result = result.filter(log => log.checkedBy === filters.checkedBy);
      if (filters.fromTime) result = result.filter(log => log.time >= filters.fromTime);
      if (filters.toTime) result = result.filter(log => log.time <= filters.toTime);
      setFilteredLogs(result);
    } else {
      setFilteredLogs(logs);
    }
  }, [logs, filters, activeFilterCount]);

  const pendingDraftLogs = useMemo(
    () => filteredLogs.filter((log) => log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval'),
    [filteredLogs],
  );
  const pendingDraftIds = useMemo(() => pendingDraftLogs.map((log) => log.id), [pendingDraftLogs]);
  const approvablePendingLogs = useMemo(
    () =>
      pendingDraftLogs.filter(
        (log) =>
          log.operator_id !== user?.id &&
          !(log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id),
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
    setSelectedLogIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate custom logbook fields if selected
    if (selectedSchema) {
      const requiredFields = selectedSchema.fields.filter(f => f.required);
      for (const field of requiredFields) {
        if (!customFormData[field.id] || customFormData[field.id] === '') {
          toast.error(`Please fill in required field: ${field.label}`);
          return;
        }
      }
    }

    if (!formData.remarks.trim()) {
      toast.error('Remarks are required.');
      return;
    }
    
    try {
      // Chiller page handles only chiller entries
      if (formData.equipmentType === 'chiller') {
        // Validate all chiller fields with clear messages before saving
        if (isReadingsApplicable && !validateChillerForm()) {
          return;
        }
        const now = new Date();
        const today = format(now, 'yyyy-MM-dd');

        // Determine day baseline log (first chiller log globally for the day)
        const firstLogForDay = firstChillerLogByDate[today];

        // If not the first log, enforce remarks when pump/fan status changes
        if (firstLogForDay) {
          const initialPumps = decodePumpPair(firstLogForDay.coolingTowerPumpStatus);
          const initialChilled = decodePumpPair(firstLogForDay.chilledWaterPumpStatus);
          const initialFans = decodeFanTriple(firstLogForDay.coolingTowerFanStatus);

          const changes: string[] = [];

          if (initialPumps) {
            if (initialPumps.p1 !== formData.coolingTowerPump1) {
              changes.push(
                `Cooling Tower-1 changed from ${initialPumps.p1} to ${formData.coolingTowerPump1}`,
              );
            }
            if (initialPumps.p2 !== formData.coolingTowerPump2) {
              changes.push(
                `Cooling Tower-2 changed from ${initialPumps.p2} to ${formData.coolingTowerPump2}`,
              );
            }
          }

          if (initialChilled) {
            if (initialChilled.p1 !== formData.chilledWaterPump1) {
              changes.push(
                `Chilled Water Pump 1 changed from ${initialChilled.p1} to ${formData.chilledWaterPump1}`,
              );
            }
            if (initialChilled.p2 !== formData.chilledWaterPump2) {
              changes.push(
                `Chilled Water Pump 2 changed from ${initialChilled.p2} to ${formData.chilledWaterPump2}`,
              );
            }
          }

          if (initialFans) {
            if (initialFans.f1 !== formData.coolingTowerFan1) {
              changes.push(
                `Cooling Tower Fan 1 changed from ${initialFans.f1} to ${formData.coolingTowerFan1}`,
              );
            }
            if (initialFans.f2 !== formData.coolingTowerFan2) {
              changes.push(
                `Cooling Tower Fan 2 changed from ${initialFans.f2} to ${formData.coolingTowerFan2}`,
              );
            }
            if (initialFans.f3 !== formData.coolingTowerFan3) {
              changes.push(
                `Cooling Tower Fan 3 changed from ${initialFans.f3} to ${formData.coolingTowerFan3}`,
              );
            }
          }

          if (changes.length > 0 && !formData.remarks.trim()) {
            toast.error('Remarks are required when changing pump/fan status.');
            return;
          }

          // We only enforce that remarks are filled when pump/fan status changes.
          // The remarks text itself is exactly what the operator types.
        }

        const coolingTowerPumpStatus = encodePumpPair(
          formData.coolingTowerPump1,
          formData.coolingTowerPump2,
        );
        const chilledWaterPumpStatus = encodePumpPair(
          formData.chilledWaterPump1,
          formData.chilledWaterPump2,
        );
        const coolingTowerFanStatus = encodeFanTriple(
          formData.coolingTowerFan1,
          formData.coolingTowerFan2,
          formData.coolingTowerFan3,
        );

        const logData: Record<string, unknown> = {
          equipment_id: formData.equipmentId,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
          recording_frequency: formData.recordingFrequency || undefined,
          operator_sign: formData.operatorSign || undefined,
          verified_by: formData.verifiedBy || undefined,
          remarks: formData.remarks || undefined,
          cooling_tower_pump_status: coolingTowerPumpStatus || undefined,
          chilled_water_pump_status: chilledWaterPumpStatus || undefined,
          cooling_tower_fan_status: coolingTowerFanStatus || undefined,
          cooling_tower_blowoff_valve_status: formData.coolingTowerBlowoffValveStatus || undefined,
          cooling_tower_blowdown_time_min: formData.coolingTowerBlowdownTimeMin
            ? parseFloat(formData.coolingTowerBlowdownTimeMin)
            : undefined,
        };
        if (isReadingsApplicable) {
          Object.assign(logData, {
            evap_water_inlet_pressure: formData.evapWaterInletPressure ? parseFloat(formData.evapWaterInletPressure) : undefined,
            evap_water_outlet_pressure: formData.evapWaterOutletPressure ? parseFloat(formData.evapWaterOutletPressure) : undefined,
            evap_entering_water_temp: formData.evapEnteringWaterTemp ? parseFloat(formData.evapEnteringWaterTemp) : undefined,
            evap_leaving_water_temp: formData.evapLeavingWaterTemp ? parseFloat(formData.evapLeavingWaterTemp) : undefined,
            evap_approach_temp: formData.evapApproachTemp ? parseFloat(formData.evapApproachTemp) : undefined,
            cond_water_inlet_pressure: formData.condWaterInletPressure ? parseFloat(formData.condWaterInletPressure) : undefined,
            cond_water_outlet_pressure: formData.condWaterOutletPressure ? parseFloat(formData.condWaterOutletPressure) : undefined,
            cond_entering_water_temp: formData.condEnteringWaterTemp ? parseFloat(formData.condEnteringWaterTemp) : undefined,
            cond_leaving_water_temp: formData.condLeavingWaterTemp ? parseFloat(formData.condLeavingWaterTemp) : undefined,
            cond_approach_temp: formData.condApproachTemp ? parseFloat(formData.condApproachTemp) : undefined,
            chiller_control_signal: formData.chillerControlSignal ? parseFloat(formData.chillerControlSignal) : undefined,
            avg_motor_current: formData.avgMotorCurrent ? parseFloat(formData.avgMotorCurrent) : undefined,
            compressor_running_time_min: formData.compressorRunningTimeMin ? parseFloat(formData.compressorRunningTimeMin) : undefined,
            starter_energy_kwh: formData.starterEnergyKwh ? parseFloat(formData.starterEnergyKwh) : undefined,
          });
        }
        const editingChillerLog = editingLogId ? logs.find((l) => l.id === editingLogId) : null;
        const canChangeTimestamp =
          editingChillerLog &&
          (editingChillerLog.status === 'rejected' || editingChillerLog.status === 'pending_secondary_approval');
        if (canChangeTimestamp && formData.date && formData.time) {
          (logData as Record<string, unknown>).timestamp = new Date(`${formData.date}T${formData.time}`).toISOString();
        }
        if (editingLogId && editingChillerLog) {
          const isCorrection =
            (editingChillerLog.status === 'rejected' || editingChillerLog.status === 'pending_secondary_approval') &&
            user?.role !== 'operator';
          if (isCorrection) {
            await chillerLogAPI.correct(editingLogId, logData);
            toast.success('Chiller entry corrected as new entry');
          } else {
            await chillerLogAPI.update(editingLogId, logData);
            toast.success('Chiller entry updated successfully');
          }
        } else if (!editingLogId) {
          await chillerLogAPI.create(logData as any);
          toast.success('Chiller entry saved successfully');
        }
      }
      // Handle boiler entries
      else if (formData.equipmentType === 'boiler') {
        const logData: Record<string, unknown> = {
          equipment_id: formData.equipmentId,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
          remarks: formData.remarks || undefined,
        };
        if (isReadingsApplicable) {
          Object.assign(logData, {
            feed_water_temp: parseFloat(formData.feedWaterTemp),
            oil_temp: parseFloat(formData.oilTemp),
            steam_temp: parseFloat(formData.steamTemp),
            steam_pressure: parseFloat(formData.steamPressure),
            steam_flow_lph: formData.steamFlowLPH ? parseFloat(formData.steamFlowLPH) : undefined,
          });
        }
        
        await boilerLogAPI.create(logData as any);
        toast.success('Boiler entry saved successfully');
      }
      // Handle compressor entries
      else if (formData.equipmentType === 'compressor') {
        const logData: Record<string, unknown> = {
          equipment_id: formData.equipmentId,
          activity_type: maintenanceTimings.activityType,
          activity_from_date: maintenanceTimings.fromDate || undefined,
          activity_to_date: maintenanceTimings.toDate || undefined,
          activity_from_time: maintenanceTimings.fromTime || undefined,
          activity_to_time: maintenanceTimings.toTime || undefined,
          remarks: formData.remarks || undefined,
        };
        if (isReadingsApplicable) {
          Object.assign(logData, {
            compressor_supply_temp: parseFloat(formData.compressorSupplyTemp),
            compressor_return_temp: parseFloat(formData.compressorReturnTemp),
            compressor_pressure: parseFloat(formData.compressorPressure),
            compressor_flow: formData.compressorFlow ? parseFloat(formData.compressorFlow) : undefined,
          });
        }
        
        await compressorLogAPI.create(logData as any);
        toast.success('Compressor entry saved successfully');
      }
      
      // Reset form
      setFormData({
        equipmentType: 'chiller',
        equipmentId: '',
        dailyWaterCt1Liters: '',
        dailyWaterCt2Liters: '',
        dailyWaterCt3Liters: '',
        evapWaterInletPressure: '',
        evapWaterOutletPressure: '',
        evapEnteringWaterTemp: '',
        evapLeavingWaterTemp: '',
        evapApproachTemp: '',
        condWaterInletPressure: '',
        condWaterOutletPressure: '',
        condEnteringWaterTemp: '',
        condLeavingWaterTemp: '',
        condApproachTemp: '',
        chillerControlSignal: '',
        avgMotorCurrent: '',
        compressorRunningTimeMin: '',
        starterEnergyKwh: '',
        coolingTowerPump1: 'OFF',
        coolingTowerPump2: 'OFF',
        chilledWaterPump1: 'OFF',
        chilledWaterPump2: 'OFF',
        coolingTowerFan1: 'OFF',
        coolingTowerFan2: 'OFF',
        coolingTowerFan3: 'OFF',
        coolingTowerPumpStatus: '',
        chilledWaterPumpStatus: '',
        coolingTowerFanStatus: '',
        coolingTowerBlowoffValveStatus: '',
        coolingTowerBlowdownTimeMin: '',
        coolingTowerChemicalName: '',
        coolingTowerChemicalQtyPerDay: '',
        chilledWaterPumpChemicalName: '',
        chilledWaterPumpChemicalQtyKg: '',
        coolingTowerFanChemicalName: '',
        coolingTowerFanChemicalQtyKg: '',
        recordingFrequency: '',
        operatorSign: '',
        verifiedBy: '',
        feedWaterTemp: '',
        oilTemp: '',
        steamTemp: '',
        steamPressure: '',
        steamFlowLPH: '',
        compressorSupplyTemp: '',
        compressorReturnTemp: '',
        compressorPressure: '',
        compressorFlow: '',
        equipmentName: '',
        chemicalName: '',
        solutionConcentration: '',
        waterQty: '',
        chemicalQty: '',
        remarks: '',
        date: '',
        time: '',
      });
      setCustomFormData({});
      setSelectedSchema(null);
      setIsDialogOpen(false);
      
      // Refresh logs from API
      await refreshLogs();
    } catch (error: any) {
      console.error('Error saving entry:', error);
      if (error?.response?.status === 400 && Array.isArray(error?.response?.data?.detail)) {
        toast.error(error.response.data.detail.join(' '));
      } else {
        toast.error(error?.message || 'Failed to save entry');
      }
    }
  };

  const handleApprove = async (id: string, remarks: string) => {
    setApproveCommentOpen(false);
    setApprovalComment('');
    try {
      const log = logs.find(l => l.id === id);
      if (!log) return;

      if (log.equipmentType === 'chemical') {
        await chemicalPrepAPI.approve(id, 'approve', remarks);
      } else if (log.equipmentType === 'boiler') {
        await boilerLogAPI.approve(id, 'approve', remarks);
      } else if (log.equipmentType === 'chiller') {
        await chillerLogAPI.approve(id, 'approve', remarks);
      } else if (log.equipmentType === 'compressor') {
        await compressorLogAPI.approve(id, 'approve', remarks);
      }
      
      toast.success('Entry approved successfully');
      await refreshLogs();
    } catch (error: any) {
      console.error('Error approving entry:', error);
      toast.error(error?.response?.data?.error || error?.message || 'Failed to approve entry');
    }
  };

  const handleApproveClick = (id: string) => {
    const log = logs.find((l) => l.id === id);
    if (!log) return;
    const requiresReadingsBeforeApprove =
      log.equipmentType === 'chiller' || log.equipmentType === 'boiler' || log.equipmentType === 'chemical';
    if (requiresReadingsBeforeApprove && !viewedReadingsLogIds.has(id)) {
      toast.error('Please click View Readings before approving this entry.');
      return;
    }

    // Prevent operator from attempting approval – show same message as backend
    if (log.operator_id && user?.id && log.operator_id === user.id) {
      toast.error(
        'The log book entry must be approved by a different user than the operator (Log Book Done By).',
      );
      return;
    }

    setSelectedLogIds([id]);
    setApproveConfirmOpen(true);
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
    const notViewedIds = selectedLogIds.filter((id) => {
      const log = logs.find((l) => l.id === id);
      if (!log) return false;
      const requiresReadingsBeforeApprove =
        log.equipmentType === 'chiller' || log.equipmentType === 'boiler' || log.equipmentType === 'chemical';
      return requiresReadingsBeforeApprove && !viewedReadingsLogIds.has(id);
    });
    if (notViewedIds.length > 0) {
      toast.error(
        `Please click View Readings before approval for ${notViewedIds.length} selected entr${notViewedIds.length === 1 ? 'y' : 'ies'}.`
      );
      return;
    }
    setApproveConfirmOpen(true);
  };

  const handleReject = async (id: string, remarks: string) => {
    setRejectCommentOpen(false);
    setRejectComment('');
    try {
      const log = logs.find(l => l.id === id);
      if (!log) return;

      if (log.equipmentType === 'chemical') {
        await chemicalPrepAPI.approve(id, 'reject', remarks);
      } else if (log.equipmentType === 'boiler') {
        await boilerLogAPI.approve(id, 'reject', remarks);
      } else if (log.equipmentType === 'chiller') {
        await chillerLogAPI.approve(id, 'reject', remarks);
      } else if (log.equipmentType === 'compressor') {
        await compressorLogAPI.approve(id, 'reject', remarks);
      }
      
      toast.error('Entry rejected');
      await refreshLogs();
    } catch (error: any) {
      console.error('Error rejecting entry:', error);
      toast.error(error?.response?.data?.remarks?.[0] || error?.message || 'Failed to reject entry');
    }
  };

  const handleRejectClick = (id: string) => {
    const log = logs.find((l) => l.id === id);
    if (!log) return;

    // Prevent operator from attempting rejection – show same message as backend
    if (log.operator_id && user?.id && log.operator_id === user.id) {
      toast.error(
        'The log book entry must be rejected by a different user than the operator (Log Book Done By).',
      );
      return;
    }

    setSelectedLogId(id);
    setRejectConfirmOpen(true);
  };

  const handleEditLog = (log: ELogBook) => {
    // Only chiller entries are shown on this page
    setEditingLogId(log.id);

    const initialPumps = decodePumpPair(log.coolingTowerPumpStatus);
    const initialChilled = decodePumpPair(log.chilledWaterPumpStatus);
    const initialFans = decodeFanTriple(log.coolingTowerFanStatus);

    setFormData((prev) => ({
      ...prev,
      equipmentType: 'chiller',
      equipmentId: log.equipmentId,
      dailyWaterCt1Liters: log.dailyWaterCt1Liters != null ? String(log.dailyWaterCt1Liters) : '',
      dailyWaterCt2Liters: log.dailyWaterCt2Liters != null ? String(log.dailyWaterCt2Liters) : '',
      dailyWaterCt3Liters: log.dailyWaterCt3Liters != null ? String(log.dailyWaterCt3Liters) : '',
      evapWaterInletPressure: log.evapWaterInletPressure != null ? String(log.evapWaterInletPressure) : '',
      evapWaterOutletPressure: log.evapWaterOutletPressure != null ? String(log.evapWaterOutletPressure) : '',
      evapEnteringWaterTemp: log.evapEnteringWaterTemp != null ? String(log.evapEnteringWaterTemp) : '',
      evapLeavingWaterTemp: log.evapLeavingWaterTemp != null ? String(log.evapLeavingWaterTemp) : '',
      evapApproachTemp: log.evapApproachTemp != null ? String(log.evapApproachTemp) : '',
      condWaterInletPressure: log.condWaterInletPressure != null ? String(log.condWaterInletPressure) : '',
      condWaterOutletPressure: log.condWaterOutletPressure != null ? String(log.condWaterOutletPressure) : '',
      condEnteringWaterTemp: log.condEnteringWaterTemp != null ? String(log.condEnteringWaterTemp) : '',
      condLeavingWaterTemp: log.condLeavingWaterTemp != null ? String(log.condLeavingWaterTemp) : '',
      condApproachTemp: log.condApproachTemp != null ? String(log.condApproachTemp) : '',
      chillerControlSignal: log.chillerControlSignal != null ? String(log.chillerControlSignal) : '',
      avgMotorCurrent: log.avgMotorCurrent != null ? String(log.avgMotorCurrent) : '',
      compressorRunningTimeMin: log.compressorRunningTimeMin != null ? String(log.compressorRunningTimeMin) : '',
      starterEnergyKwh: log.starterEnergyKwh != null ? String(log.starterEnergyKwh) : '',
      coolingTowerPump1: initialPumps ? initialPumps.p1 : 'OFF',
      coolingTowerPump2: initialPumps ? initialPumps.p2 : 'OFF',
      chilledWaterPump1: initialChilled ? initialChilled.p1 : 'OFF',
      chilledWaterPump2: initialChilled ? initialChilled.p2 : 'OFF',
      coolingTowerFan1: initialFans ? initialFans.f1 : 'OFF',
      coolingTowerFan2: initialFans ? initialFans.f2 : 'OFF',
      coolingTowerFan3: initialFans ? initialFans.f3 : 'OFF',
      coolingTowerPumpStatus: log.coolingTowerPumpStatus || '',
      chilledWaterPumpStatus: log.chilledWaterPumpStatus || '',
      coolingTowerFanStatus: log.coolingTowerFanStatus || '',
      coolingTowerBlowoffValveStatus: log.coolingTowerBlowoffValveStatus || '',
      coolingTowerBlowdownTimeMin:
        log.coolingTowerBlowdownTimeMin != null ? String(log.coolingTowerBlowdownTimeMin) : '',
      coolingTowerChemicalName: log.coolingTowerChemicalName || '',
      coolingTowerChemicalQtyPerDay:
        log.coolingTowerChemicalQtyPerDay != null ? String(log.coolingTowerChemicalQtyPerDay) : '',
      chilledWaterPumpChemicalName: log.chilledWaterPumpChemicalName || '',
      chilledWaterPumpChemicalQtyKg:
        log.chilledWaterPumpChemicalQtyKg != null ? String(log.chilledWaterPumpChemicalQtyKg) : '',
      coolingTowerFanChemicalName: log.coolingTowerFanChemicalName || '',
      coolingTowerFanChemicalQtyKg:
        log.coolingTowerFanChemicalQtyKg != null ? String(log.coolingTowerFanChemicalQtyKg) : '',
      recordingFrequency: log.recordingFrequency || '',
      operatorSign: log.operatorSign || '',
      verifiedBy: log.verifiedBy || '',
      remarks: log.remarks || '',
      date: log.date || '',
      time: log.time || '',
    }));

    setIsDialogOpen(true);
  };

  const handleSaveComment = async (logId: string, comment: string) => {
    if (editingCommentLogId !== logId) return;
    setEditingCommentLogId(null);
    try {
      await chillerLogAPI.patch(logId, { comment: comment || '' });
      toast.success('Comment updated');
      await refreshLogs();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail?.[0] || error?.message || 'Failed to update comment');
      setEditingCommentLogId(logId);
      setEditingCommentValue(comment);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry? This action cannot be undone.')) {
      return;
    }
    
    try {
      const log = logs.find(l => l.id === id);
      if (!log) return;

      if (log.equipmentType === 'chemical') {
        await chemicalPrepAPI.delete(id);
      } else if (log.equipmentType === 'boiler') {
        await boilerLogAPI.delete(id);
      } else if (log.equipmentType === 'chiller') {
        await chillerLogAPI.delete(id);
      } else if (log.equipmentType === 'compressor') {
        await compressorLogAPI.delete(id);
      }
      
      toast.success('Entry deleted successfully');
      await refreshLogs();
    } catch (error: any) {
      console.error('Error deleting entry:', error);
      toast.error(error?.message || 'Failed to delete entry');
    }
  };

  const isValueOutOfLimit = (log: ELogBook, field: string, value?: number): boolean => {
    if (value === undefined) return false;
    const limits = equipmentLimits[log.equipmentType as keyof typeof equipmentLimits];
    if (!limits) return false;
    const limit = limits[field as keyof typeof limits] as
      | { max?: number; min?: number; unit: string; type: 'NMT' | 'NLT' }
      | undefined;
    if (!limit) return false;

    if (limit.type === 'NMT' && limit.max !== undefined) {
      return value > limit.max;
    }
    if (limit.type === 'NLT' && limit.min !== undefined) {
      return value < limit.min;
    }
    return false;
  };

  const isFormValueOutOfLimit = (
    equipment: keyof typeof equipmentLimits,
    field: keyof (typeof equipmentLimits)['chiller'],
    rawValue: string
  ): boolean => {
    if (!rawValue) return false;
    const limits = equipmentLimits[equipment];
    const limit = limits[field];
    if (!limit) return false;
    const value = parseFloat(rawValue);
    if (Number.isNaN(value)) return false;

    if (limit.type === 'NMT' && limit.max !== undefined) {
      return value > limit.max;
    }
    if (limit.type === 'NLT' && limit.min !== undefined) {
      return value < limit.min;
    }
    return false;
  };

  const getLimitErrorMessage = (
    equipment: keyof typeof equipmentLimits,
    field: keyof (typeof equipmentLimits)['chiller'],
  ): string | null => {
    const limits = equipmentLimits[equipment];
    const limit = limits[field] as any;
    if (!limit) return null;
    if (limit.type === 'NMT' && typeof limit.max !== 'undefined') {
      return `Value must be not more than ${limit.max} ${limit.unit}.`;
    }
    if (limit.type === 'NLT' && typeof limit.min !== 'undefined') {
      return `Value must be not less than ${limit.min} ${limit.unit}.`;
    }
    return null;
  };

  const validateChillerForm = (): boolean => {
    // Required fields (presence + basic numeric validation where applicable).
    // IMPORTANT: Do NOT block save on limit violations; limits are shown
    // visually (red fields + messages) and highlighted in the list view.
    const requiredFields: {
      key: string;
      label: string;
      limitField?: keyof (typeof equipmentLimits)['chiller'];
      numeric?: boolean;
    }[] = [
      { key: 'equipmentId', label: 'Equipment ID' },
      { key: 'evapWaterInletPressure', label: 'Evap water inlet pressure', limitField: 'evapWaterInletPressure', numeric: true },
      { key: 'evapWaterOutletPressure', label: 'Evap water outlet pressure', limitField: 'evapWaterOutletPressure', numeric: true },
      { key: 'evapEnteringWaterTemp', label: 'Evap entering water temp', limitField: 'evapEnteringWaterTemp', numeric: true },
      { key: 'evapLeavingWaterTemp', label: 'Evap leaving water temp', limitField: 'evapLeavingWaterTemp', numeric: true },
      { key: 'evapApproachTemp', label: 'Evap approach temp', limitField: 'evapApproachTemp', numeric: true },
      { key: 'condWaterInletPressure', label: 'Cond water inlet pressure', limitField: 'condWaterInletPressure', numeric: true },
      { key: 'condWaterOutletPressure', label: 'Cond water outlet pressure', limitField: 'condWaterOutletPressure', numeric: true },
      { key: 'condEnteringWaterTemp', label: 'Cond entering water temp', limitField: 'condEnteringWaterTemp', numeric: true },
      { key: 'condLeavingWaterTemp', label: 'Cond leaving water temp', limitField: 'condLeavingWaterTemp', numeric: true },
      { key: 'condApproachTemp', label: 'Cond approach temp', limitField: 'condApproachTemp', numeric: true },
      { key: 'chillerControlSignal', label: 'Chiller control signal', limitField: 'chillerControlSignal', numeric: true },
      { key: 'avgMotorCurrent', label: 'Average motor current', limitField: 'avgMotorCurrent', numeric: true },
      { key: 'compressorRunningTimeMin', label: 'Compressor running time', limitField: 'compressorRunningTimeMin', numeric: true },
      { key: 'starterEnergyKwh', label: 'Starter energy consumption', limitField: 'starterEnergyKwh', numeric: true },
      { key: 'coolingTowerBlowdownTimeMin', label: 'Cooling tower blow down time (minutes)', numeric: true },
      { key: 'recordingFrequency', label: 'Recording frequency' },
      { key: 'operatorSign', label: 'Operator Sign & Date' },
      { key: 'verifiedBy', label: 'Verified By (Sign & Date)' },
    ];

    for (const field of requiredFields) {
      const rawValue = (formData as any)[field.key];
      // Presence check
      if (!rawValue && rawValue !== 0) {
        toast.error(`Please enter ${field.label}.`);
        return false;
      }

      // Numeric validation
      if (field.numeric) {
        const value = parseFloat(rawValue);
        if (Number.isNaN(value)) {
          toast.error(`${field.label} must be a numeric value.`);
          return false;
        }
      }

      // NOTE: limit (NMT / NLT) violations are *not* enforced here.
      // They are only highlighted in the UI (red field + helper text),
      // and in the list view, so the operator can still save.
    }

    // Optional numeric-only fields (validate only if provided)
    const optionalNumeric: { key: string; label: string }[] = [
      { key: 'coolingTowerBlowdownTimeMin', label: 'Cooling tower blow down time (minutes)' },
      { key: 'coolingTowerChemicalQtyPerDay', label: 'Cooling tower-1 chemical quantity (Kg)' },
      { key: 'chilledWaterPumpChemicalQtyKg', label: 'Chilled water pump chemical quantity (Kg)' },
      { key: 'coolingTowerFanChemicalQtyKg', label: 'Cooling tower fan chemical quantity (Kg)' },
    ];

    for (const field of optionalNumeric) {
      const rawValue = (formData as any)[field.key];
      if (!rawValue && rawValue !== 0) continue;
      const value = parseFloat(rawValue);
      if (Number.isNaN(value)) {
        toast.error(`${field.label} must be a numeric value.`);
        return false;
      }
      if (value < 0) {
        toast.error(`${field.label} cannot be negative.`);
        return false;
      }
    }

    return true;
  };

  const getTitle = () => {
    if (equipmentType) {
      return `${equipmentType.charAt(0).toUpperCase() + equipmentType.slice(1)} Log Book`;
    }
    return 'E Log Book';
  };

  const getSubtitle = () => {
    if (equipmentType) {
      return `Manage ${equipmentType} log entries`;
    }
    return 'Manual readings for Chillers and Boilers';
  };

  const getRecordingFrequencyFromEquipment = (equipment?: EquipmentOption): string => {
    if (!equipment?.log_entry_interval) return '';
    if (equipment.log_entry_interval === 'hourly') return 'Hourly';
    if (equipment.log_entry_interval === 'daily') return 'Daily';
    if (equipment.log_entry_interval === 'shift') {
      const shiftHours = equipment.shift_duration_hours ?? 8;
      return `Shift (${shiftHours}h)`;
    }
    return '';
  };

  const draftCount = useMemo(() => logs.filter((l) => l.status === 'draft').length, [logs]);
  const pendingCount = useMemo(
    () => logs.filter((l) => l.status === 'pending' || l.status === 'pending_secondary_approval').length,
    [logs],
  );
  const approvedCount = useMemo(() => logs.filter((l) => l.status === 'approved').length, [logs]);
  const rejectedCount = useMemo(() => logs.filter((l) => l.status === 'rejected').length, [logs]);

  return (
    <div className="min-h-screen">
      <Header
        title={getTitle()}
        subtitle={getSubtitle()}
      />
      <div className="px-6 pt-0">
        <EntryIntervalBadge />
      </div>

      {showMissedReadingPopup && (
        <MissedReadingPopup
          open={showMissedReadingPopup}
          onClose={() => { setShowMissedReadingPopup(false); setMissedReadingNextDue(null); setMissedEquipments(null); }}
          logTypeLabel="Chiller"
          nextDue={missedReadingNextDue ?? undefined}
          equipmentList={missedEquipments ?? undefined}
        />
      )}

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-2">
            {/* Filter Button */}
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="relative">
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
                    Filter E Log Book Entries
                  </DialogTitle>
                  <DialogDescription>
                    Filter entries by date range, status, equipment, checked by user, and time range.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Date Range */}
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

                  {/* Status */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Status</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
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

                  {/* Equipment Type filter not needed on chiller-only page */}

                  {/* Equipment ID - dropdown of approved chiller equipment */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Equipment ID</Label>
                    <Select
                      value={filters.equipmentId || 'all'}
                      onValueChange={(v) => setFilters({ ...filters, equipmentId: v === 'all' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {(equipmentByType.chiller ?? []).map((eq) => (
                          <SelectItem key={eq.id} value={eq.equipment_number}>
                            {eq.equipment_number}
                            {eq.name ? ` – ${eq.name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Checked By */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Checked By</Label>
                    <Select value={filters.checkedBy || 'all'} onValueChange={(v) => setFilters({ ...filters, checkedBy: v === 'all' ? '' : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {uniqueCheckedBy
                          .filter((user): user is string => Boolean(user && typeof user === 'string'))
                          .map((user) => (
                            <SelectItem key={user} value={user}>
                              {user}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Time Range */}
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

                {/* Action Buttons */}
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

            {/* New Entry Dialog */}
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  // Reset edit mode when dialog closes
                  setEditingLogId(null);
                  return;
                }
                // For new entries, auto-fill operator/verified fields.
                if (open && !editingLogId) {
                  const now = new Date();
                  const operatorLabel = user?.name || user?.email || 'Operator';
                  const verifierLabel = user?.name || user?.email || 'Supervisor';
                  setFormData((prev) => ({
                    ...prev,
                    operatorSign: `${operatorLabel} - ${format(now, 'dd/MM/yyyy HH:mm')}`,
                    verifiedBy: `${verifierLabel} - ${format(now, 'dd/MM/yyyy HH:mm')}`,
                  }));
                }
              }}
            >
            <DialogTrigger asChild>
              <Button
                variant="accent"
                onClick={() => setEditingLogId(null)}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New E Log Book Entry</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Digital Signature Info */}
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{format(new Date(), 'PPpp')}</p>
                    <p className="text-xs text-muted-foreground">Checked By: {user?.name || user?.email || 'Unknown'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Equipment Type *</Label>
                    <Select
                      value={formData.equipmentType}
                      onValueChange={(v) => {
                        setFormData({
                          ...formData,
                          equipmentType: v as 'chiller' | 'boiler' | 'compressor' | 'chemical',
                          equipmentId: '',
                          // Reset all fields when type changes
                          dailyWaterCt1Liters: '',
                          dailyWaterCt2Liters: '',
                          dailyWaterCt3Liters: '',
                          evapWaterInletPressure: '',
                          evapWaterOutletPressure: '',
                          evapEnteringWaterTemp: '',
                          evapLeavingWaterTemp: '',
                          evapApproachTemp: '',
                          condWaterInletPressure: '',
                          condWaterOutletPressure: '',
                          condEnteringWaterTemp: '',
                          condLeavingWaterTemp: '',
                          condApproachTemp: '',
                          chillerControlSignal: '',
                          avgMotorCurrent: '',
                          compressorRunningTimeMin: '',
                          starterEnergyKwh: '',
                          coolingTowerPumpStatus: '',
                          chilledWaterPumpStatus: '',
                          coolingTowerFanStatus: '',
                          coolingTowerBlowoffValveStatus: '',
                          coolingTowerChemicalName: '',
                          coolingTowerChemicalQtyPerDay: '',
                          recordingFrequency: '',
                          operatorSign: '',
                          verifiedBy: '',
                          feedWaterTemp: '',
                          oilTemp: '',
                          steamTemp: '',
                          steamPressure: '',
                          steamFlowLPH: '',
                          compressorSupplyTemp: '',
                          compressorReturnTemp: '',
                          compressorPressure: '',
                          compressorFlow: '',
                          equipmentName: '',
                          chemicalName: '',
                          solutionConcentration: '',
                          waterQty: '',
                          chemicalQty: '',
                        });
                        setCustomFormData({});
                      }}
                      disabled={!!equipmentType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chiller">Chiller</SelectItem>
                        <SelectItem value="boiler">Boiler</SelectItem>
                        <SelectItem value="chemical">Chemical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.equipmentType !== 'chemical' && (
                    <div className="space-y-2">
                      <Label>Equipment ID *</Label>
                        <Select
                          value={formData.equipmentId}
                          onValueChange={(v) => {
                            if (v === '__no_equipment__') return;
                            const options =
                              equipmentByType[formData.equipmentType as keyof typeof equipmentByType] ?? [];
                            const selectedEquipment = options.find((eq) => eq.equipment_number === v);
                            setFormData((prev) => ({
                              ...prev,
                              equipmentId: v,
                              recordingFrequency:
                                getRecordingFrequencyFromEquipment(selectedEquipment) || prev.recordingFrequency,
                            }));
                            if (formData.equipmentType === 'chiller') {
                              const dateKey = formData.date || format(new Date(), 'yyyy-MM-dd');
                              const firstLog = firstChillerLogByDate[dateKey];
                              if (firstLog) {
                                const initialPumps = decodePumpPair(
                                  firstLog.coolingTowerPumpStatus,
                                );
                                const initialChilled = decodePumpPair(
                                  firstLog.chilledWaterPumpStatus,
                                );
                                const initialFans = decodeFanTriple(
                                  firstLog.coolingTowerFanStatus,
                                );
                                setFormData((prev) => ({
                                  ...prev,
                                  coolingTowerPump1: initialPumps ? initialPumps.p1 : 'OFF',
                                  coolingTowerPump2: initialPumps ? initialPumps.p2 : 'OFF',
                                  chilledWaterPump1: initialChilled ? initialChilled.p1 : 'OFF',
                                  chilledWaterPump2: initialChilled ? initialChilled.p2 : 'OFF',
                                  coolingTowerFan1: initialFans ? initialFans.f1 : 'OFF',
                                  coolingTowerFan2: initialFans ? initialFans.f2 : 'OFF',
                                  coolingTowerFan3: initialFans ? initialFans.f3 : 'OFF',
                                  coolingTowerBlowoffValveStatus:
                                    firstLog.coolingTowerBlowoffValveStatus || '',
                                  coolingTowerBlowdownTimeMin:
                                    firstLog.coolingTowerBlowdownTimeMin != null
                                      ? String(firstLog.coolingTowerBlowdownTimeMin)
                                      : '',
                                  coolingTowerChemicalName:
                                    firstLog.coolingTowerChemicalName || '',
                                  coolingTowerChemicalQtyPerDay:
                                    firstLog.coolingTowerChemicalQtyPerDay !== undefined &&
                                    firstLog.coolingTowerChemicalQtyPerDay !== null
                                      ? String(firstLog.coolingTowerChemicalQtyPerDay)
                                      : '',
                                  chilledWaterPumpChemicalName:
                                    firstLog.chilledWaterPumpChemicalName || '',
                                  chilledWaterPumpChemicalQtyKg:
                                    firstLog.chilledWaterPumpChemicalQtyKg !== undefined &&
                                    firstLog.chilledWaterPumpChemicalQtyKg !== null
                                      ? String(firstLog.chilledWaterPumpChemicalQtyKg)
                                      : '',
                                  coolingTowerFanChemicalName:
                                    firstLog.coolingTowerFanChemicalName || '',
                                  coolingTowerFanChemicalQtyKg:
                                    firstLog.coolingTowerFanChemicalQtyKg !== undefined &&
                                    firstLog.coolingTowerFanChemicalQtyKg !== null
                                      ? String(firstLog.coolingTowerFanChemicalQtyKg)
                                      : '',
                                }));
                              }
                            }
                          }}
                          disabled={!formData.equipmentType}
                        >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ID" />
                        </SelectTrigger>
                        <SelectContent className="z-[100]" position="popper">
                          {formData.equipmentType &&
                            (() => {
                              const options = equipmentByType[formData.equipmentType as keyof typeof equipmentByType] ?? [];
                              if (options.length === 0) {
                                return (
                                  <SelectItem value="__no_equipment__" disabled className="text-muted-foreground">
                                    No equipment found. Add in Equipment Master.
                                  </SelectItem>
                                );
                              }
                              return options.map((eq) => (
                                <SelectItem key={eq.id} value={eq.equipment_number}>
                                  {eq.equipment_number}
                                  {eq.name ? ` – ${eq.name}` : ''}
                                </SelectItem>
                              ));
                            })()}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Previous readings for selected equipment with entered-by */}
                  {formData.equipmentId && formData.equipmentType !== 'chemical' && (
                    <div className="col-span-2 rounded-lg border bg-muted/30 p-3 space-y-2">
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
                              <span className="text-muted-foreground"> — Entered by: {log.checkedBy || '—'}</span>
                              <div className="mt-1 text-muted-foreground">
                                {formData.equipmentType === 'chiller' && (
                                  <>Chiller entry</>
                                )}
                                {formData.equipmentType === 'boiler' && (
                                  <>Feed {log.feedWaterTemp}°C · Steam {log.steamTemp}°C / {log.steamPressure} bar</>
                                )}
                                {formData.equipmentType === 'compressor' && (
                                  <>Supply {log.compressorSupplyTemp}°C · Return {log.compressorReturnTemp}°C</>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <MaintenanceTimingsSection value={maintenanceTimings} onChange={setMaintenanceTimings} />

                {/* Chiller Fields */}
                {formData.equipmentType === 'chiller' && (
                  <>
                    {/* Date and Time (editable when correcting a rejected or pending-secondary-approval entry) */}
                    {editingLogId && (() => {
                      const editingLog = logs.find((l) => l.id === editingLogId);
                      const canEditDateTime = editingLog && (editingLog.status === 'rejected' || editingLog.status === 'pending_secondary_approval');
                      return (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Date</Label>
                            <Input
                              type="date"
                              value={formData.date}
                              onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                              disabled={!canEditDateTime}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Time</Label>
                            <Input
                              type="time"
                              step="1"
                              value={formData.time}
                              onChange={(e) => setFormData((prev) => ({ ...prev, time: e.target.value }))}
                              disabled={!canEditDateTime}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>

                    {/* Evaporator section */}
                    <div className="mt-4 border-t pt-4 space-y-4">
                      <Label className="text-sm font-semibold">Evaporator</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Evap water inlet pressure
                            <span className="text-xs text-muted-foreground">
                              (NLT {equipmentLimits.chiller.evapWaterInletPressure.min}{' '}
                              {equipmentLimits.chiller.evapWaterInletPressure.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.evapWaterInletPressure}
                            onChange={(e) =>
                              setFormData({ ...formData, evapWaterInletPressure: e.target.value })
                            }
                            placeholder="e.g., 2.5"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'evapWaterInletPressure',
                              formData.evapWaterInletPressure
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'evapWaterInletPressure',
                            formData.evapWaterInletPressure,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'evapWaterInletPressure')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Evap water outlet pressure
                            <span className="text-xs text-muted-foreground">
                              (NLT {equipmentLimits.chiller.evapWaterOutletPressure.min}{' '}
                              {equipmentLimits.chiller.evapWaterOutletPressure.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.evapWaterOutletPressure}
                            onChange={(e) =>
                              setFormData({ ...formData, evapWaterOutletPressure: e.target.value })
                            }
                            placeholder="e.g., 2.0"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'evapWaterOutletPressure',
                              formData.evapWaterOutletPressure
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'evapWaterOutletPressure',
                            formData.evapWaterOutletPressure,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'evapWaterOutletPressure')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4" /> Evap entering water temp
                            <span className="text-xs text-muted-foreground">
                              (NMT {equipmentLimits.chiller.evapEnteringWaterTemp.max}{' '}
                              {equipmentLimits.chiller.evapEnteringWaterTemp.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.evapEnteringWaterTemp}
                            onChange={(e) =>
                              setFormData({ ...formData, evapEnteringWaterTemp: e.target.value })
                            }
                            placeholder="e.g., 18"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'evapEnteringWaterTemp',
                              formData.evapEnteringWaterTemp
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'evapEnteringWaterTemp',
                            formData.evapEnteringWaterTemp,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'evapEnteringWaterTemp')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4" /> Evap leaving water temp
                            <span className="text-xs text-muted-foreground">
                              (NMT {equipmentLimits.chiller.evapLeavingWaterTemp.max}{' '}
                              {equipmentLimits.chiller.evapLeavingWaterTemp.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.evapLeavingWaterTemp}
                            onChange={(e) =>
                              setFormData({ ...formData, evapLeavingWaterTemp: e.target.value })
                            }
                            placeholder="e.g., 13"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'evapLeavingWaterTemp',
                              formData.evapLeavingWaterTemp
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'evapLeavingWaterTemp',
                            formData.evapLeavingWaterTemp,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'evapLeavingWaterTemp')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Evap approach temp
                          <span className="text-xs text-muted-foreground">
                            (NMT {equipmentLimits.chiller.evapApproachTemp.max}{' '}
                            {equipmentLimits.chiller.evapApproachTemp.unit})
                          </span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.evapApproachTemp}
                          onChange={(e) =>
                            setFormData({ ...formData, evapApproachTemp: e.target.value })
                          }
                          placeholder="e.g., 4"
                          className={isFormValueOutOfLimit(
                            'chiller',
                            'evapApproachTemp',
                            formData.evapApproachTemp
                          )
                            ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                            : undefined}
                        />
                        {isFormValueOutOfLimit(
                          'chiller',
                          'evapApproachTemp',
                          formData.evapApproachTemp,
                        ) && (
                          <p className="text-xs text-destructive mt-1">
                            {getLimitErrorMessage('chiller', 'evapApproachTemp')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Condenser section */}
                    <div className="mt-4 border-t pt-4 space-y-4">
                      <Label className="text-sm font-semibold">Condenser</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Cond water inlet pressure
                            <span className="text-xs text-muted-foreground">
                              (NLT {equipmentLimits.chiller.condWaterInletPressure.min}{' '}
                              {equipmentLimits.chiller.condWaterInletPressure.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.condWaterInletPressure}
                            onChange={(e) =>
                              setFormData({ ...formData, condWaterInletPressure: e.target.value })
                            }
                            placeholder="e.g., 1.5"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'condWaterInletPressure',
                              formData.condWaterInletPressure
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'condWaterInletPressure',
                            formData.condWaterInletPressure,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'condWaterInletPressure')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Cond water outlet pressure
                            <span className="text-xs text-muted-foreground">
                              (NLT {equipmentLimits.chiller.condWaterOutletPressure.min}{' '}
                              {equipmentLimits.chiller.condWaterOutletPressure.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.condWaterOutletPressure}
                            onChange={(e) =>
                              setFormData({ ...formData, condWaterOutletPressure: e.target.value })
                            }
                            placeholder="e.g., 1.0"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'condWaterOutletPressure',
                              formData.condWaterOutletPressure
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'condWaterOutletPressure',
                            formData.condWaterOutletPressure,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'condWaterOutletPressure')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4" /> Cond entering water temp
                            <span className="text-xs text-muted-foreground">
                              (NMT {equipmentLimits.chiller.condEnteringWaterTemp.max}{' '}
                              {equipmentLimits.chiller.condEnteringWaterTemp.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.condEnteringWaterTemp}
                            onChange={(e) =>
                              setFormData({ ...formData, condEnteringWaterTemp: e.target.value })
                            }
                            placeholder="e.g., 35"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'condEnteringWaterTemp',
                              formData.condEnteringWaterTemp
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'condEnteringWaterTemp',
                            formData.condEnteringWaterTemp,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'condEnteringWaterTemp')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4" /> Cond leaving water temp
                            <span className="text-xs text-muted-foreground">
                              (NMT {equipmentLimits.chiller.condLeavingWaterTemp.max}{' '}
                              {equipmentLimits.chiller.condLeavingWaterTemp.unit})
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.condLeavingWaterTemp}
                            onChange={(e) =>
                              setFormData({ ...formData, condLeavingWaterTemp: e.target.value })
                            }
                            placeholder="e.g., 40"
                            className={isFormValueOutOfLimit(
                              'chiller',
                              'condLeavingWaterTemp',
                              formData.condLeavingWaterTemp
                            )
                              ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                              : undefined}
                          />
                          {isFormValueOutOfLimit(
                            'chiller',
                            'condLeavingWaterTemp',
                            formData.condLeavingWaterTemp,
                          ) && (
                            <p className="text-xs text-destructive mt-1">
                              {getLimitErrorMessage('chiller', 'condLeavingWaterTemp')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Cond approach temp
                          <span className="text-xs text-muted-foreground">
                            (NMT {equipmentLimits.chiller.condApproachTemp.max}{' '}
                            {equipmentLimits.chiller.condApproachTemp.unit})
                          </span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.condApproachTemp}
                          onChange={(e) =>
                            setFormData({ ...formData, condApproachTemp: e.target.value })
                          }
                          placeholder="e.g., 6"
                          className={isFormValueOutOfLimit(
                            'chiller',
                            'condApproachTemp',
                            formData.condApproachTemp
                          )
                            ? 'border-destructive bg-destructive/5 text-destructive font-semibold'
                            : undefined}
                        />
                        {isFormValueOutOfLimit(
                          'chiller',
                          'condApproachTemp',
                          formData.condApproachTemp,
                        ) && (
                          <p className="text-xs text-destructive mt-1">
                            {getLimitErrorMessage('chiller', 'condApproachTemp')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Compressor / electrical section */}
                    <div className="mt-4 border-t pt-4 space-y-4">
                      <Label className="text-sm font-semibold">Compressor / Electrical</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Chiller control signal (%)
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.chillerControlSignal}
                            onChange={(e) =>
                              setFormData({ ...formData, chillerControlSignal: e.target.value })
                            }
                            placeholder="e.g., 75"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Average motor current (A)
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.avgMotorCurrent}
                            onChange={(e) =>
                              setFormData({ ...formData, avgMotorCurrent: e.target.value })
                            }
                            placeholder="e.g., 85"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Compressor running time (min)
                          </Label>
                          <Input
                            type="number"
                            step="1"
                            value={formData.compressorRunningTimeMin}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                compressorRunningTimeMin: e.target.value,
                              })
                            }
                            placeholder="e.g., 60"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Gauge className="w-4 h-4" /> Starter energy consumption (kWh)
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.starterEnergyKwh}
                            onChange={(e) =>
                              setFormData({ ...formData, starterEnergyKwh: e.target.value })
                            }
                            placeholder="e.g., 120"
                          />
                        </div>
                      </div>

                    </div>

                    {/* Operator Sign & Date - full width block after make up water flow */}
                    <div className="mt-6 space-y-2">
                      <Label>Operator Sign & Date</Label>
                      <Input
                        type="text"
                        value={formData.operatorSign}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            operatorSign: e.target.value,
                          })
                        }
                        placeholder="e.g., Operator name & date"
                        className="border-2 border-primary bg-primary/5 font-semibold"
                      />
                    </div>

                    {/* Footer Section - equipment status and chemicals */}
                    <div className="border-t pt-4 mt-2 space-y-4">
                      {!canEditRunningSection && (
                        <p className="text-sm text-muted-foreground">
                          Pump/fan running status, blow down time and chemical quantities are set by your first
                          reading of the day. Subsequent entries can view but cannot change these values.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Cooling Tower-1</Label>
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Pump 1:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerPump1 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerPump1: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerPump1 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerPump1: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Pump 2:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerPump2 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerPump2: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerPump2 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerPump2: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Chilled Water Pump</Label>
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Pump 1:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.chilledWaterPump1 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      chilledWaterPump1: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.chilledWaterPump1 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      chilledWaterPump1: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Pump 2:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.chilledWaterPump2 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      chilledWaterPump2: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.chilledWaterPump2 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      chilledWaterPump2: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Cooling Tower Fan</Label>
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Fan 1:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan1 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan1: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan1 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan1: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Fan 2:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan2 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan2: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan2 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan2: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Fan 3:</span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan3 === 'ON'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan3: 'ON',
                                    }))
                                  }
                                >
                                  ON
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    formData.coolingTowerFan3 === 'OFF'
                                      ? 'default'
                                      : 'outline'
                                  }
                                  disabled={!canEditRunningSection}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      coolingTowerFan3: 'OFF',
                                    }))
                                  }
                                >
                                  OFF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Cooling Tower Blow Down Time (Minutes)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={formData.coolingTowerBlowdownTimeMin}
                            disabled={!canEditRunningSection}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                coolingTowerBlowdownTimeMin: e.target.value,
                              })
                            }
                            placeholder="e.g., 30"
                          />
                        </div>
                      </div>

                      {/* Summary display for running pumps and fans */}
                      <div className="pt-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-semibold">Running Pumps:</span>{' '}
                          {[
                            formData.coolingTowerPump1,
                            formData.coolingTowerPump2,
                            formData.chilledWaterPump1,
                            formData.chilledWaterPump2,
                          ].filter((s) => s === 'ON').length}
                        </div>
                        <div>
                          <span className="font-semibold">Running Fans:</span>{' '}
                          {[
                            formData.coolingTowerFan1,
                            formData.coolingTowerFan2,
                            formData.coolingTowerFan3,
                          ].filter((s) => s === 'ON').length}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="space-y-2">
                          <Label>Recording Frequency</Label>
                          <Input
                            type="text"
                            value={formData.recordingFrequency}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                recordingFrequency: e.target.value,
                              })
                            }
                            placeholder="e.g., Once in 4 hours"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Verified By (Sign & Date)</Label>
                          <Input
                            type="text"
                            value={formData.verifiedBy}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                verifiedBy: e.target.value,
                              })
                            }
                            placeholder="e.g., Supervisor name & date"
                          />
                        </div>
                      </div>
                    </div>
                  </fieldset>
                  </>
                )}

                {/* Boiler Fields */}
                {formData.equipmentType === 'boiler' && (
                  <>
                    <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Feed water temp
                          <span className="text-xs text-muted-foreground">(NLT {equipmentLimits.boiler.feedWaterTemp.min} {equipmentLimits.boiler.feedWaterTemp.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.feedWaterTemp}
                          onChange={(e) => setFormData({ ...formData, feedWaterTemp: e.target.value })}
                          placeholder="e.g., 50"
                          className={cn(isFormValueOutOfLimit('boiler', 'feedWaterTemp' as keyof (typeof equipmentLimits)['chiller'], formData.feedWaterTemp) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('boiler', 'feedWaterTemp' as keyof (typeof equipmentLimits)['chiller'], formData.feedWaterTemp) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('boiler', 'feedWaterTemp' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Oil temp
                          <span className="text-xs text-muted-foreground">(NLT {equipmentLimits.boiler.oilTemp.min} {equipmentLimits.boiler.oilTemp.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.oilTemp}
                          onChange={(e) => setFormData({ ...formData, oilTemp: e.target.value })}
                          placeholder="e.g., 50"
                          className={cn(isFormValueOutOfLimit('boiler', 'oilTemp' as keyof (typeof equipmentLimits)['chiller'], formData.oilTemp) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('boiler', 'oilTemp' as keyof (typeof equipmentLimits)['chiller'], formData.oilTemp) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('boiler', 'oilTemp' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Steam temp
                          <span className="text-xs text-muted-foreground">(NLT {equipmentLimits.boiler.steamTemp.min} {equipmentLimits.boiler.steamTemp.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamTemp}
                          onChange={(e) => setFormData({ ...formData, steamTemp: e.target.value })}
                          placeholder="e.g., 150"
                          className={cn(isFormValueOutOfLimit('boiler', 'steamTemp' as keyof (typeof equipmentLimits)['chiller'], formData.steamTemp) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('boiler', 'steamTemp' as keyof (typeof equipmentLimits)['chiller'], formData.steamTemp) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('boiler', 'steamTemp' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Gauge className="w-4 h-4" /> Steam Pressure
                          <span className="text-xs text-muted-foreground">(NLT {equipmentLimits.boiler.steamPressure.min} {equipmentLimits.boiler.steamPressure.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.steamPressure}
                          onChange={(e) => setFormData({ ...formData, steamPressure: e.target.value })}
                          placeholder="e.g., 6"
                          className={cn(isFormValueOutOfLimit('boiler', 'steamPressure' as keyof (typeof equipmentLimits)['chiller'], formData.steamPressure) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('boiler', 'steamPressure' as keyof (typeof equipmentLimits)['chiller'], formData.steamPressure) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('boiler', 'steamPressure' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Steam Flow LPH</Label>
                      <Input
                        type="number"
                        step="1"
                        value={formData.steamFlowLPH}
                        onChange={(e) => setFormData({ ...formData, steamFlowLPH: e.target.value })}
                        placeholder="e.g., 10000"
                      />
                    </div>
                    </fieldset>
                  </>
                )}

                {/* Compressor Fields */}
                {formData.equipmentType === 'compressor' && (
                  <>
                    <fieldset disabled={!isReadingsApplicable} className={cn(!isReadingsApplicable && "opacity-60")}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Compressor supply temp
                          <span className="text-xs text-muted-foreground">(NMT {equipmentLimits.compressor.compressorSupplyTemp.max} {equipmentLimits.compressor.compressorSupplyTemp.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.compressorSupplyTemp}
                          onChange={(e) => setFormData({ ...formData, compressorSupplyTemp: e.target.value })}
                          placeholder="e.g., 10"
                          className={cn(isFormValueOutOfLimit('compressor', 'compressorSupplyTemp' as keyof (typeof equipmentLimits)['chiller'], formData.compressorSupplyTemp) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('compressor', 'compressorSupplyTemp' as keyof (typeof equipmentLimits)['chiller'], formData.compressorSupplyTemp) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('compressor', 'compressorSupplyTemp' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4" /> Compressor return temp
                          <span className="text-xs text-muted-foreground">(NMT {equipmentLimits.compressor.compressorReturnTemp.max} {equipmentLimits.compressor.compressorReturnTemp.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.compressorReturnTemp}
                          onChange={(e) => setFormData({ ...formData, compressorReturnTemp: e.target.value })}
                          placeholder="e.g., 20"
                          className={cn(isFormValueOutOfLimit('compressor', 'compressorReturnTemp' as keyof (typeof equipmentLimits)['chiller'], formData.compressorReturnTemp) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('compressor', 'compressorReturnTemp' as keyof (typeof equipmentLimits)['chiller'], formData.compressorReturnTemp) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('compressor', 'compressorReturnTemp' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Gauge className="w-4 h-4" /> Compressor pressure
                          <span className="text-xs text-muted-foreground">(NLT {equipmentLimits.compressor.compressorPressure.min} {equipmentLimits.compressor.compressorPressure.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.compressorPressure}
                          onChange={(e) => setFormData({ ...formData, compressorPressure: e.target.value })}
                          placeholder="e.g., 5"
                          className={cn(isFormValueOutOfLimit('compressor', 'compressorPressure' as keyof (typeof equipmentLimits)['chiller'], formData.compressorPressure) && 'border-destructive bg-destructive/5 text-destructive font-semibold')}
                        />
                        {isFormValueOutOfLimit('compressor', 'compressorPressure' as keyof (typeof equipmentLimits)['chiller'], formData.compressorPressure) && (
                          <p className="text-xs text-destructive mt-1">{getLimitErrorMessage('compressor', 'compressorPressure' as keyof (typeof equipmentLimits)['chiller'])}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Droplets className="w-4 h-4" /> Compressor flow (L/min)
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.compressorFlow}
                          onChange={(e) => setFormData({ ...formData, compressorFlow: e.target.value })}
                          placeholder="e.g., 100"
                        />
                      </div>
                    </div>
                    </fieldset>
                  </>
                )}

                {/* Chemical Fields */}
                {formData.equipmentType === 'chemical' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>EqP Name *</Label>
                        <Select
                          value={formData.equipmentName}
                          onValueChange={(v) => setFormData({ ...formData, equipmentName: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select equipment" />
                          </SelectTrigger>
                          <SelectContent>
                            {CHEMICAL_EQUIPMENT_NAMES.map((eq) => (
                              <SelectItem key={eq} value={eq}>
                                {eq}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                    <div className="space-y-2">
                      <Label>Chemical name *</Label>
                      <Select
                        value={formData.chemicalName}
                        onValueChange={(v) => setFormData({ ...formData, chemicalName: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select chemical" />
                        </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                          {chemicalOptions.map((chem) => (
                            <SelectItem key={chem.id} value={chem.label}>
                              {chem.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Solution concentration % *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={formData.solutionConcentration}
                          onChange={(e) => setFormData({ ...formData, solutionConcentration: e.target.value })}
                          placeholder="e.g., 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Water Qty (L) *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={formData.waterQty}
                          onChange={(e) => setFormData({ ...formData, waterQty: e.target.value })}
                          placeholder="e.g., 5"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Chemical Qty (G) *</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.chemicalQty}
                        onChange={(e) => setFormData({ ...formData, chemicalQty: e.target.value })}
                        placeholder="e.g., 100"
                      />
                    </div>
                  </>
                )}

                {/* Custom Logbook Fields */}
                {selectedSchema && formData.equipmentType?.startsWith('custom_') && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold text-lg">{selectedSchema.name}</h3>
                    {selectedSchema.description && (
                      <p className="text-sm text-muted-foreground">{selectedSchema.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {selectedSchema.fields
                        .filter(field => !field.display?.hidden)
                        .sort((a, b) => (a.display?.order || 0) - (b.display?.order || 0))
                        .map((field) => {
                          const columnSpan = field.display?.columnSpan || 1;
                          return (
                            <div
                              key={field.id}
                              className={columnSpan === 2 ? 'col-span-2' : ''}
                            >
                              <FieldWithValidation
                                field={field}
                                value={customFormData[field.id] || ''}
                                onChange={(value) => {
                                  setCustomFormData({
                                    ...customFormData,
                                    [field.id]: value,
                                  });
                                }}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    placeholder="Add any observations or notes..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent">
                    <Save className="w-4 h-4 mr-2" />
                    Save Entry
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Logs Table - horizontal scroll when wide */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="border-b px-4 py-2 flex justify-between items-center">
            {/** On the chiller page, only show chiller entries in the table/counts */}
            {(() => {
              const pageLogs = filteredLogs.filter((log) => log.equipmentType === 'chiller');
              return (
                <span className="text-sm font-medium">{pageLogs.length} entries</span>
              );
            })()}
            {selectedLogIds.length > 0 && user?.role !== 'operator' && (
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
            <table className="min-w-full text-sm" style={{ minWidth: '1320px' }}>
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold w-12">
                    {approvablePendingIds.length > 0 && user?.role !== 'operator' && (
                      <Checkbox
                        checked={allPendingSelected}
                        onCheckedChange={handleSelectAllPending}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold w-[110px]">Date</th>
                  <th className="px-3 py-2 text-left font-semibold w-[100px]">Time</th>
                  <th className="px-3 py-2 text-left font-semibold w-[150px]">Equipment</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[140px]">Readings</th>
                  <th className="px-3 py-2 text-center font-semibold min-w-[140px]">Remarks</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[170px]">Comment</th>
                  <th className="px-3 py-2 text-left font-semibold w-[140px]">Checked By</th>
                  <th className="px-3 py-2 text-left font-semibold w-[110px]">Status</th>
                  <th className="px-3 py-2 text-left font-semibold w-[140px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm">Loading entries...</p>
                    </td>
                  </tr>
                ) : filteredLogs.filter((log) => log.equipmentType === 'chiller').length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm">
                        {activeFilterCount > 0 
                          ? 'No records found matching the selected filters'
                          : 'No E Log Book entries found'}
                      </p>
                      <p className="text-xs mt-1">
                        {activeFilterCount > 0 
                          ? 'Try adjusting your filters or clear them to see all entries'
                          : 'Create a new entry to get started'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs
                    .filter((log) => log.equipmentType === 'chiller')
                    .map((log) => {
                    const tolClass =
                      log.tolerance_status === 'outside'
                        ? 'bg-red-50/80'
                        : '';
                    return (
                    <tr key={log.id} className={cn(tolClass, "hover:bg-muted/30 transition-colors")}>
                      <td className="px-4 py-3 align-middle">
                        {(log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval') &&
                        user?.role !== 'operator' &&
                        log.operator_id !== user?.id &&
                        !(log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id) ? (
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
                        <div>
                          <p className="text-sm font-medium text-foreground capitalize">
                            {log.equipmentType?.startsWith('custom_') 
                              ? logbookSchemas.find(s => s.id === log.schemaId)?.name || 'Custom Logbook'
                              : log.equipmentType}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">{log.equipmentId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleViewReadingsClick(log.id)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" />
                          View Readings
                        </Button>
                      </td>
                      <td className="px-4 py-3 max-w-xs min-w-[170px] align-middle text-center">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-snug line-clamp-3 inline-block text-left">
                          {log.remarks || '-'}
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
                              setEditingCommentValue(log.comment ?? '');
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
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              log.has_corrections && !log.corrects_id
                                ? 'destructive'
                                : log.status === 'approved'
                                ? 'success'
                                : log.status === 'rejected'
                                ? 'destructive'
                                : log.status === 'pending' || log.status === 'pending_secondary_approval'
                                ? 'warning'
                                : 'outline'
                            }
                          >
                            {log.has_corrections && !log.corrects_id
                              ? 'Rejected'
                              : log.status === 'approved'
                              ? 'Approved'
                              : log.status === 'pending_secondary_approval' || log.status === 'pending'
                              ? 'Pending'
                              : log.status === 'rejected'
                              ? 'Rejected'
                              : log.status === 'draft'
                              ? 'Draft'
                              : log.status}
                          </Badge>
                          {log.corrects_id && (
                            <span className={log.status === 'approved' ? 'text-[10px] text-emerald-700 whitespace-nowrap' : 'text-[10px] text-amber-700 whitespace-nowrap'}>
                              {log.status === 'approved' ? 'Approved correction entry' : 'Correction entry'}
                            </span>
                          )}
                          {log.has_corrections && !log.corrects_id && (
                            <span className="text-[10px] text-emerald-700 whitespace-nowrap">Has corrections</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user?.role !== 'operator' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-7 w-7',
                                  (log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval') &&
                                  !(log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id)
                                    ? 'text-green-600 hover:text-green-700 hover:bg-green-500/10'
                                    : 'opacity-40 cursor-not-allowed'
                                )}
                                title={
                                  log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id
                                    ? 'A different person must approve this corrected entry.'
                                    : (log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval'
                                        ? 'Approve'
                                        : 'Approved')
                                }
                                onClick={() => {
                                  if (log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval') {
                                    if (log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id) {
                                      toast.error('A different person must approve this corrected entry.');
                                      return;
                                    }
                                    if (log.operator_id === user?.id) {
                                      toast.error('The log book entry must be approved by a different user than the operator (Log Book Done By).');
                                      return;
                                    }
                                    handleApproveClick(log.id);
                                  }
                                }}
                                disabled={
                                  (log.status !== 'pending' && log.status !== 'draft' && log.status !== 'pending_secondary_approval') ||
                                  (log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id)
                                }
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-7 w-7',
                                  (log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval')
                                    ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
                                    : 'opacity-40 cursor-not-allowed'
                                )}
                                title={log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval' ? 'Reject' : 'Rejected'}
                                onClick={() => {
                                  if (log.status === 'pending' || log.status === 'draft' || log.status === 'pending_secondary_approval') handleRejectClick(log.id);
                                }}
                                disabled={log.status !== 'pending' && log.status !== 'draft' && log.status !== 'pending_secondary_approval'}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-7 w-7',
                                  (log.status === 'rejected' || log.status === 'pending_secondary_approval')
                                    ? ''
                                    : 'opacity-40 cursor-not-allowed'
                                )}
                                title={log.status === 'rejected' || log.status === 'pending_secondary_approval' ? 'Edit entry' : 'Edit only available after reject'}
                                onClick={() => {
                                  if (log.status === 'rejected' || log.status === 'pending_secondary_approval') handleEditLog(log);
                                }}
                                disabled={log.status !== 'rejected' && log.status !== 'pending_secondary_approval'}
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
                                  to={`/reports?tab=audit-trail&object_type=chiller_log&object_id=${log.id}`}
                                >
                                  <History className="w-4 h-4" />
                                </Link>
                              </Button>
                            </>
                          )}
                          {user?.role === 'super_admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(log.id)}
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
                    {log.equipmentType?.startsWith('custom_') ? 'Custom' : log.equipmentType} · {log.equipmentId} · {log.date} {log.time}
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
                    'flex justify-between items-center gap-4 py-2.5 px-3 rounded-lg text-sm transition-colors',
                    isOut ? 'bg-destructive/10 text-destructive font-semibold' : 'hover:bg-muted/40'
                  )}
                >
                  <span className="font-medium text-muted-foreground">{label}</span>
                  <span className={cn('tabular-nums', isOut && 'font-semibold')}>{value}</span>
                </div>
              );
              const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
                <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    {title}
                  </h4>
                  <div className="space-y-0.5">{children}</div>
                </div>
              );
              if (log.equipmentType?.startsWith('custom_') && log.customFields && logbookSchemas.find((s) => s.id === log.schemaId)) {
                const schema = logbookSchemas.find((s) => s.id === log.schemaId)!;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SectionCard title="Custom fields" icon={Package}>
                      {schema.fields.filter((f) => !f.display?.hidden).map((field) => {
                        const value = log.customFields?.[field.id];
                        if (value === undefined || value === null || value === '') return null;
                        let display: string | number = value;
                        if (field.type === 'number' && field.metadata?.limit?.unit) display = `${value} ${field.metadata.limit.unit}`;
                        else if (field.type === 'boolean') display = value ? 'Yes' : 'No';
                        else if (field.type === 'date' || field.type === 'datetime') display = format(new Date(value), 'yyyy-MM-dd HH:mm');
                        const isOut = field.metadata?.limit && field.type === 'number' && ((field.metadata.limit.type === 'max' && parseFloat(value) > field.metadata.limit.value) || (field.metadata.limit.type === 'min' && parseFloat(value) < field.metadata.limit.value));
                        return <div key={field.id} className={cn('flex justify-between items-center gap-4 py-2.5 px-3 rounded-lg text-sm', isOut ? 'bg-destructive/10 text-destructive font-semibold' : 'hover:bg-muted/40')}><span className="font-medium text-muted-foreground">{field.label}</span><span>{String(display)}</span></div>;
                      })}
                    </SectionCard>
                  </div>
                );
              }
              if (log.equipmentType === 'chiller') {
                const tempKeys = ['evapEnteringWaterTemp', 'evapLeavingWaterTemp', 'evapApproachTemp', 'condEnteringWaterTemp', 'condLeavingWaterTemp', 'condApproachTemp'];
                const pressureKeys = ['evapWaterInletPressure', 'evapWaterOutletPressure', 'condWaterInletPressure', 'condWaterOutletPressure'];
                const flowKeys: string[] = [];
                const electricalKeys = ['chillerControlSignal', 'avgMotorCurrent', 'compressorRunningTimeMin', 'starterEnergyKwh'];
                const otherKeys = ['coolingTowerBlowdownTimeMin', 'coolingTowerChemicalQtyPerDay', 'chilledWaterPumpChemicalQtyKg', 'coolingTowerFanChemicalQtyKg'];
                const section = (title: string, keys: string[]) => {
                  const fields = CHILLER_LIST_FIELDS.filter((f) => keys.includes(f.key));
                  const items = fields.map(({ key, label, unit }) => {
                    const value = logRecord[key];
                    if (value === undefined || value === null) return null;
                    const numVal = typeof value === 'number' ? value : undefined;
                    const isOut = numVal !== undefined && isValueOutOfLimit(log, key as string, numVal);
                    const display = unit ? `${value} ${unit}`.trim() : String(value);
                    return renderItem(label, display, isOut);
                  }).filter(Boolean);
                  if (items.length === 0) return null;
                  return <SectionCard key={title} title={title} icon={title === 'Temperature' ? Thermometer : title === 'Pressure' ? Gauge : title === 'Flow' ? Droplets : title === 'Electrical & Energy' ? Zap : Package}>{items}</SectionCard>;
                };
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {section('Temperature', tempKeys)}
                    {section('Pressure', pressureKeys)}
                    {section('Flow', flowKeys)}
                    {section('Electrical & Energy', electricalKeys)}
                    {section('Other', otherKeys)}
                  </div>
                );
              }
              if (log.equipmentType === 'boiler') {
                const tempKeys = ['feedWaterTemp', 'oilTemp', 'steamTemp', 'foPreHeaterTemp', 'burnerHeaterTemp', 'stackTemperature'];
                const pressureKeys = ['steamPressure', 'burnerOilPressure', 'boilerSteamPressure', 'steamPressureAfterPrv'];
                const flowKeys = ['steamFlowLPH'];
                const otherKeys = ['foHsdNgDayTankLevel', 'feedWaterTankLevel', 'feedWaterHardnessPpm', 'feedWaterTdsPpm', 'foHsdNgConsumption', 'mobreyFunctioning', 'manualBlowdownTime'];
                const section = (title: string, keys: string[]) => {
                  const items = BOILER_LIST_FIELDS.filter((f) => keys.includes(f.key)).map(({ key, label, unit }) => {
                    const value = logRecord[key];
                    if (value === undefined || value === null) return null;
                    const numVal = typeof value === 'number' ? value : undefined;
                    const isOut = numVal !== undefined && isValueOutOfLimit(log, key as string, numVal);
                    const display = unit ? `${value} ${unit}`.trim() : String(value);
                    return renderItem(label, display, isOut);
                  }).filter(Boolean);
                  if (items.length === 0) return null;
                  return <SectionCard key={title} title={title} icon={title === 'Temperature' ? Thermometer : title === 'Pressure' ? Gauge : title === 'Flow' ? Droplets : Package}>{items}</SectionCard>;
                };
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {section('Temperature', tempKeys)}
                    {section('Pressure', pressureKeys)}
                    {section('Flow', flowKeys)}
                    {section('Other', otherKeys)}
                  </div>
                );
              }
              if (log.equipmentType === 'compressor') {
                const items = COMPRESSOR_LIST_FIELDS.map(({ key, label, unit }) => {
                  const value = logRecord[key];
                  if (value === undefined || value === null) return null;
                  const numVal = typeof value === 'number' ? value : undefined;
                  const isOut = numVal !== undefined && isValueOutOfLimit(log, key as string, numVal);
                  const display = unit ? `${value} ${unit}`.trim() : String(value);
                  return renderItem(label, display, isOut);
                }).filter(Boolean);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SectionCard title="Compressor" icon={Gauge}>{items}</SectionCard>
                  </div>
                );
              }
              if (log.equipmentType === 'chemical') {
                const items = [
                  log.equipmentName && renderItem('Equipment', log.equipmentName),
                  log.chemicalName && renderItem('Chemical', log.chemicalName),
                  log.chemicalPercent != null && renderItem('Chemical %', `${log.chemicalPercent}%`),
                  log.solutionConcentration != null && renderItem('Conc', `${log.solutionConcentration}%`),
                  log.waterQty != null && renderItem('Water', `${log.waterQty} L`),
                  log.chemicalQty != null && renderItem('Qty', `${log.chemicalQty} G`),
                ].filter(Boolean);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SectionCard title="Chemical" icon={Package}>{items}</SectionCard>
                  </div>
                );
              }
              return null;
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
                ? 'Are you sure you want to approve this entry? This action cannot be undone.'
                : `Are you sure you want to approve these ${selectedLogIds.length} entries? This action cannot be undone.`}
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
            setApprovalComment('');
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
              <Label htmlFor="approval-comment">Comment <span className="text-destructive">*</span></Label>
              <Textarea
                id="approval-comment"
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
                  setApprovalComment('');
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
                    toast.error('Comment is required for approval');
                    return;
                  }
                  const ids = [...selectedLogIds].filter((id) => {
                    const log = logs.find((l) => l.id === id);
                    if (!log) return false;
                    if (log.operator_id === user?.id) return false;
                    if (log.status === 'pending_secondary_approval' && log.approved_by_id === user?.id) return false;
                    return true;
                  });
                  const notViewedIds = ids.filter((id) => {
                    const log = logs.find((l) => l.id === id);
                    if (!log) return false;
                    const requiresReadingsBeforeApprove =
                      log.equipmentType === 'chiller' || log.equipmentType === 'boiler' || log.equipmentType === 'chemical';
                    return requiresReadingsBeforeApprove && !viewedReadingsLogIds.has(id);
                  });
                  if (notViewedIds.length > 0) {
                    toast.error(
                      `Please click View Readings before approval for ${notViewedIds.length} selected entr${notViewedIds.length === 1 ? 'y' : 'ies'}.`
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
                      if (!log) continue;
                      if (log.equipmentType === 'chemical') {
                        await chemicalPrepAPI.approve(id, 'approve', comment);
                      } else if (log.equipmentType === 'boiler') {
                        await boilerLogAPI.approve(id, 'approve', comment);
                      } else if (log.equipmentType === 'chiller') {
                        await chillerLogAPI.approve(id, 'approve', comment);
                      } else if (log.equipmentType === 'compressor') {
                        await compressorLogAPI.approve(id, 'approve', comment);
                      }
                    }
                    setApproveCommentOpen(false);
                    setApprovalComment('');
                    setSelectedLogIds([]);
                    await refreshLogs();
                    toast.success(`${ids.length} entries approved successfully.`);
                  } catch (error: any) {
                    console.error('Error approving entries:', error);
                    toast.error(error?.response?.data?.error || error?.message || 'Failed to approve some entries');
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
              Are you sure you want to reject this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRejectConfirmOpen(false);
                setRejectCommentOpen(true);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
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
            setRejectComment('');
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
                  setRejectComment('');
                  setSelectedLogId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  const comment = rejectComment.trim();
                  if (!comment) {
                    toast.error('Comment is required for rejection');
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
    </div>
  );
}
