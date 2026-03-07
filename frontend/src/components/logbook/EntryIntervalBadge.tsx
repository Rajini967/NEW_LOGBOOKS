import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Clock } from 'lucide-react';
import type { LogEntryIntervalType } from '@/types';

function formatEntryIntervalLabel(
  interval: LogEntryIntervalType,
  shiftDurationHours?: number
): string {
  switch (interval) {
    case 'hourly':
      return 'Hourly';
    case 'shift':
      return shiftDurationHours
        ? `Every ${shiftDurationHours} h (shift)`
        : 'Shift';
    case 'daily':
      return 'Daily';
    default:
      return 'Hourly';
  }
}

/**
 * Displays the configured log book entry interval (common for all log monitors).
 * Renders nothing if session settings are not loaded yet.
 */
export function EntryIntervalBadge() {
  const { sessionSettings } = useAuth();
  const interval = sessionSettings?.log_entry_interval;
  const shiftHours = sessionSettings?.shift_duration_hours;

  if (!interval) return null;

  const label = formatEntryIntervalLabel(
    interval as LogEntryIntervalType,
    shiftHours
  );

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span>
        Entry interval: <span className="font-medium text-foreground">{label}</span>
      </span>
    </div>
  );
}
