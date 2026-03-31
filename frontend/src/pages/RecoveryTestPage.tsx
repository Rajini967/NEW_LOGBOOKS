import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, Save, Download, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { RecoveryTestData, RecoveryDataPoint } from '@/types/test-certificates';
import { calculateRecoveryTime, checkRecoveryStatus, generateRecoveryAuditStatement } from '@/lib/test-calculations';
import { generateRecoveryTestPDF, downloadPDF } from '@/lib/pdf-generator';
import { testCertificateAPI } from '@/lib/api';

// Helper function to format number with commas (returns empty string for 0 to allow editing)
function formatNumberWithCommas(value: number | string | null | undefined): string {
  if (value === '' || value === null || value === undefined) return '';
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(numValue)) return '';
  // Return empty string for 0 to allow user to clear and type
  if (numValue === 0) return '';
  return numValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Helper function to parse comma-formatted string to number
function parseCommaFormattedNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

const defaultClientInfo = {
  name: 'Dr. Reddys Laboratories Ltd.',
  address: 'Add, Pu-2, Block-B, Potent Plant, Pydibhimavaram, srikakulam, 532409',
};

async function generateCertificateNo(): Promise<string> {
  try {
    const tests = await testCertificateAPI.recovery.list();
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const prefix = `SVU/${month}-`;
    let maxNum = 0;
    tests.forEach((test: any) => {
      if (test.certificate_no?.startsWith(prefix)) {
        const num = parseInt(test.certificate_no.split('-')[1] || '0');
        if (num > maxNum) maxNum = num;
      }
    });
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  } catch {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `SVU/${month}-001`;
  }
}

