export type MissingSlotsEquipment = {
  equipment_id: string;
  equipment_name: string;
  interval: "hourly" | "shift" | "daily";
  shift_duration_hours: number;
  expected_slot_count: number;
  present_slot_count: number;
  missing_slot_count: number;
  next_due: string | null;
  last_reading_timestamp?: string | null;
  missing_slots: {
    slot_start: string;
    slot_end: string;
    label: string;
  }[];
};

export type MissingSlotsResponse = {
  date: string;
  log_type: string;
  total_expected_slots: number;
  total_present_slots: number;
  total_missing_slots: number;
  equipment_count: number;
  affected_equipment_count: number;
  equipments: MissingSlotsEquipment[];
};

export type MissingSlotsRangeDay = MissingSlotsResponse;

export type MissingSlotsRangeResponse = {
  log_type: string;
  date_from: string;
  date_to: string;
  day_count: number;
  total_expected_slots: number;
  total_present_slots: number;
  total_missing_slots: number;
  affected_day_count: number;
  days: MissingSlotsRangeDay[];
};
