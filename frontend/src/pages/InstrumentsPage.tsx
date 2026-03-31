import React, { useState, useRef } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Wrench, Calendar, FileText, Upload, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface Instrument {
  id: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  ahuNumber?: string;
  idNumber?: string;
  calibrationDate: Date;
  calibrationDueDate: Date;
  certificateUrl?: string;
  status: 'valid' | 'expiring' | 'expired';
}

// TODO: Replace with API call to fetch instruments
export default function InstrumentsPage() {
  // TODO: Replace with API call to fetch instruments from backend
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    make: '',
    model: '',
    serialNumber: '',
    ahuNumber: '',
    idNumber: '',
    calibrationDate: '',
    calibrationDueDate: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'valid':
        return { variant: 'success' as const, icon: CheckCircle2, label: 'Valid' };
      case 'expiring':
        return { variant: 'warning' as const, icon: Clock, label: 'Expiring Soon' };
      case 'expired':
        return { variant: 'danger' as const, icon: AlertTriangle, label: 'Expired' };
      default:
        return { variant: 'secondary' as const, icon: Clock, label: 'Unknown' };
    }
  };

  const getDaysUntilDue = (dueDate: Date) => {
    return differenceInDays(dueDate, new Date());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      // Validate file type (PDF or image)
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a PDF or image file');
        return;
      }
      setSelectedFile(file);
      toast.success('File selected successfully');
    }
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const calibDate = new Date(formData.calibrationDate);
    const dueDate = new Date(formData.calibrationDueDate);
    const daysUntil = getDaysUntilDue(dueDate);
    
    let status: 'valid' | 'expiring' | 'expired' = 'valid';
    if (daysUntil < 0) status = 'expired';
    else if (daysUntil < 30) status = 'expiring';

    // TODO: Upload file to backend and get URL
    // For now, create a local URL if file is selected
    let certificateUrl: string | undefined;
    if (selectedFile) {
      certificateUrl = URL.createObjectURL(selectedFile);
    }

    const newInstrument: Instrument = {
      id: `INS-${String(instruments.length + 1).padStart(3, '0')}`,
      name: formData.name,
      make: formData.make,
      model: formData.model,
      serialNumber: formData.serialNumber,
      ahuNumber: formData.ahuNumber || undefined,
      idNumber: formData.idNumber || undefined,
      calibrationDate: calibDate,
      calibrationDueDate: dueDate,
      certificateUrl,
      status,
    };

    setInstruments([newInstrument, ...instruments]);
    setIsDialogOpen(false);
    setFormData({
      name: '',
      make: '',
      model: '',
      serialNumber: '',
      ahuNumber: '',
      idNumber: '',
      calibrationDate: '',
      calibrationDueDate: '',
    });
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('Instrument registered successfully');
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Instrument Management"
        subtitle="Track calibration status and certificates"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="data-label">Total Instruments</p>
            <p className="reading-display text-2xl">{instruments.length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Valid</p>
            <p className="reading-display text-2xl text-success">
              {instruments.filter(i => i.status === 'valid').length}
            </p>
          </div>
          <div className="metric-card">
            <p className="data-label">Expiring Soon</p>
            <p className="reading-display text-2xl text-warning">
              {instruments.filter(i => i.status === 'expiring').length}
            </p>
          </div>
          <div className="metric-card">
            <p className="data-label">Expired</p>
            <p className="reading-display text-2xl text-danger">
              {instruments.filter(i => i.status === 'expired').length}
            </p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="success">{instruments.filter(i => i.status === 'valid').length} Valid</Badge>
            <Badge variant="warning">{instruments.filter(i => i.status === 'expiring').length} Expiring</Badge>
            <Badge variant="danger">{instruments.filter(i => i.status === 'expired').length} Expired</Badge>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                Register Instrument
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Register New Instrument
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Instrument Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Anemometer"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instrument ID Number</Label>
                    <Input
                      value={formData.idNumber}
                      onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                      placeholder="e.g., INS-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Make</Label>
                    <Input
                      value={formData.make}
                      onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                      placeholder="e.g., TSI"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      placeholder="e.g., VelociCalc 9565"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AHU Number</Label>
                    <Input
                      value={formData.ahuNumber}
                      onChange={(e) => setFormData({ ...formData, ahuNumber: e.target.value })}
                      placeholder="e.g., AHU-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Serial Number</Label>
                    <Input
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder="e.g., TSI-2024-001"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Calibration Done Date
                    </Label>
                    <Input
                      type="date"
                      value={formData.calibrationDate}
                      onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Calibration Due Date
                    </Label>
                    <Input
                      type="date"
                      value={formData.calibrationDueDate}
                      onChange={(e) => setFormData({ ...formData, calibrationDueDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Calibration Certificate
                  </Label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*"
                    className="hidden"
                  />
                  <div 
                    onClick={handleFileUploadClick}
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent transition-colors cursor-pointer"
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    {selectedFile ? (
                      <>
                        <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">Click to upload PDF or image</p>
                        <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent">
                    Register Instrument
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Instruments Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instruments.map((instrument) => {
            const statusInfo = getStatusInfo(instrument.status);
            const StatusIcon = statusInfo.icon;
            const daysUntil = getDaysUntilDue(instrument.calibrationDueDate);

            return (
              <div
                key={instrument.id}
                className={cn(
                  'bg-card rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer',
                  instrument.status === 'expired' && 'border-danger/30',
                  instrument.status === 'expiring' && 'border-warning/30'
                )}
                onClick={() => setSelectedInstrument(instrument)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-accent" />
                  </div>
                  <Badge variant={statusInfo.variant}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                </div>

                <h4 className="font-semibold text-foreground mb-1">{instrument.name}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {instrument.make} {instrument.model}
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Serial</span>
                    <span className="font-mono text-foreground">{instrument.serialNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Calibrated</span>
                    <span className="text-foreground">{format(instrument.calibrationDate, 'dd MMM yyyy')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due</span>
                    <span className={cn(
                      'font-medium',
                      daysUntil < 0 ? 'text-danger' : daysUntil < 30 ? 'text-warning' : 'text-foreground'
                    )}>
                      {format(instrument.calibrationDueDate, 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>

                {daysUntil >= 0 && daysUntil < 30 && (
                  <div className="mt-3 p-2 rounded bg-warning/10 text-warning text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {daysUntil} days until calibration due
                  </div>
                )}
                {daysUntil < 0 && (
                  <div className="mt-3 p-2 rounded bg-danger/10 text-danger text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Overdue by {Math.abs(daysUntil)} days
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
