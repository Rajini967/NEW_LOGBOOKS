import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import { filterScheduleAPI } from "@/lib/api";
import { dueDatesForInstalled, emptyScheduleFreq, type ScheduleFreqState } from "@/pages/filter-logbook/helpers";

type ScheduleFormFields = {
  installedDate: string;
  integrityDoneDate: string;
  cleaningDoneDate: string;
  integrityDueDate: string;
  cleaningDueDate: string;
  replacementDueDate: string;
};

type ScheduleRow = {
  assignment?: string;
  is_approved?: boolean;
  frequency_days?: unknown;
  schedule_type?: string;
};

export function useFilterScheduleLoader<T extends ScheduleFormFields>(options: {
  setScheduleFrequencies: Dispatch<SetStateAction<ScheduleFreqState>>;
  scheduleFreqRef: MutableRefObject<ScheduleFreqState>;
  setFormData: Dispatch<SetStateAction<T>>;
}) {
  const { setScheduleFrequencies, scheduleFreqRef, setFormData } = options;

  const loadApprovedSchedulesForAssignment = useCallback(
    async (equipmentUuid: string, assignmentId: string) => {
      const nextFreq = emptyScheduleFreq();
      try {
        const rows = (await filterScheduleAPI.list({
          equipment: equipmentUuid,
          approval: "approved",
        })) as ScheduleRow[];
        const mine = (rows || []).filter(
          (s) => s.assignment === assignmentId && s.is_approved === true,
        );
        for (const s of mine) {
          const d =
            s.frequency_days != null && !Number.isNaN(Number(s.frequency_days))
              ? Number(s.frequency_days)
              : null;
          if (s.schedule_type === "replacement") nextFreq.replacement = d;
          else if (s.schedule_type === "cleaning") nextFreq.cleaning = d;
          else if (s.schedule_type === "integrity") nextFreq.integrity = d;
        }
      } catch {
        /* ignore */
      }
      setScheduleFrequencies(nextFreq);
      scheduleFreqRef.current = nextFreq;
      setFormData((prev) => {
        const installed = prev.installedDate || format(new Date(), "yyyy-MM-dd");
        const due = dueDatesForInstalled(installed, nextFreq);
        return {
          ...prev,
          installedDate: installed,
          integrityDoneDate: nextFreq.integrity ? prev.integrityDoneDate : "",
          cleaningDoneDate: nextFreq.cleaning ? prev.cleaningDoneDate : "",
          integrityDueDate: due.integrityDueDate,
          cleaningDueDate: due.cleaningDueDate,
          replacementDueDate: due.replacementDueDate,
        };
      });
    },
    [setScheduleFrequencies, scheduleFreqRef, setFormData],
  );

  const maybeToastScheduleOverdue = useCallback(async (equipmentUuid: string) => {
    try {
      const overdue = await filterScheduleAPI.list({
        equipment: equipmentUuid,
        overdue: true,
      });
      if (Array.isArray(overdue) && overdue.length > 0) {
        const types = Array.from(
          new Set(
            (overdue as ScheduleRow[]).map((s) => s.schedule_type).filter(Boolean) as string[],
          ),
        ).join(", ");
        toast.warning(`Maintenance overdue for this equipment: ${types}`);
      }
    } catch {
      // ignore
    }
  }, []);

  return { loadApprovedSchedulesForAssignment, maybeToastScheduleOverdue };
}
