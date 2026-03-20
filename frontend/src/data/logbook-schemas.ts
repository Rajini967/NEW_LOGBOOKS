import { LogbookSchema } from '@/types/logbook-config';

// Chiller Monitoring Logbook Schema
export const chillerMonitoringSchema: LogbookSchema = {
  id: 'chiller-monitoring',
  name: 'Chiller Monitoring Log',
  description: 'Daily chiller monitoring with temperature and pressure readings',
  clientId: 'svu-enterprises',
  category: 'utility',
  fields: [
    {
      id: 'date',
      name: 'date',
      label: 'Date',
      type: 'date',
      required: true,
      defaultValue: 'auto',
      display: { order: 1, group: 'Basic Info', columnSpan: 1 }
    },
    {
      id: 'time',
      name: 'time',
      label: 'Time',
      type: 'datetime',
      required: true,
      defaultValue: 'auto',
      display: { order: 2, group: 'Basic Info', columnSpan: 1 }
    },
    {
      id: 'remarks',
      name: 'remarks',
      label: 'Remarks',
      type: 'textarea',
      required: false,
      placeholder: 'Add any observations or notes...',
      display: { order: 10, group: 'Additional Info', columnSpan: 2 }
    },
    {
      id: 'checked_by',
      name: 'checked_by',
      label: 'Checked By',
      type: 'text',
      required: true,
      defaultValue: 'auto',
      display: { order: 11, group: 'Signature', columnSpan: 1 }
    }
  ],
  workflow: {
    requiresApproval: true,
    approvalRoles: ['supervisor', 'super_admin'],
    autoApprove: false
  },
  display: {
    icon: 'Thermometer',
    color: 'blue',
    defaultView: 'table'
  }
};

