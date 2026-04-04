export type UserRole = 'operator' | 'supervisor' | 'admin' | 'manager' | 'super_admin';

export interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  role_display?: string;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_locked?: boolean;
  locked_until?: string | null;
  must_change_password?: boolean;
  password_expired?: boolean;
  siteId?: string;
  assigned_department?: string | null;
  assigned_equipment?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface UserResponse extends User {
  role_display: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

export interface UtilityReading {
  id: string;
  equipmentType: 'chiller' | 'boiler' | 'compressor';
  equipmentId: string;
  timestamp: Date;
  operatorId: string;
  operatorName: string;
  t1: number;
  t2: number;
  p1: number;
  p2: number;
  flowRate: number;
  remarks: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}

export interface ChemicalPreparation {
  id: string;
  chemicalName: string;
  equipmentId: string;
  concentration: number;
  waterVolume: number;
  chemicalQuantity: number;
  timestamp: Date;
  operatorId: string;
  operatorName: string;
  remarks: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}

export interface HVACValidation {
  id: string;
  roomName: string;
  isoClass: 5 | 6 | 7 | 8;
  roomVolume: number;
  gridReadings: number[];
  averageVelocity: number;
  flowRateCFM: number;
  totalCFM: number;
  ach: number;
  designSpec: number;
  result: 'pass' | 'fail';
  timestamp: Date;
  operatorId: string;
  operatorName: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}

export interface Instrument {
  id: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  calibrationDate: Date;
  calibrationDueDate: Date;
  certificateUrl?: string;
  status: 'valid' | 'expiring' | 'expired';
}

export interface Site {
  id: string;
  name: string;
  location: string;
  customerId: string;
}

/** Log book entry interval – common for all log monitors */
export type LogEntryIntervalType = 'hourly' | 'shift' | 'daily';

export interface SessionSettings {
  auto_logout_minutes: number;
  password_expiry_days?: number | null;
  log_entry_interval?: LogEntryIntervalType;
  shift_duration_hours?: number;
  updated_at?: string;
}

export interface SessionSettingsUpdate {
  auto_logout_minutes?: number;
  password_expiry_days?: number | null;
  log_entry_interval?: LogEntryIntervalType;
  shift_duration_hours?: number;
}
