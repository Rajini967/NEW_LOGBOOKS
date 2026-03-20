import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaintenanceActivityType, MaintenanceTimingsValue } from "@/types/maintenance-timings";

type Props = {
  value: MaintenanceTimingsValue;
  onChange: (next: MaintenanceTimingsValue) => void;
  disabled?: boolean;
};

const ACTIVITY_OPTIONS: { value: MaintenanceActivityType; label: string }[] = [
  { value: "operation", label: "Operation" },
  { value: "maintenance", label: "Maintenance" },
  { value: "shutdown", label: "Shutdown" },
];

export function MaintenanceTimingsSection({ value, onChange, disabled = false }: Props) {
  const showTimingWindow = value.activityType !== "operation";

  return (
    <div className="space-y-3 pt-2">
      <h3 className="text-sm font-semibold border-b pb-2">Maintenance Timings</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Activity *</Label>
          <Select
            value={value.activityType}
            onValueChange={(v) =>
              onChange({ ...value, activityType: v as MaintenanceActivityType })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select activity" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showTimingWindow && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From date</Label>
              <Input
                type="date"
                value={value.fromDate}
                onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>To date</Label>
              <Input
                type="date"
                value={value.toDate}
                onChange={(e) => onChange({ ...value, toDate: e.target.value })}
                min={value.fromDate || undefined}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From time</Label>
              <Input
                type="time"
                value={value.fromTime}
                onChange={(e) => onChange({ ...value, fromTime: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>To time</Label>
              <Input
                type="time"
                value={value.toTime}
                onChange={(e) => onChange({ ...value, toTime: e.target.value })}
                min={value.fromTime || undefined}
                disabled={disabled}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

