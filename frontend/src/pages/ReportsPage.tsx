import React, { useState, useEffect, useCallback } from 'react';
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
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  downloadPDF,
  printPDF,
} from '@/lib/pdf-generator';
import {
  reportsAPI,
  chemicalPrepAPI,
  chillerLogAPI,
  boilerLogAPI,
  compressorLogAPI,
  hvacValidationAPI,
  testCertificateAPI,
} from '@/lib/api';

interface Report {
  id: string;
  type: 'utility' | 'chemical' | 'validation' | 'air_velocity' | 'filter_integrity' | 'recovery' | 'differential_pressure' | 'nvpc';
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

// TODO: Replace with API call to fetch reports
const typeIcons = {
  utility: FileText,
  chemical: FileText,
  validation: FileText,
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
  air_velocity: 'Air Velocity Test',
  filter_integrity: 'Filter Integrity Test',
  recovery: 'Recovery Test',
  differential_pressure: 'Differential Pressure Test',
  nvpc: 'NVPC Test',
};

export default function ReportsPage() {
  const { user } = useAuth();
  
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
          approvedBy: report.approved_by_name || undefined,
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

  const isSupervisor = user?.role === 'supervisor' || user?.role === 'super_admin';
  const isCustomer = user?.role === 'customer';

  const filteredReports = reports.filter(report => {
    // Only show approved reports
    if (report.status !== 'approved') return false;
    
    const matchesType = filterType === 'all' || report.type === filterType;
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesType && matchesSearch;
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

  // Load reports from API on mount and refresh periodically
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
    const { sourceId, sourceTable } = report.originalData || {};
    if (!sourceId || !sourceTable) return null;

    try {
      // Map source table names to API functions
      const apiMap: Record<string, (id: string) => Promise<any>> = {
        'chiller_logs': (id) => chillerLogAPI.get(id),
        'boiler_logs': (id) => boilerLogAPI.get(id),
        'compressor_logs': (id) => compressorLogAPI.get(id),
        'chemical_preparations': (id) => chemicalPrepAPI.get(id),
        'hvac_validations': (id) => hvacValidationAPI.get(id),
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
    // Fetch full data from original source
    const log = await fetchFullReportData(report);
    if (!log) {
      toast.error('Failed to load report data');
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
    
    // For utility reports (chiller, boiler, chemical), generate PDF with all logs
    if (report.type === 'utility' && log) {
      try {
        // Fetch all logs of the same equipment type from API
        let allLogs: any[] = [];
        
        if (log.equipmentType === 'chiller') {
          const chillerLogs = await chillerLogAPI.list();
          allLogs = chillerLogs.map((l: any) => ({
            id: l.id,
            equipmentType: 'chiller',
            equipmentId: l.equipment_id,
            chillerSupplyTemp: l.chiller_supply_temp,
            chillerReturnTemp: l.chiller_return_temp,
            coolingTowerSupplyTemp: l.cooling_tower_supply_temp,
            coolingTowerReturnTemp: l.cooling_tower_return_temp,
            ctDifferentialTemp: l.ct_differential_temp,
            chillerWaterInletPressure: l.chiller_water_inlet_pressure,
            chillerMakeupWaterFlow: l.chiller_makeup_water_flow,
            remarks: l.remarks,
            checkedBy: l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateChillerMonitoringPDF({ logs: allLogs });
          downloadPDF(blob, 'Chiller Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        } else if (log.equipmentType === 'boiler') {
          const boilerLogs = await boilerLogAPI.list();
          allLogs = boilerLogs.map((l: any) => ({
            id: l.id,
            equipmentType: 'boiler',
            equipmentId: l.equipment_id,
            feedWaterTemp: l.feed_water_temp,
            oilTemp: l.oil_temp,
            steamTemp: l.steam_temp,
            steamPressure: l.steam_pressure,
            steamFlowLPH: l.steam_flow_lph,
            remarks: l.remarks,
            checkedBy: l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateBoilerMonitoringPDF({ logs: allLogs });
          downloadPDF(blob, 'Boiler Monitoring.pdf');
          toast.success('PDF generated successfully');
          return;
        } else if (log.equipmentType === 'chemical') {
          const chemicalPreps = await chemicalPrepAPI.list();
          allLogs = chemicalPreps.map((l: any) => ({
            id: l.id,
            equipmentType: 'chemical',
            equipmentName: l.equipment_name,
            chemicalName: l.chemical_name,
            chemicalPercent: l.chemical_percent,
            solutionConcentration: l.solution_concentration,
            waterQty: l.water_qty,
            chemicalQty: l.chemical_qty,
            remarks: l.remarks,
            checkedBy: l.checked_by || l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateChemicalMonitoringPDF({ logs: allLogs });
          downloadPDF(blob, 'Chemical Monitoring.pdf');
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
    
    let detailsHTML = '<h2>Log Details</h2>';
    
    if (log.equipmentType === 'chiller') {
      detailsHTML += `
        <div class="info"><span class="label">Chiller Supply Temp:</span><span class="value">${log.chillerSupplyTemp !== undefined ? log.chillerSupplyTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Chiller Return Temp:</span><span class="value">${log.chillerReturnTemp !== undefined ? log.chillerReturnTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Cooling Tower Supply Temp:</span><span class="value">${log.coolingTowerSupplyTemp !== undefined ? log.coolingTowerSupplyTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Cooling Tower Return Temp:</span><span class="value">${log.coolingTowerReturnTemp !== undefined ? log.coolingTowerReturnTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">CT Differential Temp:</span><span class="value">${log.ctDifferentialTemp !== undefined ? log.ctDifferentialTemp + '°C' : 'N/A'}</span></div>
        <div class="info"><span class="label">Chiller Water Inlet Pressure:</span><span class="value">${log.chillerWaterInletPressure !== undefined ? log.chillerWaterInletPressure + ' bar' : 'N/A'}</span></div>
        <div class="info"><span class="label">Chiller Makeup Water Flow:</span><span class="value">${log.chillerMakeupWaterFlow !== undefined ? log.chillerMakeupWaterFlow + ' LPH' : 'N/A'}</span></div>
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
    }
    
    return detailsHTML;
  };

  const handlePrint = async (report: Report) => {
    // Fetch full data from original source
    const log = await fetchFullReportData(report);
    if (!log) {
      toast.error('Failed to load report data');
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
    
    // For utility reports (chiller, boiler, chemical), generate PDF with all logs
    if (report.type === 'utility' && log) {
      try {
        // Fetch all logs of the same equipment type from API
        let allLogs: any[] = [];
        
        if (log.equipmentType === 'chiller') {
          const chillerLogs = await chillerLogAPI.list();
          allLogs = chillerLogs.map((l: any) => ({
            id: l.id,
            equipmentType: 'chiller',
            equipmentId: l.equipment_id,
            chillerSupplyTemp: l.chiller_supply_temp,
            chillerReturnTemp: l.chiller_return_temp,
            coolingTowerSupplyTemp: l.cooling_tower_supply_temp,
            coolingTowerReturnTemp: l.cooling_tower_return_temp,
            ctDifferentialTemp: l.ct_differential_temp,
            chillerWaterInletPressure: l.chiller_water_inlet_pressure,
            chillerMakeupWaterFlow: l.chiller_makeup_water_flow,
            remarks: l.remarks,
            checkedBy: l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateChillerMonitoringPDF({ logs: allLogs });
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        } else if (log.equipmentType === 'boiler') {
          const boilerLogs = await boilerLogAPI.list();
          allLogs = boilerLogs.map((l: any) => ({
            id: l.id,
            equipmentType: 'boiler',
            equipmentId: l.equipment_id,
            feedWaterTemp: l.feed_water_temp,
            oilTemp: l.oil_temp,
            steamTemp: l.steam_temp,
            steamPressure: l.steam_pressure,
            steamFlowLPH: l.steam_flow_lph,
            remarks: l.remarks,
            checkedBy: l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateBoilerMonitoringPDF({ logs: allLogs });
          const success = printPDF(blob);
          if (success) {
            toast.success('Opening print dialog...');
          } else {
            toast.error('Please allow popups to print PDFs');
          }
          return;
        } else if (log.equipmentType === 'chemical') {
          const chemicalPreps = await chemicalPrepAPI.list();
          allLogs = chemicalPreps.map((l: any) => ({
            id: l.id,
            equipmentType: 'chemical',
            equipmentName: l.equipment_name,
            chemicalName: l.chemical_name,
            chemicalPercent: l.chemical_percent,
            solutionConcentration: l.solution_concentration,
            waterQty: l.water_qty,
            chemicalQty: l.chemical_qty,
            remarks: l.remarks,
            checkedBy: l.checked_by || l.operator_name,
            timestamp: new Date(l.timestamp),
            status: l.status,
          }));
          const blob = await generateChemicalMonitoringPDF({ logs: allLogs });
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
        subtitle="View and export approved reports"
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading reports...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="metric-card">
                <p className="data-label">Total Approved Reports</p>
                <p className="reading-display text-2xl text-success">
                  {reports.filter(r => r.status === 'approved').length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">E Log Book</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && r.type === 'utility').length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">Test Certificates</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && ['air_velocity', 'filter_integrity', 'recovery', 'differential_pressure', 'nvpc'].includes(r.type)).length}
                </p>
              </div>
              <div className="metric-card">
                <p className="data-label">HVAC Validations</p>
                <p className="reading-display text-2xl">
                  {reports.filter(r => r.status === 'approved' && r.type === 'validation').length}
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
                      <p className="text-sm">
                        <Badge variant="accent">{typeLabels[selectedReport.type]}</Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <p className="text-sm">
                        <Badge variant={
                          selectedReport.status === 'approved' ? 'success' : 
                          selectedReport.status === 'rejected' ? 'danger' : 'pending'
                        }>
                          {selectedReport.status === 'approved' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {selectedReport.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                          {selectedReport.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {selectedReport.status}
                        </Badge>
                      </p>
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
                  {selectedReport.remarks && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Remarks</Label>
                      <p className="text-sm mt-1">{selectedReport.remarks}</p>
                    </div>
                  )}
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
        )}
      </div>
    </div>
  );
}
