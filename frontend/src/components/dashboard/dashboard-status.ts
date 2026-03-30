export type RowStatus = 'on_target' | 'over' | 'unknown';

/**
 * Compare actual vs limit (preferred) or projected when limit is not set.
 */
export function rowStatus(
  actual: number,
  limit: number,
  projected: number
): RowStatus {
  if (limit > 0) {
    return actual <= limit ? 'on_target' : 'over';
  }
  if (projected > 0) {
    return actual <= projected ? 'on_target' : 'over';
  }
  return 'unknown';
}

/** Donut fill 0–100 when limit exists; null if no meaningful target. */
export function utilizationDonutPct(
  utilizationPct: number | null | undefined,
  limitPositive: boolean
): number | null {
  if (!limitPositive || utilizationPct == null || Number.isNaN(utilizationPct)) {
    return null;
  }
  return Math.min(100, Math.max(0, utilizationPct));
}

export function formatDiffPct(actual: number, target: number): string {
  if (target === 0) return '—';
  const pct = ((actual - target) / target) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