export default function RecoveryTestPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<RecoveryTestData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clientName: defaultClientInfo.name,
    clientAddress: defaultClientInfo.address,
    certificateNo: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    areaClassification: 'ISO-8',
    instrumentName: 'Particle Counter',
    instrumentMake: '',
    instrumentModel: '',
    instrumentSerial: '',
    instrumentIdNumber: '',
    calibrationDate: '',
    calibrationDueDate: '',
    instrumentFlowRate: '100 LPM',
    samplingTime: '1 Min',
    ahuNumber: '',
    roomName: '',
    roomNumber: '',
    testCondition: 'At Rest',
    timeSeries: [] as RecoveryDataPoint[],
  });

  // Load tests from API
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setIsLoading(true);
        const apiTests = await testCertificateAPI.recovery.list();
        
        const transformedTests: RecoveryTestData[] = apiTests.map((test: any) => ({
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
          areaClassification: test.area_classification,
          instrument: {
            name: test.instrument_name,
            make: test.instrument_make,
            model: test.instrument_model,
            serialNumber: test.instrument_serial_number,
            idNumber: test.instrument_id_number || undefined,
            calibrationDate: test.instrument_calibration_date || '',
            calibrationDueDate: test.instrument_calibration_due_date || '',
            flowRate: test.instrument_flow_rate || undefined,
            samplingTime: test.instrument_sampling_time || undefined,
          },
          ahuNumber: test.ahu_number,
          roomName: test.room_name || undefined,
          roomNumber: test.room_number || undefined,
          testCondition: test.test_condition || undefined,
          timeSeries: test.data_points?.map((dp: any) => ({
            time: dp.time,
            ahuStatus: dp.ahu_status as 'ON' | 'OFF',
            particleCount05: dp.particle_count_05,
            particleCount5: dp.particle_count_5,
          })) || [],
          recoveryTime: test.recovery_time,
          testStatus: test.test_status as 'PASS' | 'FAIL' | undefined,
          auditStatement: test.audit_statement || undefined,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        }));

        setTests(transformedTests);
      } catch (error) {
        console.error('Error loading tests:', error);
        toast.error('Failed to load tests');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTests();
  }, []);

  // Regenerate certificate number when dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      generateCertificateNo().then(certNo => {
        setFormData(prev => ({
          ...prev,
          certificateNo: certNo,
          date: format(new Date(), 'yyyy-MM-dd'),
        }));
      });
    }
  }, [isDialogOpen]);

  const addTimePoint = () => {
    setFormData({
      ...formData,
      timeSeries: [
        ...formData.timeSeries,
        { time: '00:00:00', ahuStatus: 'ON', particleCount05: 0, particleCount5: 0 },
      ],
    });
  };

  const removeTimePoint = (index: number) => {
    setFormData({
      ...formData,
      timeSeries: formData.timeSeries.filter((_, i) => i !== index),
    });
  };

  const updateTimePoint = (index: number, updates: Partial<RecoveryDataPoint>) => {
    const newTimeSeries = [...formData.timeSeries];
    // Ensure time format includes seconds (HH:MM:SS)
    if (updates.time) {
      const timeValue = updates.time;
      // If time is in HH:MM format, add :00 for seconds
      const timeParts = timeValue.split(':');
      if (timeParts.length === 2) {
        updates.time = `${timeValue}:00`;
      }
    }
    newTimeSeries[index] = { ...newTimeSeries[index], ...updates };
    setFormData({ ...formData, timeSeries: newTimeSeries });
  };

  const refreshTests = async () => {
    try {
      const apiTests = await testCertificateAPI.recovery.list();
      const transformedTests: RecoveryTestData[] = apiTests.map((test: any) => ({
        id: test.id,
        clientInfo: { name: test.client_name, address: test.client_address },
        certificateNo: test.certificate_no,
        date: test.date,
        areaClassification: test.area_classification,
        instrument: {
          name: test.instrument_name,
          make: test.instrument_make,
          model: test.instrument_model,
          serialNumber: test.instrument_serial_number,
          idNumber: test.instrument_id_number || undefined,
          calibrationDate: test.instrument_calibration_date || '',
          calibrationDueDate: test.instrument_calibration_due_date || '',
          flowRate: test.instrument_flow_rate || undefined,
          samplingTime: test.instrument_sampling_time || undefined,
        },
        ahuNumber: test.ahu_number,
        roomName: test.room_name || undefined,
        roomNumber: test.room_number || undefined,
        testCondition: test.test_condition || undefined,
        timeSeries: test.data_points?.map((dp: any) => ({
          time: dp.time,
          ahuStatus: dp.ahu_status as 'ON' | 'OFF',
          particleCount05: dp.particle_count_05,
          particleCount5: dp.particle_count_5,
        })) || [],
        recoveryTime: test.recovery_time,
        testStatus: test.test_status as 'PASS' | 'FAIL' | undefined,
        auditStatement: test.audit_statement || undefined,
        preparedBy: test.prepared_by,
        approvedBy: test.approved_by_id ? test.operator_name : undefined,
        timestamp: new Date(test.timestamp),
        status: test.status as 'pending' | 'approved' | 'rejected',
      }));
      setTests(transformedTests);
    } catch (error) {
      console.error('Error refreshing tests:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.ahuNumber) {
      toast.error('Please enter AHU Number');
      return;
    }
    
    if (formData.timeSeries.length === 0) {
      toast.error('Please add at least one time point');
      return;
    }

    const recoveryTime = calculateRecoveryTime(formData.timeSeries);
    const testStatus = checkRecoveryStatus(recoveryTime);
    const auditStatement = generateRecoveryAuditStatement(recoveryTime, formData.roomName);

    try {
      const apiData = {
        certificate_no: formData.certificateNo,
        client_name: formData.clientName,
        client_address: formData.clientAddress,
        date: formData.date,
        area_classification: formData.areaClassification,
        ahu_number: formData.ahuNumber,
        room_name: formData.roomName || undefined,
        room_number: formData.roomNumber || undefined,
        test_condition: formData.testCondition || undefined,
        instrument_name: formData.instrumentName,
        instrument_make: formData.instrumentMake,
        instrument_model: formData.instrumentModel,
        instrument_serial_number: formData.instrumentSerial,
        instrument_id_number: formData.instrumentIdNumber || undefined,
        instrument_calibration_date: formData.calibrationDate || undefined,
        instrument_calibration_due_date: formData.calibrationDueDate || undefined,
        instrument_flow_rate: formData.instrumentFlowRate || undefined,
        instrument_sampling_time: formData.samplingTime || undefined,
        recovery_time: recoveryTime,
        test_status: testStatus,
        audit_statement: auditStatement,
        prepared_by: user?.name || user?.email || 'Unknown',
        data_points: formData.timeSeries.map(dp => ({
          time: dp.time,
          ahu_status: dp.ahuStatus,
          particle_count_05: dp.particleCount05,
          particle_count_5: dp.particleCount5,
        })),
      };

      await testCertificateAPI.recovery.create(apiData);
      
      setIsDialogOpen(false);
      const newCertNo = await generateCertificateNo();
      setFormData({ ...formData, certificateNo: newCertNo, date: format(new Date(), 'yyyy-MM-dd'), timeSeries: [] });
      await refreshTests();
      toast.success('Recovery test saved successfully');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error?.message || 'Failed to save test');
    }
  };

  const handleGeneratePDF = async (test: RecoveryTestData) => {
    try {
      const blob = await generateRecoveryTestPDF(test);
      downloadPDF(blob, `Recovery_Test_${test.certificateNo}_${test.date}.pdf`);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await testCertificateAPI.recovery.approve(id, 'approve');
      await refreshTests();
      toast.success('Test approved successfully');
    } catch (error: any) {
      console.error('Error approving test:', error);
      toast.error(error?.message || 'Failed to approve test');
    }
  };

  const handleReject = async (id: string) => {
    setRejectConfirmOpen(false);
    try {
      await testCertificateAPI.recovery.approve(id, 'reject');
      await refreshTests();
      toast.error('Test rejected');
    } catch (error: any) {
      console.error('Error rejecting test:', error);
      toast.error(error?.message || 'Failed to reject test');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this test?')) {
      return;
    }
    
    try {
      await testCertificateAPI.recovery.delete(id);
      await refreshTests();
      toast.success('Test deleted successfully');
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error?.message || 'Failed to delete test');
    }
  };

  return (
    <div className="min-h-screen">
      <Header title="Recovery Test Certificate" subtitle="Recovery time test for clean rooms" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Badge variant="default">{tests.length} Tests</Badge>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                New Test
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Recovery Test</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input value={formData.clientName} onChange={(e) => setFormData({ ...formData, clientName: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Certificate No *</Label>
                    <Input 
                      value={formData.certificateNo} 
                      onChange={(e) => setFormData({ ...formData, certificateNo: e.target.value })}
                      placeholder="e.g., SVU/01-001 or STEWMPS/07-017"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client Address *</Label>
                  <Input value={formData.clientAddress} onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Test *</Label>
                    <Input 
                      type="date" 
                      value={formData.date} 
                      disabled
                      readOnly
                      required
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Area Classification</Label>
                    <Input value={formData.areaClassification} onChange={(e) => setFormData({ ...formData, areaClassification: e.target.value })} />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Instrument Used</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Instrument Name *</Label>
                      <Input value={formData.instrumentName} onChange={(e) => setFormData({ ...formData, instrumentName: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Instrument ID Number</Label>
                      <Input value={formData.instrumentIdNumber} onChange={(e) => setFormData({ ...formData, instrumentIdNumber: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Make</Label>
                      <Input value={formData.instrumentMake} onChange={(e) => setFormData({ ...formData, instrumentMake: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input value={formData.instrumentModel} onChange={(e) => setFormData({ ...formData, instrumentModel: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Instrument Flow Rate</Label>
                      <Input value={formData.instrumentFlowRate} onChange={(e) => setFormData({ ...formData, instrumentFlowRate: e.target.value })} placeholder="e.g., 100 LPM" />
                    </div>
                    <div className="space-y-2">
                      <Label>Sampling Time</Label>
                      <Input value={formData.samplingTime} onChange={(e) => setFormData({ ...formData, samplingTime: e.target.value })} placeholder="e.g., 1 Min" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AHU Number *</Label>
                    <Input value={formData.ahuNumber} onChange={(e) => setFormData({ ...formData, ahuNumber: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Serial Number</Label>
                    <Input value={formData.instrumentSerial} onChange={(e) => setFormData({ ...formData, instrumentSerial: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Calibration Done Date</Label>
                    <Input type="date" value={formData.calibrationDate} onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Calibration Due Date</Label>
                    <Input type="date" value={formData.calibrationDueDate} onChange={(e) => setFormData({ ...formData, calibrationDueDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Room Name</Label>
                    <Input value={formData.roomName} onChange={(e) => setFormData({ ...formData, roomName: e.target.value })} placeholder="e.g., PRB078" />
                  </div>
                  <div className="space-y-2">
                    <Label>Room Number</Label>
                    <Input value={formData.roomNumber} onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })} placeholder="e.g., R-001" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Test Condition</Label>
                  <Select value={formData.testCondition} onValueChange={(value) => setFormData({ ...formData, testCondition: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select test condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="At Rest">At Rest</SelectItem>
                      <SelectItem value="Operational">Operational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Time Series Data</h3>
                    <Button type="button" onClick={addTimePoint} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Time Point
                    </Button>
                  </div>
                  {formData.timeSeries.map((point, index) => (
                    <div key={index} className="border rounded p-3 mb-2 grid grid-cols-5 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Time (HH:MM:SS)</Label>
                        <Input
                          type="time"
                          step="1"
                          value={point.time}
                          onChange={(e) => updateTimePoint(index, { time: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>AHU Status</Label>
                        <Select
                          value={point.ahuStatus}
                          onValueChange={(v) => updateTimePoint(index, { ahuStatus: v as 'ON' | 'OFF' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ON">ON</SelectItem>
                            <SelectItem value="OFF">OFF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Particle Count (≥0.5μm)</Label>
                        <Input
                          type="text"
                          value={point.particleCount05 === 0 ? '' : formatNumberWithCommas(point.particleCount05)}
                          onChange={(e) => updateTimePoint(index, { particleCount05: parseCommaFormattedNumber(e.target.value) })}
                          onBlur={(e) => {
                            // Ensure we store 0 if field is empty on blur
                            if (!e.target.value || e.target.value.trim() === '') {
                              updateTimePoint(index, { particleCount05: 0 });
                            }
                          }}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Particle Count (≥5μm)</Label>
                        <Input
                          type="text"
                          value={point.particleCount5 === 0 ? '' : formatNumberWithCommas(point.particleCount5)}
                          onChange={(e) => updateTimePoint(index, { particleCount5: parseCommaFormattedNumber(e.target.value) })}
                          onBlur={(e) => {
                            // Ensure we store 0 if field is empty on blur
                            if (!e.target.value || e.target.value.trim() === '') {
                              updateTimePoint(index, { particleCount5: 0 });
                            }
                          }}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            toast.success(`Time Point "${point.time || 'Unnamed'}" saved`);
                          }}
                          variant="outline"
                          size="icon"
                          title="Save Time Point"
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                        {user?.role === 'super_admin' && (
                          <Button type="button" onClick={() => removeTimePoint(index)} variant="ghost" size="icon" className="text-destructive" title="Delete Time Point">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {formData.timeSeries.length > 0 && (() => {
                    const recoveryTime = calculateRecoveryTime(formData.timeSeries);
                    const testStatus = checkRecoveryStatus(recoveryTime);
                    return (
                      <div className="bg-accent/10 rounded p-3 mt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            Calculated Recovery Time: {recoveryTime} minute{recoveryTime !== 1 ? 's' : ''}
                          </div>
                          <div className={`px-3 py-1 rounded font-semibold text-sm ${
                            testStatus === 'PASS' 
                              ? 'bg-success/10 text-success' 
                              : 'bg-destructive/10 text-destructive'
                          }`}>
                            {testStatus}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Acceptance Limit: ≤ 15 minutes
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="accent">
                    <Save className="w-4 h-4 mr-2" />
                    Save Test
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Certificate No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Recovery Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Loading tests...</td>
                  </tr>
                ) : tests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No tests found.</td>
                  </tr>
                ) : (
                  tests.map((test) => (
                    <tr key={test.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-mono">{test.certificateNo}</td>
                      <td className="px-4 py-3 text-sm">{test.date}</td>
                      <td className="px-4 py-3 text-sm">{test.clientInfo.name}</td>
                      <td className="px-4 py-3 text-sm">{test.recoveryTime} minutes</td>
                      <td className="px-4 py-3">
                        <Badge variant={test.status === 'approved' ? 'success' : test.status === 'rejected' ? 'danger' : 'pending'}>
                          {test.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {test.status === 'pending' && user?.role !== 'operator' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedTestId(test.id);
                                  setApproveConfirmOpen(true);
                                }}
                                className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedTestId(test.id);
                                  setRejectConfirmOpen(true);
                                }}
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGeneratePDF(test)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            PDF
                          </Button>
                          {user?.role === 'super_admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(test.id)}
                              className="text-destructive hover:text-destructive"
                              title="Delete Test"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Approve Confirmation Alert */}
      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this test? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTestId && handleApprove(selectedTestId)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Alert */}
      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rejection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this test? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTestId && handleReject(selectedTestId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

