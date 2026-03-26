/**
 * Chiller monitoring PDF / UI limits — aligned with ELogBookPage equipmentLimits.chiller.
 */

export type ChillerLimitConfig =
  | { type: 'NLT'; min: number; unit: string }
  | { type: 'NMT'; max: number; unit: string };

/** Keys that participate in limit hints and red-cell highlighting on PDF grid. */
export const CHILLER_LIMIT_FIELD_KEYS = [
  'evapWaterInletPressure',
  'evapWaterOutletPressure',
  'evapEnteringWaterTemp',
  'evapLeavingWaterTemp',
  'evapApproachTemp',
  'condWaterInletPressure',
  'condWaterOutletPressure',
  'condEnteringWaterTemp',
  'condLeavingWaterTemp',
  'condApproachTemp',
  'chillerControlSignal',
  'avgMotorCurrent',
  'compressorRunningTimeMin',
  'starterEnergyKwh',
] as const;

export type ChillerLimitFieldKey = (typeof CHILLER_LIMIT_FIELD_KEYS)[number];

export const CHILLER_LIMITS: Record<ChillerLimitFieldKey, ChillerLimitConfig> = {
  evapWaterInletPressure: { type: 'NLT', min: 2.5, unit: 'kg/cm²' },
  evapWaterOutletPressure: { type: 'NLT', min: 2.0, unit: 'kg/cm²' },
  evapEnteringWaterTemp: { type: 'NMT', max: 18, unit: '°C' },
  evapLeavingWaterTemp: { type: 'NMT', max: 13, unit: '°C' },
  evapApproachTemp: { type: 'NMT', max: 4, unit: '°C' },
  condWaterInletPressure: { type: 'NLT', min: 1.5, unit: 'kg/cm²' },
  condWaterOutletPressure: { type: 'NLT', min: 1.0, unit: 'kg/cm²' },
  condEnteringWaterTemp: { type: 'NMT', max: 35, unit: '°C' },
  condLeavingWaterTemp: { type: 'NMT', max: 40, unit: '°C' },
  condApproachTemp: { type: 'NMT', max: 6, unit: '°C' },
  chillerControlSignal: { type: 'NMT', max: 100, unit: '%' },
  avgMotorCurrent: { type: 'NMT', max: 100, unit: 'A' },
  compressorRunningTimeMin: { type: 'NMT', max: 60 * 24, unit: 'min' },
  starterEnergyKwh: { type: 'NMT', max: 1000, unit: 'kWh' },
};

export function formatChillerLimitHint(fieldKey: string): string {
  const cfg = CHILLER_LIMITS[fieldKey as ChillerLimitFieldKey];
  if (!cfg) return '';
  if (cfg.type === 'NLT') return `NLT ${cfg.min} ${cfg.unit}`;
  return `NMT ${cfg.max} ${cfg.unit}`;
}

export function isChillerValueOutOfLimit(fieldKey: string, value: number | undefined | null): boolean {
  if (value == null || Number.isNaN(Number(value))) return false;
  const cfg = CHILLER_LIMITS[fieldKey as ChillerLimitFieldKey];
  if (!cfg) return false;
  const n = Number(value);
  if (cfg.type === 'NMT') return n > cfg.max;
  return n < cfg.min;
}
