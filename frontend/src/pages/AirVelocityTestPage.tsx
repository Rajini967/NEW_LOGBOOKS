import React, { useState, useEffect } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Plus, Trash2, Save, Download, Calculator, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { AirVelocityTestData, RoomData, FilterReading } from '@/types/test-certificates';
import {
  calculateAverageVelocity,
  calculateAirFlowCFM,
  calculateTotalAirFlowCFM,
  calculateACH,
  roundToDecimal,
} from '@/lib/test-calculations';
import { generateAirVelocityPDF, downloadPDF } from '@/lib/pdf-generator';
import { testCertificateAPI } from '@/lib/api';

// Default client info
const defaultClientInfo = {
  name: 'Dr. Reddys Laboratories Ltd.',
  address: 'Add, Pu-2, Block-B, Potent Plant, Pydibhimavaram, srikakulam, 532409',
};

// Generate certificate number
async function generateCertificateNo(): Promise<string> {
  try {
    const tests = await testCertificateAPI.airVelocity.list();
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const prefix = `SVU/${month}-`;
    
    // Find highest number for this month
    let maxNum = 0;
    tests.forEach((test: any) => {
      if (test.certificate_no?.startsWith(prefix)) {
        const num = parseInt(test.certificate_no.split('-')[1] || '0');
        if (num > maxNum) maxNum = num;
      }
    });
    
    const nextNum = String(maxNum + 1).padStart(3, '0');
    return `${prefix}${nextNum}`;
  } catch {
    // Fallback if API fails
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `SVU/${month}-001`;
  }
}

