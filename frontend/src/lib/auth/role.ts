import type { UserRole } from '@/types';

const KNOWN_ROLES: UserRole[] = ['operator', 'supervisor', 'admin', 'manager', 'super_admin'];

/**
 * Map API / stored role strings to canonical UserRole values used across the app.
 * Handles whitespace, casing, legacy `client` (pre–migration 0014), and common variants.
 */
export function normalizeUserRole(raw: unknown): UserRole {
  if (raw === null || raw === undefined) {
    return 'operator';
  }
  let s = String(raw).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.toLowerCase().replace(/\s+/g, '_');
  if (s === 'super-admin') {
    s = 'super_admin';
  }
  if (s === 'client') {
    s = 'manager';
  }
  if (KNOWN_ROLES.includes(s as UserRole)) {
    return s as UserRole;
  }
  if (import.meta.env.DEV) {
    console.warn('[auth] Unknown user role from API, defaulting to operator:', raw);
  }
  return 'operator';
}

/** Roles allowed to PATCH equipment master fields (log interval / shift / tolerance) from logbook save. Matches backend CanAccessEquipmentMasterData. */
const EQUIPMENT_INTERVAL_PATCH_ROLES: UserRole[] = [
  'supervisor',
  'manager',
  'admin',
  'super_admin',
];

export function canPatchEquipmentLogIntervalFromLogbook(userRole: unknown): boolean {
  const r = normalizeUserRole(userRole);
  return EQUIPMENT_INTERVAL_PATCH_ROLES.includes(r);
}

/** Matches backend CanManageChemicalInventory — stock CRUD and assignment create/update/delete. */
const CHEMICAL_INVENTORY_ROLES: UserRole[] = [
  'supervisor',
  'manager',
  'admin',
  'super_admin',
];

export function canManageChemicalInventory(userRole: unknown): boolean {
  const r = normalizeUserRole(userRole);
  return CHEMICAL_INVENTORY_ROLES.includes(r);
}

/** Matches backend CanApproveChemicalAssignment — approve/reject only (not supervisor). */
const CHEMICAL_ASSIGNMENT_APPROVE_ROLES: UserRole[] = ['manager', 'admin', 'super_admin'];

export function canApproveChemicalAssignment(userRole: unknown): boolean {
  const r = normalizeUserRole(userRole);
  return CHEMICAL_ASSIGNMENT_APPROVE_ROLES.includes(r);
}

/** Filter hub + settings (categories, register, schedules list): all roles except operator. */
export function canAccessFilterHub(userRole: unknown): boolean {
  return normalizeUserRole(userRole) !== 'operator';
}

/** Matches backend CanApproveFilterSchedule — approve/reject schedule (not supervisor). */
const FILTER_SCHEDULE_APPROVE_ROLES: UserRole[] = ['manager', 'admin', 'super_admin'];

export function canApproveFilterSchedule(userRole: unknown): boolean {
  const r = normalizeUserRole(userRole);
  return FILTER_SCHEDULE_APPROVE_ROLES.includes(r);
}

/** Filter schedule delete is super admin only. */
export function canDeleteFilterSchedule(userRole: unknown): boolean {
  return normalizeUserRole(userRole) === 'super_admin';
}

/** Matches backend CanApproveFilterRegister — approve/reject register row (not supervisor). */
const FILTER_REGISTER_APPROVE_ROLES: UserRole[] = ['manager', 'admin', 'super_admin'];

export function canApproveFilterRegister(userRole: unknown): boolean {
  const r = normalizeUserRole(userRole);
  return FILTER_REGISTER_APPROVE_ROLES.includes(r);
}
