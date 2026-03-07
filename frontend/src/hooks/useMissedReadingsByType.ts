import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { chillerLogAPI, boilerLogAPI, filterLogAPI, chemicalPrepAPI } from '@/lib/api';
import { getNextDueAndMissed } from '@/lib/missed-reading';
import type { LogEntryIntervalType } from '@/types';

export interface MissedByLogType {
  chiller: boolean;
  boiler: boolean;
  filter: boolean;
  chemical: boolean;
}

function getLatestTimestamp(items: any[]): Date | null {
  if (!items || items.length === 0) return null;
  const withTs = items
    .map((item) => {
      const ts = item.timestamp;
      if (!ts) return null;
      return new Date(ts).getTime();
    })
    .filter((t): t is number => t != null && !Number.isNaN(t));
  if (withTs.length === 0) return null;
  return new Date(Math.max(...withTs));
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

    const interval = sessionSettings.log_entry_interval as LogEntryIntervalType;
    const shiftHours = sessionSettings.shift_duration_hours ?? 8;

    (async () => {
      try {
        const [chillerList, boilerList, filterList, chemicalList] = await Promise.all([
          chillerLogAPI.list().catch(() => []),
          boilerLogAPI.list().catch(() => []),
          filterLogAPI.list().catch(() => []),
          chemicalPrepAPI.list().catch(() => []),
        ]);

        if (cancelled) return;

        const chillerLast = getLatestTimestamp(chillerList as any[]);
        const boilerLast = getLatestTimestamp(boilerList as any[]);
        const filterLast = getLatestTimestamp(filterList as any[]);
        const chemicalLast = getLatestTimestamp(chemicalList as any[]);

        const chillerRes = getNextDueAndMissed(chillerLast, interval, shiftHours);
        const boilerRes = getNextDueAndMissed(boilerLast, interval, shiftHours);
        const filterRes = getNextDueAndMissed(filterLast, interval, shiftHours);
        const chemicalRes = getNextDueAndMissed(chemicalLast, interval, shiftHours);

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
