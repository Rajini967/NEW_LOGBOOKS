import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { NVPCTestData, NVPCRoomData, NVPCSamplingPoint } from '@/types/test-certificates';
import { generateNVPCPDF, downloadPDF } from '@/lib/pdf-generator';
import { calculateAverage } from '@/lib/test-calculations';
import { testCertificateAPI } from '@/lib/api';

const defaultClientInfo = {
  name: 'Dr. Reddys Laboratories Ltd.',
  address: 'Add, Pu-2, Block-B, Potent Plant, Pydibhimavaram, srikakulam, 532409',
};

// ISO 8 limits (fixed, per ISO 14644-1) - At Rest
const ISO8_LIMITS = {
  limit05: 3520000, // ≥0.5µm particles/m³
  limit5: 29300,     // ≥5.0µm particles/m³
};

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

async function generateCertificateNo(): Promise<string> {
  try {
    const tests = await testCertificateAPI.nvpc.list();
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

/**
 * Calculate mean (average) across all locations in a room
 */
function calculateRoomMean(readings: number[]): number {
  if (readings.length === 0) return 0;
  const sum = readings.reduce((a, b) => a + b, 0);
  return sum / readings.length;
}

/**
 * Check room-level status based on mean values vs ISO 8 limits
 */
function checkRoomStatus(mean05: number, mean5: number): 'PASS' | 'FAIL' {
  if (mean05 <= ISO8_LIMITS.limit05 && mean5 <= ISO8_LIMITS.limit5) {
    return 'PASS';
  }
  return 'FAIL';
}

export default function NVPCTestPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<NVPCTestData[]>([]);
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
    areaClassification: 'ISO 8 (Class 1,00,000)',
    instrumentName: 'Particle Counter',
    instrumentMake: '',
    instrumentModel: '',
    instrumentSerial: '',
    instrumentIdNumber: '',
    instrumentFlowRate: '100 LPM',
    samplingTime: '1 Min',
    calibrationDate: '',
    calibrationDueDate: '',
    areaName: '',
    ahuNumber: '',
    inference: 'The above test Results it is Concluded that the Clean Room Meets the ISO-8 Specifications.',
    rooms: [] as NVPCRoomData[],
  });

  // Load tests from API
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setIsLoading(true);
        const apiTests = await testCertificateAPI.nvpc.list();
        
        const transformedTests: NVPCTestData[] = apiTests.map((test: any) => {
          const rooms: NVPCRoomData[] = test.rooms?.map((room: any) => ({
            roomName: room.room_name,
            roomNumber: room.room_number || undefined,
            samplingPoints: room.sampling_points?.map((sp: any) => ({
              samplingPoint: sp.sampling_point,
              mean05: sp.mean_05,
              mean5: sp.mean_5,
              testStatus: sp.test_status as 'PASS' | 'FAIL',
            })) || [],
          })) || [];

          return {
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
            areaName: test.area_name || undefined,
            inference: test.inference || undefined,
            rooms,
            preparedBy: test.prepared_by,
            approvedBy: test.approved_by_id ? test.operator_name : undefined,
            timestamp: new Date(test.timestamp),
            status: test.status as 'pending' | 'approved' | 'rejected',
          };
        });

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

  const addRoom = () => {
    setFormData({
      ...formData,
      rooms: [...formData.rooms, { roomName: '', roomNumber: '', samplingPoints: [] }],
    });
  };

  const removeRoom = (roomIndex: number) => {
    setFormData({
      ...formData,
      rooms: formData.rooms.filter((_, i) => i !== roomIndex),
    });
  };

  const addSamplingPoint = (roomIndex: number) => {
    const newRooms = [...formData.rooms];
    const room = newRooms[roomIndex];
    room.samplingPoints.push({
      pointId: '',
      location: '',
      readings05: [0], // Start with one reading (S1)
      readings5: [0],
      average05: 0,
      average5: 0,
      limit05: ISO8_LIMITS.limit05,
      limit5: ISO8_LIMITS.limit5,
      testStatus: 'PASS',
    });
    // Recalculate room means and status
    calculateRoomMeansAndStatus(newRooms, roomIndex);
    setFormData({ ...formData, rooms: newRooms });
  };

  const removeSamplingPoint = (roomIndex: number, pointIndex: number) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].samplingPoints = newRooms[roomIndex].samplingPoints.filter((_, i) => i !== pointIndex);
    // Recalculate room means and status
    calculateRoomMeansAndStatus(newRooms, roomIndex);
    setFormData({ ...formData, rooms: newRooms });
  };

  /**
   * Calculate room-level means and status
   */
  const calculateRoomMeansAndStatus = (rooms: NVPCRoomData[], roomIndex: number) => {
    const room = rooms[roomIndex];
    if (room.samplingPoints.length === 0) {
      room.mean05 = 0;
      room.mean5 = 0;
      room.roomStatus = 'PASS';
      return;
    }

    // Collect all location averages
    const allAverages05: number[] = [];
    const allAverages5: number[] = [];

    room.samplingPoints.forEach((point) => {
      // Calculate average for this location
      const avg05 = calculateAverage(point.readings05);
      const avg5 = calculateAverage(point.readings5);
      point.average05 = avg05;
      point.average5 = avg5;
      
      allAverages05.push(avg05);
      allAverages5.push(avg5);
    });

    // Calculate room-level mean (mean of all location averages)
    room.mean05 = calculateRoomMean(allAverages05);
    room.mean5 = calculateRoomMean(allAverages5);

    // Check room status based on mean vs ISO 8 limits
    room.roomStatus = checkRoomStatus(room.mean05, room.mean5);
  };

  const updateSamplingPoint = (roomIndex: number, pointIndex: number, updates: Partial<NVPCSamplingPoint>) => {
    const newRooms = [...formData.rooms];
    const point = { ...newRooms[roomIndex].samplingPoints[pointIndex], ...updates };
    
    // Recalculate averages if readings changed
    if (updates.readings05 !== undefined || updates.readings5 !== undefined) {
      point.average05 = calculateAverage(point.readings05);
      point.average5 = calculateAverage(point.readings5);
    }
    
    newRooms[roomIndex].samplingPoints[pointIndex] = point;
    
    // Recalculate room means and status
    calculateRoomMeansAndStatus(newRooms, roomIndex);
    
    setFormData({ ...formData, rooms: newRooms });
  };


  const refreshTests = async () => {
    try {
      const apiTests = await testCertificateAPI.nvpc.list();
      const transformedTests: NVPCTestData[] = apiTests.map((test: any) => {
        const rooms: NVPCRoomData[] = test.rooms?.map((room: any) => ({
          roomName: room.room_name,
          roomNumber: room.room_number || undefined,
          samplingPoints: room.sampling_points?.map((sp: any) => ({
            samplingPoint: sp.sampling_point,
            mean05: sp.mean_05,
            mean5: sp.mean_5,
            testStatus: sp.test_status as 'PASS' | 'FAIL',
          })) || [],
        })) || [];

        return {
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
          areaName: test.area_name || undefined,
          inference: test.inference || undefined,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
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
    
    if (formData.rooms.length === 0) {
      toast.error('Please add at least one room');
      return;
    }

    // Calculate room means and status before saving
    const roomsWithCalculations = formData.rooms.map((room) => {
      const roomCopy = { ...room };
      const tempRooms = [roomCopy];
      calculateRoomMeansAndStatus(tempRooms, 0);
      return roomCopy;
    });

    try {
      const apiData = {
        certificate_no: formData.certificateNo,
        client_name: formData.clientName,
        client_address: formData.clientAddress,
        date: formData.date,
        area_classification: formData.areaClassification,
        ahu_number: formData.ahuNumber,
        area_name: formData.areaName || undefined,
        inference: formData.inference || undefined,
        instrument_name: formData.instrumentName,
        instrument_make: formData.instrumentMake,
        instrument_model: formData.instrumentModel,
        instrument_serial_number: formData.instrumentSerial,
        instrument_id_number: formData.instrumentIdNumber || undefined,
        instrument_calibration_date: formData.calibrationDate || undefined,
        instrument_calibration_due_date: formData.calibrationDueDate || undefined,
        instrument_flow_rate: formData.instrumentFlowRate || undefined,
        instrument_sampling_time: formData.samplingTime || undefined,
        prepared_by: user?.name || user?.email || 'Unknown',
        rooms: roomsWithCalculations.map(room => ({
          room_name: room.roomName,
          room_number: room.roomNumber || undefined,
          mean_05: room.mean05,
          mean_5: room.mean5,
          room_status: room.roomStatus,
          sampling_points: room.samplingPoints.map(sp => ({
            sampling_point: sp.samplingPoint,
            location: sp.samplingPoint, // Use sampling point as location
            readings_05: sp.readings05 || [],
            readings_5: sp.readings5 || [],
            average_05: sp.average05 || sp.mean05 || 0,
            average_5: sp.average5 || sp.mean5 || 0,
            limit_05: ISO8_LIMITS.limit05,
            limit_5: ISO8_LIMITS.limit5,
            test_status: sp.testStatus,
          })),
        })),
      };

      await testCertificateAPI.nvpc.create(apiData);
      
      setIsDialogOpen(false);
      const newCertNo = await generateCertificateNo();
      setFormData({ ...formData, certificateNo: newCertNo, date: format(new Date(), 'yyyy-MM-dd'), rooms: [] });
      await refreshTests();
      toast.success('NVPC test saved successfully');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error?.message || 'Failed to save test');
    }
  };

  const handleGeneratePDF = async (test: NVPCTestData) => {
    try {
      const blob = await generateNVPCPDF(test);
      downloadPDF(blob, `NVPC_${test.certificateNo}_${test.date}.pdf`);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await testCertificateAPI.nvpc.approve(id, 'approve');
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
      await testCertificateAPI.nvpc.approve(id, 'reject');
      await refreshTests();
      toast.error('Test rejected');
    } catch (error: any) {
      console.error('Error rejecting test:', error);
      toast.error(error?.message || 'Failed to reject test');
    }
  };

  const handleDelete = (certificateNo: string) => {
    if (confirm('Are you sure you want to delete this test?')) {
      setTests(tests.filter(test => test.certificateNo !== certificateNo));
      toast.success('Test deleted successfully');
    }
  };

  return (
    <div className="min-h-screen">
      <Header title="NVPC Test Certificate" subtitle="Non-Viable Particle Count Test" />
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
                <DialogTitle>New NVPC Test</DialogTitle>
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
                    <Label>Area Classification *</Label>
                    <Input 
                      value={formData.areaClassification} 
                      onChange={(e) => setFormData({ ...formData, areaClassification: e.target.value })}
                      placeholder="e.g., ISO 8 (Class 1,00,000)"
                      required
                    />
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
                <div className="space-y-2">
                  <Label>Area Name</Label>
                  <Input value={formData.areaName} onChange={(e) => setFormData({ ...formData, areaName: e.target.value })} placeholder="e.g., B- BLOCK" />
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Rooms & Sampling Points</h3>
                    <Button type="button" onClick={addRoom} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Room
                    </Button>
                  </div>
                  {formData.rooms.map((room, roomIndex) => (
                    <div key={roomIndex} className="border rounded-lg p-4 mb-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Room Name *</Label>
                              <Input
                                value={room.roomName}
                                onChange={(e) => {
                                  const newRooms = [...formData.rooms];
                                  newRooms[roomIndex].roomName = e.target.value;
                                  setFormData({ ...formData, rooms: newRooms });
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Room Number</Label>
                              <Input
                                value={room.roomNumber || ''}
                                onChange={(e) => {
                                  const newRooms = [...formData.rooms];
                                  newRooms[roomIndex].roomNumber = e.target.value;
                                  setFormData({ ...formData, rooms: newRooms });
                                }}
                                placeholder="e.g., R-001"
                              />
                            </div>
                          </div>
                          {/* Room-level Results */}
                          {room.samplingPoints.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">Room Results (Mean):</span>
                                <div className={`px-3 py-1 rounded font-semibold text-sm ${
                                  room.roomStatus === 'PASS' 
                                    ? 'bg-success/10 text-success' 
                                    : 'bg-destructive/10 text-destructive'
                                }`}>
                                  {room.roomStatus || 'PASS'}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-muted-foreground">≥0.5µm Mean:</span>
                                  <span className="ml-2 font-semibold">
                                    {room.mean05?.toLocaleString('en-US', { maximumFractionDigits: 0 }) || '0'}
                                  </span>
                                  <span className="text-muted-foreground ml-1">
                                    / {ISO8_LIMITS.limit05.toLocaleString()} (ISO 8 Limit)
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">≥5.0µm Mean:</span>
                                  <span className="ml-2 font-semibold">
                                    {room.mean5?.toLocaleString('en-US', { maximumFractionDigits: 0 }) || '0'}
                                  </span>
                                  <span className="text-muted-foreground ml-1">
                                    / {ISO8_LIMITS.limit5.toLocaleString()} (ISO 8 Limit)
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            type="button"
                            onClick={() => {
                              toast.success(`Room "${room.roomName || 'Unnamed'}" saved`);
                            }}
                            variant="outline"
                            size="icon"
                            title="Save Room"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          {user?.role === 'super_admin' && (
                            <Button type="button" onClick={() => removeRoom(roomIndex)} variant="ghost" size="icon" className="text-destructive" title="Delete Room">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label>Sampling Points</Label>
                          <Button type="button" onClick={() => addSamplingPoint(roomIndex)} variant="outline" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Point
                          </Button>
                        </div>
                        {room.samplingPoints.map((point, pointIndex) => (
                          <div key={pointIndex} className="border rounded p-3 mb-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="space-y-2">
                                  <Label>Location *</Label>
                                  <Input
                                    value={point.location || ''}
                                    onChange={(e) => updateSamplingPoint(roomIndex, pointIndex, { location: e.target.value })}
                                    placeholder="e.g., Point 1"
                                    required
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  type="button"
                                  onClick={() => {
                                    toast.success(`Sampling Point "${point.location || point.pointId || 'Unnamed'}" saved`);
                                  }}
                                  variant="outline"
                                  size="icon"
                                  title="Save Sampling Point"
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                {user?.role === 'super_admin' && (
                                  <Button type="button" onClick={() => removeSamplingPoint(roomIndex, pointIndex)} variant="ghost" size="icon" className="text-destructive" title="Delete Sampling Point">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            {/* Particle Count ≥0.5μm */}
                            <div className="space-y-2">
                              <Label>No.of Particles ≥ 0.5 µm/m³</Label>
                              <div className="flex gap-2 items-end">
                                {point.readings05.map((reading, readingIndex) => (
                                  <div key={readingIndex} className="flex-1 space-y-1">
                                    <Label className="text-xs">S{readingIndex + 1}</Label>
                                    <Input
                                      type="text"
                                      value={reading === 0 ? '' : formatNumberWithCommas(reading)}
                                      onChange={(e) => {
                                        const newReadings = [...point.readings05];
                                        newReadings[readingIndex] = parseCommaFormattedNumber(e.target.value);
                                        updateSamplingPoint(roomIndex, pointIndex, { readings05: newReadings });
                                      }}
                                      onBlur={(e) => {
                                        // Ensure we store 0 if field is empty on blur
                                        if (!e.target.value || e.target.value.trim() === '') {
                                          const newReadings = [...point.readings05];
                                          newReadings[readingIndex] = 0;
                                          updateSamplingPoint(roomIndex, pointIndex, { readings05: newReadings });
                                        }
                                      }}
                                      placeholder="0"
                                    />
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  onClick={() => {
                                    const newReadings = [...point.readings05, 0];
                                    updateSamplingPoint(roomIndex, pointIndex, { readings05: newReadings });
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="mb-0"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                {point.readings05.length > 1 && user?.role === 'super_admin' && (
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      const newReadings = point.readings05.slice(0, -1);
                                      updateSamplingPoint(roomIndex, pointIndex, { readings05: newReadings });
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="mb-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Average</Label>
                                  <Input
                                    type="number"
                                    value={point.average05.toFixed(2)}
                                    disabled
                                    className="bg-muted"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Particle Count ≥5μm */}
                            <div className="space-y-2">
                              <Label>No.of Particles ≥ 5.0 µm/m³</Label>
                              <div className="flex gap-2 items-end">
                                {point.readings5.map((reading, readingIndex) => (
                                  <div key={readingIndex} className="flex-1 space-y-1">
                                    <Label className="text-xs">S{readingIndex + 1}</Label>
                                    <Input
                                      type="text"
                                      value={reading === 0 ? '' : formatNumberWithCommas(reading)}
                                      onChange={(e) => {
                                        const newReadings = [...point.readings5];
                                        newReadings[readingIndex] = parseCommaFormattedNumber(e.target.value);
                                        updateSamplingPoint(roomIndex, pointIndex, { readings5: newReadings });
                                      }}
                                      onBlur={(e) => {
                                        // Ensure we store 0 if field is empty on blur
                                        if (!e.target.value || e.target.value.trim() === '') {
                                          const newReadings = [...point.readings5];
                                          newReadings[readingIndex] = 0;
                                          updateSamplingPoint(roomIndex, pointIndex, { readings5: newReadings });
                                        }
                                      }}
                                      placeholder="0"
                                    />
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  onClick={() => {
                                    const newReadings = [...point.readings5, 0];
                                    updateSamplingPoint(roomIndex, pointIndex, { readings5: newReadings });
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="mb-0"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                {point.readings5.length > 1 && user?.role === 'super_admin' && (
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      const newReadings = point.readings5.slice(0, -1);
                                      updateSamplingPoint(roomIndex, pointIndex, { readings5: newReadings });
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="mb-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Average</Label>
                                  <Input
                                    type="number"
                                    value={point.average5.toFixed(2)}
                                    disabled
                                    className="bg-muted"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="bg-muted/50 rounded p-2 text-xs">
                              Limits: ≥0.5μm: {point.limit05.toLocaleString()}, ≥5μm: {point.limit5.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <Label>Inference</Label>
                    <Textarea
                      value={formData.inference}
                      onChange={(e) => setFormData({ ...formData, inference: e.target.value })}
                      placeholder="Enter inference text..."
                      className="min-h-[80px]"
                    />
                  </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">AHU Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Rooms</th>
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
                      <td className="px-4 py-3 text-sm">{test.rooms.length}</td>
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



