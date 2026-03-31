import { FilterReading, RecoveryDataPoint } from '@/types/test-certificates';

/**
 * Calculate average velocity from 5 readings
 */
export function calculateAverageVelocity(readings: [number, number, number, number, number]): number {
  const sum = readings.reduce((a, b) => a + b, 0);
  return sum / readings.length;
}

/**
 * Calculate Air Flow in CFM
 * CFM = Average Velocity (FPM) × Filter Area (Sq. ft)
 */
export function calculateAirFlowCFM(avgVelocity: number, filterArea: number): number {
  return avgVelocity * filterArea;
}

/**
 * Calculate Air Changes Per Hour (ACH)
 * ACH = (Total Air Flow CFM × 60) / Room Volume (CFT)
 */
export function calculateACH(totalCFM: number, roomVolumeCFT: number): number {
  if (roomVolumeCFT === 0) return 0;
  return (totalCFM * 60) / roomVolumeCFT;
}

/**
 * Check Filter Integrity - PASS if leakage is within limit
 */
export function checkFilterIntegrity(leakage: number, limit: number = 0.01): 'PASS' | 'FAIL' {
  return leakage <= limit ? 'PASS' : 'FAIL';
}

/**
 * Calculate Filter Leakage Percentage
 * Leakage % = (Downstream / Upstream) × 100
 * 
 * @param upstream - Upstream concentration in %
 * @param downstream - Downstream concentration in µg/litre
 * @returns Leakage percentage (up to 4 decimal places)
 */
export function calculateLeakagePercentage(
  upstream: number,
  downstream: number
): number {
  if (upstream === 0) return 0;
  const leakage = (downstream / upstream) * 100;
  return roundToDecimal(leakage, 4);
}

/**
 * Calculate Recovery Time
 * Time from contamination (AHU OFF) to baseline (AHU ON and particles normalized)
 */
// ISO-8 limits for Recovery Test (At Rest)
const ISO8_LIMIT_05 = 3520000; // ≥0.5µm particles/m³
const ISO8_LIMIT_5 = 29300;    // ≥5.0µm particles/m³
const RECOVERY_TIME_LIMIT = 15; // minutes

/**
 * Calculate recovery time based on ISO-8 limits
 * Logic:
 * 1. Find worst condition (max particles when AHU is OFF)
 * 2. Find recovery point (first time after AHU ON where both particle sizes ≤ ISO limits)
 * 3. Calculate time difference and round up conservatively
 */
export function calculateRecoveryTime(timeSeries: RecoveryDataPoint[]): number {
  if (timeSeries.length < 2) return 0;

  // Step 1: Find worst condition (maximum particle count when AHU is OFF)
  let worstIndex = -1;
  let maxParticles = 0;
  
  for (let i = 0; i < timeSeries.length; i++) {
    if (timeSeries[i].ahuStatus === 'OFF') {
      // Use sum of both particle counts to find worst condition
      const totalParticles = timeSeries[i].particleCount05 + timeSeries[i].particleCount5;
      if (totalParticles > maxParticles) {
        maxParticles = totalParticles;
        worstIndex = i;
      }
    }
  }

  if (worstIndex === -1) return 0; // No OFF state found

  const worstTime = parseTime(timeSeries[worstIndex].time);

  // Step 2: Find recovery point (point after AHU is ON where both particle sizes ≤ ISO limits)
  // Check ALL points after AHU turns ON and find the one with lowest particle counts
  // (closest to baseline) that are still within ISO limits
  let recoveryIndex = -1;
  let lowestTotalParticles = Infinity;

  // Start searching from the point AFTER worst condition
  // Only check records where AHU is ON
  for (let i = worstIndex + 1; i < timeSeries.length; i++) {
    const point = timeSeries[i];
    
    // Only check records where AHU is ON (timeline_after_AHU_ON)
    if (point.ahuStatus === 'ON') {
      const count05 = point.particleCount05 || 0;
      const count5 = point.particleCount5 || 0;
      const withinLimit05 = count05 <= ISO8_LIMIT_05;
      const withinLimit5 = count5 <= ISO8_LIMIT_5;
      
      // Check if both particle sizes are within ISO limits
      if (withinLimit05 && withinLimit5) {
        // Calculate total particles to find the point closest to baseline
        const totalParticles = count05 + count5;
        
        // If this is the first valid point OR has lower particle counts, use it
        if (recoveryIndex === -1 || totalParticles < lowestTotalParticles) {
          recoveryIndex = i;
          lowestTotalParticles = totalParticles;
        }
        // Continue checking all points to find the one with lowest counts
      }
    }
  }

  if (recoveryIndex === -1) {
    // Recovery not achieved - return time from worst to last measurement
    const lastTime = parseTime(timeSeries[timeSeries.length - 1].time);
    return Math.ceil(lastTime - worstTime); // Round up to minutes
  }

  // Step 3: Calculate recovery time in minutes (rounded up conservatively)
  const recoveryTime = parseTime(timeSeries[recoveryIndex].time);
  const timeDiffMinutes = recoveryTime - worstTime;
  
  // Round up conservatively (e.g., 3.25 min → 4 min, 3.01 min → 4 min)
  // Math.ceil ensures any fractional minutes round up to the next whole minute
  return Math.ceil(timeDiffMinutes);
}

