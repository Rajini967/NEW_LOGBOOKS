export type UserRole = 'operator' | 'supervisor' | 'customer' | 'super_admin';

// Field Types
export type FieldType = 
  | 'text' 
  | 'number' 
  | 'textarea' 
  | 'select' 
  | 'multiselect' 
  | 'date' 
  | 'datetime' 
  | 'boolean' 
  | 'file' 
  | 'signature'
  | 'calculated';

// Field Configuration
export interface LogbookField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: any;
  placeholder?: string;
  options?: string[]; // For select/multiselect
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    customMessage?: string;
  };
  calculation?: {
    formula: string; // e.g., "field1 + field2" or "(v1 + v2 + v3) / 3"
    dependsOn: string[]; // Field IDs this depends on
  };
  display?: {
    order: number;
    group?: string;
    columnSpan?: number; // For grid layout (1-4)
    hidden?: boolean;
  };
  metadata?: {
    limit?: {
      type: 'min' | 'max';
      value: number;
      unit: string;
      condition: string; // 'NMT', 'NLT', etc.
    };
    highlightColor?: string | Record<string, string>; // 'red' or { PASS: 'green', FAIL: 'red' }
    decimalPlaces?: number;
    /**
     * When true on a select field, render a cascading
     * Department → Category → Equipment selector backed by Equipment Master.
     */
    equipmentSelector?: boolean;
  };
}

// Logbook Template/Schema
export interface LogbookSchema {
  id: string;
  name: string;
  description?: string;
  clientId: string;
  category: string; // e.g., 'utility', 'maintenance', 'quality', 'safety', 'validation'
  fields: LogbookField[];
  workflow?: {
    requiresApproval: boolean;
    approvalRoles: UserRole[];
    autoApprove?: boolean;
  };
  display?: {
    icon?: string;
    color?: string;
    defaultView?: 'table' | 'card' | 'list';
  };
  metadata?: {
    supportsSections?: boolean;
    supportsTotals?: boolean;
    sectionField?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// Dynamic Logbook Entry
export interface LogbookEntry {
  id: string;
  schemaId: string;
  clientId: string;
  siteId?: string;
  data: Record<string, any>; // Dynamic field values
  operatorId: string;
  operatorName: string;
  timestamp: Date;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  remarks?: string;
  attachments?: string[];
}

// Client Configuration
export interface Client {
  id: string;
  name: string;
  logo?: string;
  settings: {
    timezone: string;
    dateFormat: string;
    numberFormat: string;
    defaultLanguage: string;
  };
  logbookSchemas: string[]; // Schema IDs
  permissions: {
    canCreateLogbooks: boolean;
    canCustomizeFields: boolean;
    maxCustomFields?: number;
  };
}

// Template Library
export interface LogbookTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  schema: Omit<LogbookSchema, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>;
  isPublic: boolean; // Can be used by any client
}