export default function AirVelocityTestPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<AirVelocityTestData[]>([]);
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
    testReference: 'ISO14644-1, 2015',
    instrumentName: 'Hot Wire Anemometer',
    instrumentMake: 'LUTRON',
    instrumentModel: '',
    instrumentSerial: '',
    instrumentIdNumber: '',
    calibrationDate: '',
    calibrationDueDate: '',
    ahuNumber: '',
    inference: 'The above test Results it is Concluded that the Clean Room Meets the ISO-8 Specifications.',
    rooms: [] as RoomData[],
  });

  // Regenerate certificate number when dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      const loadCertificateNo = async () => {
        const certNo = await generateCertificateNo();
        setFormData(prev => ({
          ...prev,
          certificateNo: certNo,
          date: format(new Date(), 'yyyy-MM-dd'),
        }));
      };
      loadCertificateNo();
    }
  }, [isDialogOpen]);

  // Load tests from API
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setIsLoading(true);
        const apiTests = await testCertificateAPI.airVelocity.list();
        
        // Transform API data to frontend format
        const transformedTests: AirVelocityTestData[] = apiTests.map((test: any) => {
          const rooms: RoomData[] = test.rooms?.map((room: any) => ({
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
          })) || [];

          return {
            id: test.id,
            clientInfo: {
              name: test.client_name,
              address: test.client_address,
            },
            certificateNo: test.certificate_no,
            date: test.date,
            testReference: test.test_reference || '',
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
      const loadCertificateNo = async () => {
        const certNo = await generateCertificateNo();
        setFormData(prev => ({
          ...prev,
          certificateNo: certNo,
          date: format(new Date(), 'yyyy-MM-dd'),
        }));
      };
      loadCertificateNo();
    }
  }, [isDialogOpen]);

  const addRoom = () => {
    setFormData({
      ...formData,
      rooms: [
        ...formData.rooms,
        {
          roomName: '',
          roomNumber: '',
          filters: [],
          totalAirFlowCFM: 0,
          roomVolumeCFT: 0,
          ach: 0,
          designACPH: undefined,
        },
      ],
    });
  };

  const removeRoom = (roomIndex: number) => {
    setFormData({
      ...formData,
      rooms: formData.rooms.filter((_, i) => i !== roomIndex),
    });
  };

  const updateRoom = (roomIndex: number, updates: Partial<RoomData>) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex] = { ...newRooms[roomIndex], ...updates };
    
    // Recalculate if filters or volume changed
    if (updates.filters || updates.roomVolumeCFT !== undefined) {
      const room = newRooms[roomIndex];
      room.totalAirFlowCFM = calculateTotalAirFlowCFM(room.filters);
      if (room.roomVolumeCFT > 0) {
        room.ach = calculateACH(room.totalAirFlowCFM, room.roomVolumeCFT);
      }
    }
    
    setFormData({ ...formData, rooms: newRooms });
  };

  const addFilter = (roomIndex: number) => {
    const newRooms = [...formData.rooms];
    const room = newRooms[roomIndex];
    room.filters.push({
      filterId: '',
      filterArea: 0,
      readings: [0, 0, 0, 0, 0],
      avgVelocity: 0,
      airFlowCFM: 0,
    });
    updateRoom(roomIndex, { filters: room.filters });
  };

  const removeFilter = (roomIndex: number, filterIndex: number) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].filters = newRooms[roomIndex].filters.filter(
      (_, i) => i !== filterIndex
    );
    updateRoom(roomIndex, { filters: newRooms[roomIndex].filters });
  };

  const updateFilter = (
    roomIndex: number,
    filterIndex: number,
    updates: Partial<FilterReading>
  ) => {
    const newRooms = [...formData.rooms];
    const filter = { ...newRooms[roomIndex].filters[filterIndex], ...updates };
    
    // Recalculate if readings or area changed
    if (updates.readings || updates.filterArea !== undefined) {
      filter.avgVelocity = calculateAverageVelocity(filter.readings);
      filter.airFlowCFM = calculateAirFlowCFM(filter.avgVelocity, filter.filterArea);
    }
    
    newRooms[roomIndex].filters[filterIndex] = filter;
    updateRoom(roomIndex, { filters: newRooms[roomIndex].filters });
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
    
    for (const room of formData.rooms) {
      if (!room.roomName) {
        toast.error('Please enter room name for all rooms');
        return;
      }
      if (room.filters.length === 0) {
        toast.error(`Please add at least one filter for ${room.roomName}`);
        return;
      }
      for (const filter of room.filters) {
        if (!filter.filterId) {
          toast.error('Please enter filter ID for all filters');
          return;
        }
      }
    }

    try {
      // Transform frontend data to API format
      const apiData = {
        certificate_no: formData.certificateNo,
        client_name: formData.clientName,
        client_address: formData.clientAddress,
        date: formData.date,
        test_reference: formData.testReference || undefined,
        ahu_number: formData.ahuNumber,
        inference: formData.inference || undefined,
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
        rooms: formData.rooms.map(room => ({
          room_name: room.roomName,
          room_number: room.roomNumber || undefined,
          total_air_flow_cfm: room.totalAirFlowCFM,
          room_volume_cft: room.roomVolumeCFT,
          ach: room.ach,
          design_acph: room.designACPH || undefined,
          filters: room.filters.map(filter => ({
            filter_id: filter.filterId,
            filter_area: filter.filterArea,
            reading_1: filter.readings[0],
            reading_2: filter.readings[1],
            reading_3: filter.readings[2],
            reading_4: filter.readings[3],
            reading_5: filter.readings[4],
            avg_velocity: filter.avgVelocity,
            air_flow_cfm: filter.airFlowCFM,
          })),
        })),
      };

      await testCertificateAPI.airVelocity.create(apiData);
      
      setIsDialogOpen(false);
      
      // Reset form
      const newCertNo = await generateCertificateNo();
      setFormData({
        ...formData,
        certificateNo: newCertNo,
        date: format(new Date(), 'yyyy-MM-dd'),
        rooms: [],
      });
      
      // Reload tests from API
      const apiTests = await testCertificateAPI.airVelocity.list();
      const transformedTests: AirVelocityTestData[] = apiTests.map((test: any) => {
        const rooms: RoomData[] = test.rooms?.map((room: any) => ({
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
        })) || [];

        return {
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
          testReference: test.test_reference || '',
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
          inference: test.inference || undefined,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
      setTests(transformedTests);
      
      toast.success('Air Velocity test saved successfully');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error?.message || 'Failed to save test');
    }
  };

  const handleGeneratePDF = async (test: AirVelocityTestData) => {
    try {
      const blob = await generateAirVelocityPDF(test);
      const filename = `Air_Velocity_${test.certificateNo}_${test.date}.pdf`;
      downloadPDF(blob, filename);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await testCertificateAPI.airVelocity.approve(id, 'approve');
      // Reload tests
      const apiTests = await testCertificateAPI.airVelocity.list();
      const transformedTests: AirVelocityTestData[] = apiTests.map((test: any) => {
        const rooms: RoomData[] = test.rooms?.map((room: any) => ({
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
        })) || [];

        return {
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
          testReference: test.test_reference || '',
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
          inference: test.inference || undefined,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
      setTests(transformedTests);
      toast.success('Test approved successfully');
    } catch (error: any) {
      console.error('Error approving test:', error);
      toast.error(error?.message || 'Failed to approve test');
    }
  };

  const handleReject = async (id: string) => {
    setRejectConfirmOpen(false);
    try {
      await testCertificateAPI.airVelocity.approve(id, 'reject');
      // Reload tests
      const apiTests = await testCertificateAPI.airVelocity.list();
      const transformedTests: AirVelocityTestData[] = apiTests.map((test: any) => {
        const rooms: RoomData[] = test.rooms?.map((room: any) => ({
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
        })) || [];

        return {
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
          testReference: test.test_reference || '',
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
          inference: test.inference || undefined,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
      setTests(transformedTests);
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
      await testCertificateAPI.airVelocity.delete(id);
      // Reload tests
      const apiTests = await testCertificateAPI.airVelocity.list();
      const transformedTests: AirVelocityTestData[] = apiTests.map((test: any) => {
        const rooms: RoomData[] = test.rooms?.map((room: any) => ({
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
        })) || [];

        return {
          id: test.id,
          clientInfo: {
            name: test.client_name,
            address: test.client_address,
          },
          certificateNo: test.certificate_no,
          date: test.date,
          testReference: test.test_reference || '',
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
          inference: test.inference || undefined,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
      setTests(transformedTests);
      toast.success('Test deleted successfully');
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error?.message || 'Failed to delete test');
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Air Velocity & ACH Test Certificate"
        subtitle="Test certificate for air velocity and air changes per hour"
      />

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
                <DialogTitle>New Air Velocity Test</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Client Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                      required
                    />
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
                  <Textarea
                    value={formData.clientAddress}
                    onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })}
                    required
                    rows={2}
                  />
                </div>

                {/* Test Details */}
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
                    <Label>Test Reference</Label>
                    <Input
                      value={formData.testReference}
                      onChange={(e) => setFormData({ ...formData, testReference: e.target.value })}
                    />
                  </div>
                </div>

                {/* Instrument Details */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Instrument Used</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Instrument Name *</Label>
                      <Input
                        value={formData.instrumentName}
                        onChange={(e) => setFormData({ ...formData, instrumentName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Instrument ID Number</Label>
                      <Input
                        value={formData.instrumentIdNumber}
                        onChange={(e) => setFormData({ ...formData, instrumentIdNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Make *</Label>
                      <Input
                        value={formData.instrumentMake}
                        onChange={(e) => setFormData({ ...formData, instrumentMake: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input
                        value={formData.instrumentModel}
                        onChange={(e) => setFormData({ ...formData, instrumentModel: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* AHU Number and Serial Number */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AHU Number *</Label>
                    <Input
                      value={formData.ahuNumber}
                      onChange={(e) => setFormData({ ...formData, ahuNumber: e.target.value })}
                      placeholder="e.g., AHU-01 - G04"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Serial Number</Label>
                    <Input
                      value={formData.instrumentSerial}
                      onChange={(e) => setFormData({ ...formData, instrumentSerial: e.target.value })}
                    />
                  </div>
                </div>

                {/* Calibration Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Calibration Done Date</Label>
                    <Input
                      type="date"
                      value={formData.calibrationDate}
                      onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Calibration Due Date</Label>
                    <Input
                      type="date"
                      value={formData.calibrationDueDate}
                      onChange={(e) => setFormData({ ...formData, calibrationDueDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Rooms */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Rooms & Filters</h3>
                    <Button type="button" onClick={addRoom} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Room
                    </Button>
                  </div>

                  {formData.rooms.map((room, roomIndex) => (
                    <div key={roomIndex} className="border rounded-lg p-4 mb-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="grid grid-cols-4 gap-4 flex-1">
                          <div className="space-y-2">
                            <Label>Room Name *</Label>
                            <Input
                              value={room.roomName}
                              onChange={(e) => updateRoom(roomIndex, { roomName: e.target.value })}
                              placeholder="e.g., CLEANED EQUIPMENT AREA-1"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Room Number</Label>
                            <Input
                              value={room.roomNumber || ''}
                              onChange={(e) => updateRoom(roomIndex, { roomNumber: e.target.value })}
                              placeholder="e.g., R-001"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Room Volume (CFT) *</Label>
                            <Input
                              type="number"
                              value={room.roomVolumeCFT || ''}
                              onChange={(e) =>
                                updateRoom(roomIndex, { roomVolumeCFT: parseFloat(e.target.value) || 0 })
                              }
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Design ACPH</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={room.designACPH ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                const numValue = value === '' ? undefined : parseFloat(value);
                                updateRoom(roomIndex, { designACPH: isNaN(numValue || 0) ? undefined : numValue });
                              }}
                              placeholder="e.g., 20"
                            />
                          </div>
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
                            <Button
                              type="button"
                              onClick={() => removeRoom(roomIndex)}
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              title="Delete Room"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Label>Filters / Grills</Label>
                            {room.filters.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {room.filters.length} {room.filters.length === 1 ? 'filter' : 'filters'}
                              </Badge>
                            )}
                          </div>
                          <Button
                            type="button"
                            onClick={() => addFilter(roomIndex)}
                            variant="outline"
                            size="sm"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Filter / Grill
                          </Button>
                        </div>
                        {room.filters.length === 0 && (
                          <div className="text-sm text-muted-foreground mb-2 p-2 bg-muted/30 rounded">
                            Click "Add Filter / Grill" to add filters. You can add multiple filters to calculate the total air flow for this room.
                          </div>
                        )}

                        {room.filters.map((filter, filterIndex) => (
                          <div key={filterIndex} className="border rounded p-3 mb-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="grid grid-cols-2 gap-4 flex-1">
                                <div className="space-y-2">
                                  <Label>Filter / Grill ID *</Label>
                                  <Input
                                    value={filter.filterId}
                                    onChange={(e) =>
                                      updateFilter(roomIndex, filterIndex, { filterId: e.target.value })
                                    }
                                    placeholder="e.g., SAG 317 PRB080/0.3μ/01-00"
                                    required
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Filter Area (Sq. ft) *</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={filter.filterArea || ''}
                                    onChange={(e) =>
                                      updateFilter(roomIndex, filterIndex, {
                                        filterArea: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    required
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  type="button"
                                  onClick={() => {
                                    toast.success(`Filter "${filter.filterId || 'Unnamed'}" saved`);
                                  }}
                                  variant="outline"
                                  size="icon"
                                  title="Save Filter"
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                {user?.role === 'super_admin' && (
                                <Button
                                  type="button"
                                  onClick={() => removeFilter(roomIndex, filterIndex)}
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  title="Delete Filter"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold">Velocity Readings in FPM</Label>
                              <div className="grid grid-cols-5 gap-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                  <div key={i} className="space-y-1">
                                    <Label className="text-xs">Reading {i + 1} (FPM)</Label>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      value={filter.readings[i] || ''}
                                      onChange={(e) => {
                                        const newReadings = [...filter.readings] as [number, number, number, number, number];
                                        newReadings[i] = parseFloat(e.target.value) || 0;
                                        updateFilter(roomIndex, filterIndex, { readings: newReadings });
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {filter.avgVelocity > 0 && (
                              <div className="bg-muted/50 rounded p-2 text-sm">
                                <div className="flex justify-between">
                                  <span>Avg Velocity:</span>
                                  <span className="font-semibold">{roundToDecimal(filter.avgVelocity, 1)} FPM</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Air Flow CFM:</span>
                                  <span className="font-semibold">{roundToDecimal(filter.airFlowCFM, 1)} CFM</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {room.totalAirFlowCFM > 0 && room.ach > 0 && (
                          <div className="bg-accent/10 rounded p-3 mt-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Room Summary:</span>
                              <div className="flex gap-4">
                                <span>Total CFM: {roundToDecimal(room.totalAirFlowCFM, 1)}</span>
                                <span>ACPH: {roundToDecimal(room.ach, 1)}</span>
                              </div>
                            </div>
                            {room.filters.length > 1 && (
                              <div className="text-xs text-muted-foreground mt-2">
                                Total calculated from {room.filters.length} filters: {room.filters.map((f, idx) => `${roundToDecimal(f.airFlowCFM, 1)} CFM`).join(' + ')} = {roundToDecimal(room.totalAirFlowCFM, 1)} CFM
                              </div>
                            )}
                          </div>
                        )}
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
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent">
                    <Save className="w-4 h-4 mr-2" />
                    Save Test
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tests List */}
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
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Loading tests...
                    </td>
                  </tr>
                ) : tests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No tests found. Create a new test to get started.
                    </td>
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

