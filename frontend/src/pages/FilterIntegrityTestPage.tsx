import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { FilterIntegrityTestData, FilterIntegrityRoomData, FilterIntegrityReading } from '@/types/test-certificates';
import { calculateLeakagePercentage, checkFilterIntegrity, roundToDecimal } from '@/lib/test-calculations';
import { generateFilterIntegrityPDF, downloadPDF } from '@/lib/pdf-generator';
import { testCertificateAPI } from '@/lib/api';

const defaultClientInfo = {
  name: 'Dr. Reddys Laboratories Ltd.',
  address: 'Add, Pu-2, Block-B, Potent Plant, Pydibhimavaram, srikakulam, 532409',
};

async function generateCertificateNo(): Promise<string> {
  try {
    const tests = await testCertificateAPI.filterIntegrity.list();
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

export default function FilterIntegrityTestPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<FilterIntegrityTestData[]>([]);
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
    testReference: 'ISO 14644-1: 2015',
    instrumentName: 'Aerosol Generator / Photometer',
    instrumentMake: '',
    instrumentModel: '',
    instrumentSerial: '',
    instrumentIdNumber: '',
    calibrationDate: '',
    calibrationDueDate: '',
    ahuNumber: '',
    inference: 'The HEPA filters in the above specified Rooms qualifies the leak test by Cold PAO method.',
    rooms: [] as FilterIntegrityRoomData[],
  });

  // Load tests from API
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setIsLoading(true);
        const apiTests = await testCertificateAPI.filterIntegrity.list();
        
        const transformedTests: FilterIntegrityTestData[] = apiTests.map((test: any) => {
          const rooms: FilterIntegrityRoomData[] = test.rooms?.map((room: any) => ({
            roomName: room.room_name,
            roomNumber: room.room_number || undefined,
            filters: room.readings?.map((reading: any) => ({
              filterId: reading.filter_id,
              upstreamConcentration: reading.upstream_concentration,
              aerosolConcentration: reading.aerosol_concentration,
              downstreamConcentration: reading.downstream_concentration,
              downstreamLeakage: reading.downstream_leakage,
              acceptableLimit: reading.acceptable_limit,
              testStatus: reading.test_status as 'PASS' | 'FAIL',
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
            inference: test.inference,
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
    setFormData({ ...formData, rooms: [...formData.rooms, { roomName: '', roomNumber: '', filters: [] }] });
  };

  const removeRoom = (roomIndex: number) => {
    setFormData({ ...formData, rooms: formData.rooms.filter((_, i) => i !== roomIndex) });
  };

  const addFilter = (roomIndex: number) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].filters.push({
      filterId: '',
      upstreamConcentration: 100, // Default to 100%
      aerosolConcentration: 0, // This is the downstream measurement in µg/litre
      downstreamConcentration: 0, // Downstream concentration in µg/litre
      downstreamLeakage: 0,
      acceptableLimit: 0.01,
      testStatus: 'PASS',
    });
    setFormData({ ...formData, rooms: newRooms });
  };

  const removeFilter = (roomIndex: number, filterIndex: number) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].filters = newRooms[roomIndex].filters.filter((_, i) => i !== filterIndex);
    setFormData({ ...formData, rooms: newRooms });
  };

  const updateFilter = (roomIndex: number, filterIndex: number, updates: Partial<FilterIntegrityReading>) => {
    const newRooms = [...formData.rooms];
    const filter = { ...newRooms[roomIndex].filters[filterIndex], ...updates };
    
    // Use only downstreamConcentration for calculation - don't use aerosolConcentration as fallback
    // They are separate independent fields
    const downstreamValue = filter.downstreamConcentration || 0;
    
    // Recalculate leakage and status when upstream or downstream concentration changes
    // Note: aerosolConcentration changes should NOT trigger recalculation
    if (updates.upstreamConcentration !== undefined || updates.downstreamConcentration !== undefined || updates.acceptableLimit !== undefined) {
      // Calculate leakage: leakage = (downstream / upstream) * 100
      if (filter.upstreamConcentration > 0 && downstreamValue > 0) {
        // Direct calculation: leakage = (downstream / upstream) * 100
        filter.downstreamLeakage = calculateLeakagePercentage(
          filter.upstreamConcentration,
          downstreamValue
        );
      } else {
        filter.downstreamLeakage = 0;
      }
      // Determine PASS/FAIL: leakage <= acceptable_limit
      filter.testStatus = checkFilterIntegrity(filter.downstreamLeakage, filter.acceptableLimit);
    }
    
    newRooms[roomIndex].filters[filterIndex] = filter;
    setFormData({ ...formData, rooms: newRooms });
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

    try {
      const apiData = {
        certificate_no: formData.certificateNo,
        client_name: formData.clientName,
        client_address: formData.clientAddress,
        date: formData.date,
        test_reference: formData.testReference || undefined,
        ahu_number: formData.ahuNumber,
        inference: formData.inference,
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
          readings: room.filters.map(filter => ({
            filter_id: filter.filterId,
            upstream_concentration: filter.upstreamConcentration,
            aerosol_concentration: filter.aerosolConcentration,
            downstream_concentration: filter.downstreamConcentration,
            downstream_leakage: filter.downstreamLeakage,
            acceptable_limit: filter.acceptableLimit,
            test_status: filter.testStatus,
          })),
        })),
      };

      await testCertificateAPI.filterIntegrity.create(apiData);
      
      setIsDialogOpen(false);
      const newCertNo = await generateCertificateNo();
      setFormData({ ...formData, certificateNo: newCertNo, date: format(new Date(), 'yyyy-MM-dd'), rooms: [] });
      
      // Reload tests
      const apiTests = await testCertificateAPI.filterIntegrity.list();
      const transformedTests: FilterIntegrityTestData[] = apiTests.map((test: any) => {
        const rooms: FilterIntegrityRoomData[] = test.rooms?.map((room: any) => ({
          roomName: room.room_name,
          roomNumber: room.room_number || undefined,
          filters: room.readings?.map((reading: any) => ({
            filterId: reading.filter_id,
            upstreamConcentration: reading.upstream_concentration,
            aerosolConcentration: reading.aerosol_concentration,
            downstreamConcentration: reading.downstream_concentration,
            downstreamLeakage: reading.downstream_leakage,
            acceptableLimit: reading.acceptable_limit,
            testStatus: reading.test_status as 'PASS' | 'FAIL',
          })) || [],
        })) || [];

        return {
          id: test.id,
          clientInfo: { name: test.client_name, address: test.client_address },
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
          inference: test.inference,
          rooms,
          preparedBy: test.prepared_by,
          approvedBy: test.approved_by_id ? test.operator_name : undefined,
          timestamp: new Date(test.timestamp),
          status: test.status as 'pending' | 'approved' | 'rejected',
        };
      });
      setTests(transformedTests);
      
      toast.success('Filter Integrity test saved successfully');
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast.error(error?.message || 'Failed to save test');
    }
  };

  const handleGeneratePDF = async (test: FilterIntegrityTestData) => {
    try {
      const blob = await generateFilterIntegrityPDF(test);
      downloadPDF(blob, `Filter_Integrity_${test.certificateNo}_${test.date}.pdf`);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const refreshTests = async () => {
    try {
      const apiTests = await testCertificateAPI.filterIntegrity.list();
      const transformedTests: FilterIntegrityTestData[] = apiTests.map((test: any) => {
        const rooms: FilterIntegrityRoomData[] = test.rooms?.map((room: any) => ({
          roomName: room.room_name,
          roomNumber: room.room_number || undefined,
          filters: room.readings?.map((reading: any) => ({
            filterId: reading.filter_id,
            upstreamConcentration: reading.upstream_concentration,
            aerosolConcentration: reading.aerosol_concentration,
            downstreamConcentration: reading.downstream_concentration,
            downstreamLeakage: reading.downstream_leakage,
            acceptableLimit: reading.acceptable_limit,
            testStatus: reading.test_status as 'PASS' | 'FAIL',
          })) || [],
        })) || [];

        return {
          id: test.id,
          clientInfo: { name: test.client_name, address: test.client_address },
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
          inference: test.inference,
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

  const handleApprove = async (id: string) => {
    setApproveConfirmOpen(false);
    try {
      await testCertificateAPI.filterIntegrity.approve(id, 'approve');
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
      await testCertificateAPI.filterIntegrity.approve(id, 'reject');
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
      await testCertificateAPI.filterIntegrity.delete(id);
      await refreshTests();
      toast.success('Test deleted successfully');
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error?.message || 'Failed to delete test');
    }
  };

  return (
    <div className="min-h-screen">
      <Header title="Filter Integrity Test Certificate" subtitle="HEPA Filter Integrity Test" />
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
                <DialogTitle>New Filter Integrity Test</DialogTitle>
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
                  <Textarea value={formData.clientAddress} onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })} required rows={2} />
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
                    <Label>Test Reference</Label>
                    <Input value={formData.testReference} onChange={(e) => setFormData({ ...formData, testReference: e.target.value })} />
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
                    <h3 className="font-semibold">Rooms & Filters</h3>
                    <Button type="button" onClick={addRoom} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Room
                    </Button>
                  </div>
                  {formData.rooms.map((room, roomIndex) => (
                    <div key={roomIndex} className="border rounded-lg p-4 mb-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="grid grid-cols-2 gap-4 flex-1">
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
                          <Label>Filters</Label>
                          <Button type="button" onClick={() => addFilter(roomIndex)} variant="outline" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Filter
                          </Button>
                        </div>
                        {room.filters.map((filter, filterIndex) => (
                          <div key={filterIndex} className="border rounded p-3 mb-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="grid grid-cols-2 gap-4 flex-1">
                                <div className="space-y-2">
                                  <Label>Filter ID *</Label>
                                  <Input
                                    value={filter.filterId}
                                    onChange={(e) => updateFilter(roomIndex, filterIndex, { filterId: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Acceptable Limit (%)</Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={filter.acceptableLimit ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === '') {
                                        updateFilter(roomIndex, filterIndex, { acceptableLimit: undefined });
                                      } else {
                                        const numValue = parseFloat(value);
                                        updateFilter(roomIndex, filterIndex, { acceptableLimit: isNaN(numValue) ? undefined : numValue });
                                      }
                                    }}
                                    onBlur={(e) => {
                                      // Set to 0 if field is left empty on blur
                                      if (!e.target.value || e.target.value.trim() === '') {
                                        updateFilter(roomIndex, filterIndex, { acceptableLimit: 0 });
                                      }
                                    }}
                                    placeholder="e.g., 0.01"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Upstream Concentration (%) *</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={filter.upstreamConcentration || ''}
                                    onChange={(e) => updateFilter(roomIndex, filterIndex, { upstreamConcentration: parseFloat(e.target.value) || 100 })}
                                    placeholder="100"
                                    required
                                  />
                                  <p className="text-xs text-muted-foreground">Default: 100%</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Aerosol Concentration in (20 to 80 µg/litre)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="20"
                                    max="80"
                                    value={filter.aerosolConcentration || ''}
                                    onChange={(e) => updateFilter(roomIndex, filterIndex, { aerosolConcentration: parseFloat(e.target.value) || 0 })}
                                    placeholder="Enter value between 20-80"
                                  />
                                  <p className="text-xs text-muted-foreground">Generated aerosol concentration</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Obtained Results in Downstream (%Leakage) *</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={filter.downstreamConcentration ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                      updateFilter(roomIndex, filterIndex, { downstreamConcentration: value });
                                    }}
                                    placeholder="Enter measured downstream value"
                                    required
                                  />
                                  <p className="text-xs text-muted-foreground">Measured downstream concentration</p>
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
                                <Button type="button" onClick={() => removeFilter(roomIndex, filterIndex)} variant="ghost" size="icon" className="text-destructive" title="Delete Filter">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              </div>
                            </div>
                            {filter.downstreamConcentration > 0 && filter.upstreamConcentration > 0 && (
                              <div className="bg-muted/50 rounded p-2 text-sm space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">Calculated % Leakage:</span>
                                  <span className="font-semibold">
                                    {roundToDecimal(filter.downstreamLeakage, 4)}%
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">Test Status:</span>
                                  <span className={`font-semibold px-2 py-1 rounded ${filter.testStatus === 'FAIL' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                                    {filter.testStatus}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Formula: (Downstream {filter.downstreamConcentration} / Upstream {filter.upstreamConcentration}) × 100 = {roundToDecimal(filter.downstreamLeakage, 4)}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Acceptable Limit: {filter.acceptableLimit}% | {filter.testStatus === 'PASS' ? '✓ Within limit' : '✗ Exceeds limit'}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>Inference</Label>
                  <Textarea value={formData.inference} onChange={(e) => setFormData({ ...formData, inference: e.target.value })} rows={2} />
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
                      <td className="px-4 py-3 text-sm">{test.ahuNumber}</td>
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

