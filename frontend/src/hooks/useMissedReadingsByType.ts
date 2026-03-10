import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  chillerLogAPI,
  boilerLogAPI,
  filterLogAPI,
  chemicalPrepAPI,
  equipmentAPI,
  equipmentCategoryAPI,
  filterAssignmentAPI,
} from '@/lib/api';
import {
  getNextDueAndMissed,
  computeMissedByEquipment,
  type EquipmentMissInfo,
} from '@/lib/missed-reading';
import type { LogEntryIntervalType } from '@/types';

export interface MissedByLogType {
  chiller: boolean;
  boiler: boolean;
  filter: boolean;
  chemical: boolean;
}

export interface MissedByEquipmentResult {
  byEquipment: Record<string, EquipmentMissInfo>;
  loading: boolean;
}

function getLatestLog(items: any[]): { timestamp: Date | null; equipmentId?: string; equipmentName?: string } | null {
  if (!items || items.length === 0) return null;
  const withTs = items
    .map((item) => ({
      item,
      ts: item.timestamp ? new Date(item.timestamp).getTime() : null,
    }))
    .filter((x): x is { item: any; ts: number } => x.ts != null && !Number.isNaN(x.ts));
  if (withTs.length === 0) return null;
  const latest = withTs.reduce((a, b) => (a.ts >= b.ts ? a : b));
  const ts = latest.item.timestamp ? new Date(latest.item.timestamp) : null;
  return {
    timestamp: ts,
    equipmentId: latest.item.equipment_id,
    equipmentName: latest.item.equipment_name,
  };
}