// Air Velocity & ACH Test Certificate Schema
export const airVelocityTestSchema: LogbookSchema = {
  id: 'air-velocity-test',
  name: 'Air Velocity & ACH Test Certificate',
  description: 'Test certificate for average air velocity and air changes per hour',
  clientId: 'svu-enterprises',
  category: 'validation',
  fields: [
    {
      id: 'client_name',
      name: 'client_name',
      label: 'Client',
      type: 'text',
      required: true,
      display: { order: 1, group: 'Client Information', columnSpan: 1 }
    },
    {
      id: 'client_address',
      name: 'client_address',
      label: 'Address',
      type: 'textarea',
      required: true,
      display: { order: 2, group: 'Client Information', columnSpan: 2 }
    },
    {
      id: 'certificate_number',
      name: 'certificate_number',
      label: 'Certificate No.',
      type: 'text',
      required: true,
      display: { order: 3, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'test_date',
      name: 'test_date',
      label: 'Date of Test',
      type: 'date',
      required: true,
      display: { order: 4, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'test_reference',
      name: 'test_reference',
      label: 'Test Reference',
      type: 'text',
      required: true,
      defaultValue: 'ISO14644-1, 2015',
      display: { order: 5, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'instrument_name',
      name: 'instrument_name',
      label: 'Instrument Used',
      type: 'text',
      required: true,
      display: { order: 6, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'instrument_make',
      name: 'instrument_make',
      label: 'Make',
      type: 'text',
      required: true,
      display: { order: 7, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'instrument_model',
      name: 'instrument_model',
      label: 'Model',
      type: 'text',
      required: true,
      display: { order: 8, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'ahu_number',
      name: 'ahu_number',
      label: 'AHU NO.',
      type: 'text',
      required: true,
      display: { order: 9, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'serial_number',
      name: 'serial_number',
      label: 'S No.',
      type: 'text',
      required: true,
      display: { order: 10, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'calibration_date',
      name: 'calibration_date',
      label: 'Calibration On',
      type: 'date',
      required: true,
      display: { order: 11, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'calibration_due_date',
      name: 'calibration_due_date',
      label: 'Calibration Due On',
      type: 'date',
      required: true,
      display: { order: 12, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'room_name',
      name: 'room_name',
      label: 'Room Name',
      type: 'text',
      required: true,
      display: { order: 13, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'grill_filter_ref',
      name: 'grill_filter_ref',
      label: 'Grill/Filter Reference No.',
      type: 'text',
      required: true,
      display: { order: 14, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'filter_area',
      name: 'filter_area',
      label: 'Filter Area (Sq. ft)',
      type: 'number',
      required: true,
      display: { order: 15, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'velocity_reading_1',
      name: 'velocity_reading_1',
      label: 'Velocity Reading 1 (FPM)',
      type: 'number',
      required: true,
      display: { order: 16, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'velocity_reading_2',
      name: 'velocity_reading_2',
      label: 'Velocity Reading 2 (FPM)',
      type: 'number',
      required: true,
      display: { order: 17, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'velocity_reading_3',
      name: 'velocity_reading_3',
      label: 'Velocity Reading 3 (FPM)',
      type: 'number',
      required: true,
      display: { order: 18, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'velocity_reading_4',
      name: 'velocity_reading_4',
      label: 'Velocity Reading 4 (FPM)',
      type: 'number',
      required: true,
      display: { order: 19, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'velocity_reading_5',
      name: 'velocity_reading_5',
      label: 'Velocity Reading 5 (FPM)',
      type: 'number',
      required: true,
      display: { order: 20, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'avg_velocity',
      name: 'avg_velocity',
      label: 'Avg Velocity (FPM)',
      type: 'calculated',
      required: false,
      calculation: {
        formula: '(velocity_reading_1 + velocity_reading_2 + velocity_reading_3 + velocity_reading_4 + velocity_reading_5) / 5',
        dependsOn: ['velocity_reading_1', 'velocity_reading_2', 'velocity_reading_3', 'velocity_reading_4', 'velocity_reading_5']
      },
      display: { order: 21, group: 'Calculated Results', columnSpan: 1 },
      metadata: {
        decimalPlaces: 1
      }
    },
    {
      id: 'air_flow',
      name: 'air_flow',
      label: 'Air Flow (CFM)',
      type: 'calculated',
      required: false,
      calculation: {
        formula: 'avg_velocity * filter_area',
        dependsOn: ['avg_velocity', 'filter_area']
      },
      display: { order: 22, group: 'Calculated Results', columnSpan: 1 },
      metadata: {
        decimalPlaces: 1
      }
    },
    {
      id: 'total_air_flow',
      name: 'total_air_flow',
      label: 'Total Air Flow (CFM)',
      type: 'calculated',
      required: false,
      calculation: {
        formula: 'air_flow * 3.416',
        dependsOn: ['air_flow']
      },
      display: { order: 23, group: 'Calculated Results', columnSpan: 1 },
      metadata: {
        decimalPlaces: 1
      }
    },
    {
      id: 'room_volume',
      name: 'room_volume',
      label: 'Room Volume (CFT)',
      type: 'number',
      required: true,
      display: { order: 24, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'ach',
      name: 'ach',
      label: 'Air Changes per Hour',
      type: 'calculated',
      required: false,
      calculation: {
        formula: '(total_air_flow * 60) / room_volume',
        dependsOn: ['total_air_flow', 'room_volume']
      },
      display: { order: 25, group: 'Calculated Results', columnSpan: 1 }
    }
  ],
  workflow: {
    requiresApproval: true,
    approvalRoles: ['supervisor', 'super_admin']
  },
  display: {
    icon: 'Wind',
    color: 'teal',
    defaultView: 'table'
  }
};

// HEPA Filter Integrity Test Schema
export const hepaFilterTestSchema: LogbookSchema = {
  id: 'hepa-filter-integrity',
  name: 'HEPA Filter Integrity Test',
  description: 'HEPA filter integrity test certificate',
  clientId: 'svu-enterprises',
  category: 'validation',
  fields: [
    {
      id: 'client_name',
      name: 'client_name',
      label: 'Client',
      type: 'text',
      required: true,
      display: { order: 1, group: 'Client Information', columnSpan: 1 }
    },
    {
      id: 'client_address',
      name: 'client_address',
      label: 'Address',
      type: 'textarea',
      required: true,
      display: { order: 2, group: 'Client Information', columnSpan: 2 }
    },
    {
      id: 'certificate_number',
      name: 'certificate_number',
      label: 'Certificate No.',
      type: 'text',
      required: true,
      display: { order: 3, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'test_date',
      name: 'test_date',
      label: 'Date of Test',
      type: 'date',
      required: true,
      display: { order: 4, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'test_reference',
      name: 'test_reference',
      label: 'Test Reference',
      type: 'text',
      required: true,
      defaultValue: 'ISO 14644-1:2015',
      display: { order: 5, group: 'Certificate Details', columnSpan: 1 }
    },
    {
      id: 'instrument_name',
      name: 'instrument_name',
      label: 'Instrument Used',
      type: 'text',
      required: true,
      display: { order: 6, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'instrument_make',
      name: 'instrument_make',
      label: 'Make',
      type: 'text',
      required: true,
      display: { order: 7, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'instrument_model',
      name: 'instrument_model',
      label: 'Model',
      type: 'text',
      required: true,
      display: { order: 8, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'serial_number',
      name: 'serial_number',
      label: 'S No.',
      type: 'text',
      required: true,
      display: { order: 9, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'calibration_date',
      name: 'calibration_date',
      label: 'Calibration On',
      type: 'date',
      required: true,
      display: { order: 10, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'calibration_due_date',
      name: 'calibration_due_date',
      label: 'Calibration Due On',
      type: 'date',
      required: true,
      display: { order: 11, group: 'Instrument Used', columnSpan: 1 }
    },
    {
      id: 'room_name',
      name: 'room_name',
      label: 'Room Name',
      type: 'text',
      required: true,
      display: { order: 12, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'filter_grill_id',
      name: 'filter_grill_id',
      label: 'Filter/Grill Id no',
      type: 'text',
      required: true,
      display: { order: 13, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'upstream_concentration',
      name: 'upstream_concentration',
      label: 'Upstream Concentration (%)',
      type: 'number',
      required: true,
      defaultValue: 100,
      display: { order: 14, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'aerosol_concentration',
      name: 'aerosol_concentration',
      label: 'Aerosol Concentration (20 to 80 µg/litre)',
      type: 'number',
      required: true,
      validation: {
        min: 20,
        max: 80
      },
      display: { order: 15, group: 'Test Results', columnSpan: 1 }
    },
    {
      id: 'downstream_leakage',
      name: 'downstream_leakage',
      label: 'Obtained Results in Downstream (%Leakage)',
      type: 'number',
      required: true,
      display: { order: 16, group: 'Test Results', columnSpan: 1 },
      metadata: {
        decimalPlaces: 4
      }
    },
    {
      id: 'acceptable_limit',
      name: 'acceptable_limit',
      label: 'Acceptable Limit in Downstream (%Leakage)',
      type: 'number',
      required: true,
      defaultValue: 0.01,
      display: { order: 17, group: 'Test Results', columnSpan: 1 },
      metadata: {
        decimalPlaces: 2
      }
    },
    {
      id: 'test_status',
      name: 'test_status',
      label: 'Test Status',
      type: 'select',
      required: true,
      options: ['PASS', 'FAIL'],
      calculation: {
        formula: 'downstream_leakage <= acceptable_limit ? "PASS" : "FAIL"',
        dependsOn: ['downstream_leakage', 'acceptable_limit']
      },
      display: { order: 18, group: 'Test Results', columnSpan: 1 },
      metadata: {
        highlightColor: {
          PASS: 'green',
          FAIL: 'red'
        }
      }
    }
  ],
  workflow: {
    requiresApproval: true,
    approvalRoles: ['supervisor', 'super_admin']
  },
  display: {
    icon: 'Filter',
    color: 'purple',
    defaultView: 'table'
  }
};

// Equipment Area Logbook Schema
export const equipmentAreaSchema: LogbookSchema = {
  id: 'equipment-area',
  name: 'Equipment Area Logbook',
  description: 'Equipment area monitoring with sections and totals',
  clientId: 'svu-enterprises',
  category: 'utility',
  fields: [
    {
      id: 'area',
      name: 'area',
      label: 'Area',
      type: 'select',
      required: true,
      options: [
        'ENT AREA-1',
        'EQUIPMENT DRYING AREA-1',
        'EQUIPMENT WASH AREA-1',
        'USED EQUIPM ENT HOLD AREA-1',
        'AIR LOCK-1'
      ],
      display: { order: 1, group: 'Area Information', columnSpan: 1 }
    },
    {
      id: 'sag_number',
      name: 'sag_number',
      label: 'SAG Number / PRB Code',
      type: 'text',
      required: true,
      placeholder: 'e.g., SAG 317 PRB080/0.3μ/02-00',
      display: { order: 2, group: 'Area Information', columnSpan: 1 }
    },
    {
      id: 'filter_area',
      name: 'filter_area',
      label: 'Filter Area',
      type: 'number',
      required: true,
      defaultValue: 4,
      display: { order: 3, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'velocity_1',
      name: 'velocity_1',
      label: 'Velocity Reading 1',
      type: 'number',
      required: true,
      display: { order: 4, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'velocity_2',
      name: 'velocity_2',
      label: 'Velocity Reading 2',
      type: 'number',
      required: true,
      display: { order: 5, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'velocity_3',
      name: 'velocity_3',
      label: 'Velocity Reading 3',
      type: 'number',
      required: true,
      display: { order: 6, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'velocity_4',
      name: 'velocity_4',
      label: 'Velocity Reading 4',
      type: 'number',
      required: true,
      display: { order: 7, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'velocity_5',
      name: 'velocity_5',
      label: 'Velocity Reading 5',
      type: 'number',
      required: true,
      display: { order: 8, group: 'Readings', columnSpan: 1 }
    },
    {
      id: 'avg_velocity',
      name: 'avg_velocity',
      label: 'Average Velocity',
      type: 'calculated',
      calculation: {
        formula: '(velocity_1 + velocity_2 + velocity_3 + velocity_4 + velocity_5) / 5',
        dependsOn: ['velocity_1', 'velocity_2', 'velocity_3', 'velocity_4', 'velocity_5']
      },
      display: { order: 9, group: 'Calculated', columnSpan: 1 },
      metadata: {
        decimalPlaces: 1
      }
    },
    {
      id: 'air_flow',
      name: 'air_flow',
      label: 'Air Flow',
      type: 'calculated',
      calculation: {
        formula: 'avg_velocity * filter_area',
        dependsOn: ['avg_velocity', 'filter_area']
      },
      display: { order: 10, group: 'Calculated', columnSpan: 1 },
      metadata: {
        decimalPlaces: 1
      }
    }
  ],
  metadata: {
    supportsSections: true,
    supportsTotals: true,
    sectionField: 'area'
  },
  workflow: {
    requiresApproval: true,
    approvalRoles: ['supervisor', 'super_admin']
  },
  display: {
    icon: 'Grid3X3',
    color: 'orange',
    defaultView: 'table'
  }
};

// Export all schemas
export const allSchemas: LogbookSchema[] = [
  chillerMonitoringSchema,
  airVelocityTestSchema,
  hepaFilterTestSchema,
  equipmentAreaSchema
];

// Helper function to get schema by ID
export function getSchemaById(id: string): LogbookSchema | undefined {
  return allSchemas.find(schema => schema.id === id);
}

// Helper function to get schemas by category
export function getSchemasByCategory(category: string): LogbookSchema[] {
  return allSchemas.filter(schema => schema.category === category);
}

