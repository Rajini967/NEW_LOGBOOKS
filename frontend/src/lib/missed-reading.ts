/**
 * Compute "next due" time and whether the scheduled reading is missed
 * based on last entry timestamp and the configured log entry interval.
 */

export type LogEntryIntervalType = 'hourly' | 'shift' | 'daily';

export interface NextDueResult {
  nextDue: Date | null;
  isMissed: boolean;
}

export interface EquipmentMissInfo {
  equipmentId: string;
  equipmentName?: string;
  lastTimestamp: Date | null;
  nextDue: Date | null;
  isMissed: boolean;
  interval: LogEntryIntervalType;
  shiftHours: number;
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

/**
 * Compute next-due and missed status for each equipment, given:
 * - a list of logs (must contain timestamp, equipment_id, optional equipment_name)
 * - per-equipment interval + shift-hours resolvers
 *
 * This is a pure helper used by hooks/pages so we can show
 * equipment-wise missed-reading messages.
 */
export function computeMissedByEquipment(
  logs: any[],
  opts: {
    resolveInterval: (equipmentId?: string, equipmentName?: string) => LogEntryIntervalType;
    resolveShiftHours: (equipmentId?: string, equipmentName?: string) => number;
  }
): EquipmentMissInfo[] {
  if (!logs || logs.length === 0) return [];

  // Find latest log per equipment_id
  const latestByEq = new Map<
    string,
    { equipmentId: string; equipmentName?: string; ts: Date | null }
  >();

  for (const raw of logs as any[]) {
    const equipmentId: string = raw.equipment_id || raw.equipment || raw.equipmentId || '';
    if (!equipmentId) continue;
    const ts =
      raw.timestamp != null
        ? raw.timestamp instanceof Date
          ? raw.timestamp
          : new Date(raw.timestamp)
        : null;
    const prev = latestByEq.get(equipmentId);
    if (!prev || (ts && prev.ts && ts.getTime() > prev.ts.getTime()) || (!prev.ts && ts)) {
      latestByEq.set(equipmentId, {
        equipmentId,
        equipmentName: raw.equipment_name || raw.name || undefined,
        ts,
      });
    }
  }

  const result: EquipmentMissInfo[] = [];

  latestByEq.forEach(({ equipmentId, equipmentName, ts }) => {
    const interval = opts.resolveInterval(equipmentId, equipmentName);
    const shiftHours = opts.resolveShiftHours(equipmentId, equipmentName);
    const { nextDue, isMissed } = getNextDueAndMissed(ts, interval, shiftHours);
    result.push({
      equipmentId,
      equipmentName,
      lastTimestamp: ts,
      nextDue,
      isMissed,
      interval,
      shiftHours,
    });
  });

  return result;
}
