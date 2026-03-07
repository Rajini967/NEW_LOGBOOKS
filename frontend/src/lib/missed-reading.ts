/**
 * Compute "next due" time and whether the scheduled reading is missed
 * based on last entry timestamp and the configured log entry interval.
 */

export type LogEntryIntervalType = 'hourly' | 'shift' | 'daily';

export interface NextDueResult {
  nextDue: Date | null;
  isMissed: boolean;
}

/**
 * Returns the next due time and whether the reading is missed.
 * - If there is no last entry, returns nextDue: null, isMissed: false (no popup).
 * - Otherwise nextDue = lastEntryTimestamp + interval; isMissed = now > nextDue.
 */
export function getNextDueAndMissed(
  lastEntryTimestamp: Date | null,
  interval: LogEntryIntervalType,
  shiftDurationHours: number
): NextDueResult {
  if (lastEntryTimestamp == null) {
    return { nextDue: null, isMissed: false };
  }

  const last = lastEntryTimestamp.getTime();
  let nextDueMs: number;

  switch (interval) {
    case 'hourly':
      nextDueMs = last + 60 * 60 * 1000;
      break;
    case 'shift':
      nextDueMs = last + shiftDurationHours * 60 * 60 * 1000;
      break;
    case 'daily':
      nextDueMs = last + 24 * 60 * 60 * 1000;
      break;
    default:
      nextDueMs = last + 60 * 60 * 1000;
  }

  const nextDue = new Date(nextDueMs);
  const isMissed = Date.now() > nextDueMs;

  return { nextDue, isMissed };
}