/**
 * Check recovery test status (PASS/FAIL)
 * PASS if recovery time ≤ 15 minutes
 */
export function checkRecoveryStatus(recoveryTime: number): 'PASS' | 'FAIL' {
  return recoveryTime <= RECOVERY_TIME_LIMIT ? 'PASS' : 'FAIL';
}

/**
 * Generate audit statement for recovery test
 */
export function generateRecoveryAuditStatement(recoveryTime: number, roomName?: string): string {
  const roomText = roomName ? ` in ${roomName}` : '';
  return `The cleanroom${roomText} was subjected to a recovery test by switching OFF the AHU to create worst particle conditions and subsequently switching it ON. The room recovered to ISO Class 8 limits within ${recoveryTime} minute${recoveryTime !== 1 ? 's' : ''}, which is ${recoveryTime <= RECOVERY_TIME_LIMIT ? 'within' : 'outside'} the acceptable recovery time. Hence, the test is considered ${recoveryTime <= RECOVERY_TIME_LIMIT ? 'satisfactory' : 'unsatisfactory'}.`;
}

/**
 * Parse time string (HH:MM:SS or HH:MM) to minutes since midnight
 * Handles both formats: "13:34:44" and "13:34"
 * If seconds are missing, assumes 0 seconds
 */
function parseTime(timeStr: string): number {
  if (!timeStr || timeStr.trim() === '') return 0;
  
  const parts = timeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0; // Will be 0 if format is HH:MM
  
  // Convert to total minutes (including seconds as fraction)
  // Example: 13:34:44 = 13*60 + 34 + 44/60 = 814.733 minutes
  // Example: 13:34 = 13*60 + 34 + 0/60 = 814 minutes
  const totalMinutes = hours * 60 + minutes + seconds / 60;
  
  return totalMinutes;
}

/**
 * Check Differential Pressure - PASS if reading >= limit (NLT)
 */
export function checkDifferentialPressure(dp: number, limit: number = 5): 'PASS' | 'FAIL' {
  return dp >= limit ? 'PASS' : 'FAIL';
}

/**
 * Calculate total air flow CFM for a room (sum of all filters)
 */
export function calculateTotalAirFlowCFM(filters: FilterReading[]): number {
  return filters.reduce((sum, filter) => sum + filter.airFlowCFM, 0);
}

/**
 * Round to specified decimal places
 */
export function roundToDecimal(value: number, decimals: number = 1): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Calculate average from an array of readings
 */
export function calculateAverage(readings: number[]): number {
  if (readings.length === 0) return 0;
  const sum = readings.reduce((a, b) => a + b, 0);
  return sum / readings.length;
}

