export const parseBriquetteTimeToMinutes = (value: string): number => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.POSITIVE_INFINITY;
  return hh * 60 + mm;
};
