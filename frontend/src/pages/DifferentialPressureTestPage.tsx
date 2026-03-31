import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { DifferentialPressureTestData, DifferentialPressureReading } from '@/types/test-certificates';
import { checkDifferentialPressure } from '@/lib/test-calculations';
import { generateDifferentialPressurePDF, downloadPDF } from '@/lib/pdf-generator';
import { testCertificateAPI } from '@/lib/api';

const defaultClientInfo = {
  name: 'Dr. Reddys Laboratories Ltd.',
  address: 'Add, Pu-2, Block-B, Potent Plant, Pydibhimavaram, srikakulam, 532409',
};

async function generateCertificateNo(): Promise<string> {
  try {
    const tests = await testCertificateAPI.differentialPressure.list();
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

export default function DifferentialPressureTestPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<DifferentialPressureTestData[]>([]);
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
    instrumentName: 'Digital Manometer',
    instrumentMake: '',
    instrumentModel: '',
    instrumentSerial: '',
    instrumentIdNumber: '',
    calibrationDate: '',
    calibrationDueDate: '',
    ahuNumber: '',
    readings: [] as DifferentialPressureReading[],
  });

  // Load tests from API
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setIsLoading(true);
        const apiTests = await testCertificateAPI.differentialPressure.list();
        
        const transformedTests: DifferentialPressureTestData[] = apiTests.map((test: any) => ({
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
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
          readings: test.readings?.map((reading: any) => ({
            roomPositive: reading.room_positive,
            roomNegative: reading.room_negative,
            dpReading: reading.dp_reading,
            limit: reading.limit,
            testStatus: reading.test_status as 'PASS' | 'FAIL',
          })) || [],
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

  const addReading = () => {
    setFormData({
      ...formData,
      readings: [
        ...formData.readings,
        { roomPositive: '', roomNegative: '', dpReading: 0, limit: 5, testStatus: 'PASS' },
      ],
    });
  };

  const removeReading = (index: number) => {
    setFormData({
      ...formData,
      readings: formData.readings.filter((_, i) => i !== index),
    });
  };

  const updateReading = (index: number, updates: Partial<DifferentialPressureReading>) => {
    const newReadings = [...formData.readings];
    const reading = { ...newReadings[index], ...updates };
    
    if (updates.dpReading !== undefined || updates.limit !== undefined) {
      // Formula: DP Reading >= limit then PASS, otherwise FAIL
      // Use the actual limit value entered by user (defaults to 5 if not set)
      const limitValue = reading.limit || 5;
      reading.testStatus = checkDifferentialPressure(reading.dpReading, limitValue);
    }
    
    newReadings[index] = reading;
    setFormData({ ...formData, readings: newReadings });
  };

  const refreshTests = async () => {
    try {
      const apiTests = await testCertificateAPI.differentialPressure.list();
      const transformedTests: DifferentialPressureTestData[] = apiTests.map((test: any) => ({
        id: test.id,
        clientInfo: {
          name: test.client_name,
          address: test.client_address,
        },
        certificateNo: test.certificate_no,
        date: test.date,
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
        readings: test.readings?.map((reading: any) => ({
          roomPositive: reading.room_positive,
          roomNegative: reading.room_negative,
          dpReading: reading.dp_reading,
          limit: reading.limit,
          testStatus: reading.test_status as 'PASS' | 'FAIL',
        })) || [],
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
    
    if (formData.readings.length === 0) {
      toast.error('Please add at least one reading');
      return;
    }

    try {
      const apiData = {
        certificate_no: formData.certificateNo,
        client_name: formData.clientName,
        client_address: formData.clientAddress,
        date: formData.date,
        ahu_number: formData.ahuNumber,
        instrument_name: formData.instrumentName,
        instrument_make: formData.instrumentMake,
        instrument_model: formData.instrumentModel,
        instrument_serial_number: formData.instrumentSerial,
        instrument_id_number: formData.instrumentIdNumber || undefined,
        instrument_calibration_date: formData.calibrationDate || undefined,
        instrument_calibration_due_date: formData.calibrationDueDate || undefined,
        instrument_flow_rate: undefined,
        instrument_sampling_time: undefined,
        prepared_by: user?.name || user?.email || 'Unknown',
        readings: formData.readings.map(reading => ({
          room_positive: reading.roomPositive,
          room_negative: reading.roomNegative,
          dp_reading: reading.dpReading,
          limit: reading.limit,
          test_status: reading.testStatus,
        })),
      };

      await testCertificateAPI.differentialPressure.create(apiData);
      
      setIsDialogOpen(false);
      const newCertNo = await generateCertificateNo();
      setFormData({ ...formData, certificateNo: newCertNo, date: format(new Date(), 'yyyy-MM-dd'), readings: [] });
      await refreshTests();
      toast.success('Differential Pressure test saved successfully');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error?.message || 'Failed to save test');
    }
  };

  const handleGeneratePDF = async (test: DifferentialPressureTestData) => {
    try {
      const blob = await generateDifferentialPressurePDF(test);
      downloadPDF(blob, `Differential_Pressure_${test.certificateNo}_${test.date}.pdf`);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await testCertificateAPI.differentialPressure.approve(id, 'approve');
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
      await testCertificateAPI.differentialPressure.approve(id, 'reject');
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
      await testCertificateAPI.differentialPressure.delete(id);
      await refreshTests();
      toast.success('Test deleted successfully');
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error?.message || 'Failed to delete test');
    }
  };

  return (
    <div className="min-h-screen">
      <Header title="Differential Pressure Test Certificate" subtitle="Differential pressure test for clean rooms" />
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
                <DialogTitle>New Differential Pressure Test</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Name *</Label>
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
                  <Label>Customer Address *</Label>
                  <Input value={formData.clientAddress} onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })} required />
                </div>
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
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Room Pairs & Readings</h3>
                    <Button type="button" onClick={addReading} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Reading
                    </Button>
                  </div>
                  {formData.readings.map((reading, index) => (
                    <div key={index} className="border rounded p-3 mb-2 grid grid-cols-5 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Room (+) *</Label>
                        <Input
                          value={reading.roomPositive}
                          onChange={(e) => updateReading(index, { roomPositive: e.target.value })}
                          placeholder="e.g., Corridor"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Room (-) *</Label>
                        <Input
                          value={reading.roomNegative}
                          onChange={(e) => updateReading(index, { roomNegative: e.target.value })}
                          placeholder="e.g., Air Lock -I"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>DP Reading (Pa) *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={reading.dpReading || ''}
                          onChange={(e) => updateReading(index, { dpReading: parseFloat(e.target.value) || 0 })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Limit (NLT Pa)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={reading.limit || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const numValue = value === '' ? 0 : parseFloat(value);
                            updateReading(index, { limit: isNaN(numValue) ? 0 : numValue });
                          }}
                          placeholder="e.g., 5"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-2">
                          <Label>Status</Label>
                          <div className={`p-2 rounded text-center font-semibold ${reading.testStatus === 'PASS' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {reading.testStatus}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              toast.success(`Reading "${reading.roomPositive} / ${reading.roomNegative}" saved`);
                            }}
                            variant="outline"
                            size="icon"
                            title="Save Reading"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          {user?.role === 'super_admin' && (
                            <Button type="button" onClick={() => removeReading(index)} variant="ghost" size="icon" className="text-destructive" title="Delete Reading">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">AHU Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Readings</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading tests...</td>
                  </tr>
                ) : tests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No tests found.</td>
                  </tr>
                ) : (
                  tests.map((test) => (
                    <tr key={test.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-mono">{test.certificateNo}</td>
                      <td className="px-4 py-3 text-sm">{test.date}</td>
                      <td className="px-4 py-3 text-sm">{test.clientInfo.name}</td>
                      <td className="px-4 py-3 text-sm">{test.ahuNumber}</td>
                      <td className="px-4 py-3 text-sm">{test.readings.length}</td>
                      <td className="px-4 py-3">
                        <Badge variant={test.status === 'approved' ? 'success' : test.status === 'rejected' ? 'danger' : 'pending'}>
                          {test.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(test.status === 'pending' || test.status === 'draft') && user?.role !== 'operator' && (
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