export function useMissedReadingsByType(): {
  missedByLogType: MissedByLogType;
  loading: boolean;
} {
  const { sessionSettings } = useAuth();
  const [missedByLogType, setMissedByLogType] = useState<MissedByLogType>({
    chiller: false,
    boiler: false,
    filter: false,
    chemical: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionSettings?.log_entry_interval) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const defaultInterval = sessionSettings.log_entry_interval as LogEntryIntervalType;
    const defaultShiftHours = sessionSettings.shift_duration_hours ?? 8;

    (async () => {
      try {
        const [chillerList, boilerList, filterList, chemicalList] = await Promise.all([
          chillerLogAPI.list().catch(() => []),
          boilerLogAPI.list().catch(() => []),
          filterLogAPI.list().catch(() => []),
          chemicalPrepAPI.list().catch(() => []),
        ]);

        if (cancelled) return;

        const chillerLatest = getLatestLog(chillerList as any[]);
        const boilerLatest = getLatestLog(boilerList as any[]);
        const filterLatest = getLatestLog(filterList as any[]);
        const chemicalLatest = getLatestLog(chemicalList as any[]);

        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        const byName = (n: string) => (categories || []).find((c) => (c.name || '').toLowerCase().trim() === n.toLowerCase().trim());
        const chillerCat = byName('chiller') || byName('chillers');
        const boilerCat = byName('boiler') || byName('boilers');
        const chemicalCat = byName('chemical') || byName('chemicals');

        const [chillerEq, boilerEq, chemicalEq, allEq, assignments] = await Promise.all([
          chillerCat ? equipmentAPI.list({ category: chillerCat.id }) : Promise.resolve([]),
          boilerCat ? equipmentAPI.list({ category: boilerCat.id }) : Promise.resolve([]),
          chemicalCat ? equipmentAPI.list({ category: chemicalCat.id }) : Promise.resolve([]),
          equipmentAPI.list(),
          filterAssignmentAPI.list(),
        ]);

        if (cancelled) return;

        const allEqMap = new Map<string, { log_entry_interval?: string | null; shift_duration_hours?: number | null }>();
        for (const e of (allEq as any[]) || []) {
          if (e?.id && (e.log_entry_interval != null || e.shift_duration_hours != null)) {
            allEqMap.set(e.id, {
              log_entry_interval: e.log_entry_interval ?? null,
              shift_duration_hours: e.shift_duration_hours ?? null,
            });
          }
        }
        const filterIdToInterval = new Map<string, { log_entry_interval?: string | null; shift_duration_hours?: number | null }>();
        for (const a of (assignments as any[]) || []) {
          if (a?.filter_id && a?.equipment) {
            const iv = allEqMap.get(a.equipment);
            if (iv) filterIdToInterval.set(a.filter_id, iv);
          }
        }

        const resolveChiller = (equipmentId?: string) => {
          const eq = (chillerEq as any[])?.find((e: any) => e?.equipment_number === equipmentId);
          return eq?.log_entry_interval ? (eq.log_entry_interval as LogEntryIntervalType) : defaultInterval;
        };
        const resolveChillerShift = (equipmentId?: string) => {
          const eq = (chillerEq as any[])?.find((e: any) => e?.equipment_number === equipmentId);
          return eq?.shift_duration_hours ?? defaultShiftHours;
        };
        const resolveBoiler = (equipmentId?: string) => {
          const eq = (boilerEq as any[])?.find((e: any) => e?.equipment_number === equipmentId);
          return eq?.log_entry_interval ? (eq.log_entry_interval as LogEntryIntervalType) : defaultInterval;
        };
        const resolveBoilerShift = (equipmentId?: string) => {
          const eq = (boilerEq as any[])?.find((e: any) => e?.equipment_number === equipmentId);
          return eq?.shift_duration_hours ?? defaultShiftHours;
        };
        const resolveFilter = (filterId?: string) => {
          const iv = filterId ? filterIdToInterval.get(filterId) : undefined;
          return (iv?.log_entry_interval as LogEntryIntervalType) || defaultInterval;
        };
        const resolveFilterShift = (filterId?: string) => {
          const iv = filterId ? filterIdToInterval.get(filterId) : undefined;
          return iv?.shift_duration_hours ?? defaultShiftHours;
        };
        const resolveChemical = (equipmentName?: string) => {
          const partBeforeDash = (equipmentName || '').split(' – ')[0]?.trim() || equipmentName || '';
          const eq = (chemicalEq as any[])?.find(
            (e: any) =>
              e?.equipment_number === partBeforeDash ||
              e?.equipment_number === equipmentName ||
              e?.name === equipmentName,
          );
          return eq?.log_entry_interval ? (eq.log_entry_interval as LogEntryIntervalType) : defaultInterval;
        };
        const resolveChemicalShift = (equipmentName?: string) => {
          const partBeforeDash = (equipmentName || '').split(' – ')[0]?.trim() || equipmentName || '';
          const eq = (chemicalEq as any[])?.find(
            (e: any) =>
              e?.equipment_number === partBeforeDash ||
              e?.equipment_number === equipmentName ||
              e?.name === equipmentName,
          );
          return eq?.shift_duration_hours ?? defaultShiftHours;
        };

        const chillerRes = getNextDueAndMissed(
          chillerLatest?.timestamp ?? null,
          resolveChiller(chillerLatest?.equipmentId),
          resolveChillerShift(chillerLatest?.equipmentId),
        );
        const boilerRes = getNextDueAndMissed(
          boilerLatest?.timestamp ?? null,
          resolveBoiler(boilerLatest?.equipmentId),
          resolveBoilerShift(boilerLatest?.equipmentId),
        );
        const filterRes = getNextDueAndMissed(
          filterLatest?.timestamp ?? null,
          resolveFilter(filterLatest?.equipmentId),
          resolveFilterShift(filterLatest?.equipmentId),
        );
        const chemicalRes = getNextDueAndMissed(
          chemicalLatest?.timestamp ?? null,
          resolveChemical(chemicalLatest?.equipmentName),
          resolveChemicalShift(chemicalLatest?.equipmentName),
        );

        setMissedByLogType({
          chiller: chillerRes.isMissed,
          boiler: boilerRes.isMissed,
          filter: filterRes.isMissed,
          chemical: chemicalRes.isMissed,
        });
      } catch {
        if (!cancelled) setMissedByLogType({ chiller: false, boiler: false, filter: false, chemical: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionSettings?.log_entry_interval, sessionSettings?.shift_duration_hours]);

  return { missedByLogType, loading };
}

export function useChillerMissedReadings(): MissedByEquipmentResult {
  const { sessionSettings } = useAuth();
  const [byEquipment, setByEquipment] = useState<Record<string, EquipmentMissInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionSettings?.log_entry_interval) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const defaultInterval = sessionSettings.log_entry_interval as LogEntryIntervalType;
    const defaultShiftHours = sessionSettings.shift_duration_hours ?? 8;

    (async () => {
      try {
        setLoading(true);
        const [chillerList, categories, allEq] = await Promise.all([
          chillerLogAPI.list().catch(() => []),
          equipmentCategoryAPI.list().catch(() => []),
          equipmentAPI.list().catch(() => []),
        ]);
        if (cancelled) return;

        const byName = (n: string) =>
          (categories as any[]).find(
            (c) => (c.name || '').toLowerCase().trim() === n.toLowerCase().trim(),
          );
        const chillerCat = byName('chiller') || byName('chillers');
        const chillerEq = chillerCat
          ? ((allEq as any[]) || []).filter(
              (e: any) =>
                e?.category === chillerCat.id &&
                e?.is_active !== false &&
                e?.status === 'approved',
            )
          : (allEq as any[]) || [];

        const metaByNumber = new Map<
          string,
          { log_entry_interval?: string | null; shift_duration_hours?: number | null }
        >();
        for (const e of chillerEq as any[]) {
          if (!e?.equipment_number) continue;
          metaByNumber.set(e.equipment_number, {
            log_entry_interval: e.log_entry_interval ?? null,
            shift_duration_hours: e.shift_duration_hours ?? null,
          });
        }

        const resolveInterval = (equipmentId?: string): LogEntryIntervalType => {
          const meta = equipmentId ? metaByNumber.get(equipmentId) : undefined;
          const raw = (meta?.log_entry_interval as LogEntryIntervalType) || defaultInterval;
          return raw || 'daily';
        };

        const resolveShift = (equipmentId?: string): number => {
          const meta = equipmentId ? metaByNumber.get(equipmentId) : undefined;
          return meta?.shift_duration_hours ?? defaultShiftHours;
        };

        const list = computeMissedByEquipment(chillerList as any[], {
          resolveInterval: (eqId) => resolveInterval(eqId),
          resolveShiftHours: (eqId) => resolveShift(eqId),
        });
        if (cancelled) return;

        const map: Record<string, EquipmentMissInfo> = {};
        for (const item of list) {
          map[item.equipmentId] = item;
        }
        setByEquipment(map);
      } catch {
        if (!cancelled) setByEquipment({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionSettings?.log_entry_interval, sessionSettings?.shift_duration_hours]);

  return { byEquipment, loading };
}
