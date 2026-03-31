import { useEffect, useMemo, useRef, useState } from "react";
import { emptyScheduleFreq, type ScheduleFreqState } from "@/pages/filter-logbook/helpers";

export function useFilterScheduleState() {
  const [scheduleFrequencies, setScheduleFrequencies] = useState<ScheduleFreqState>(emptyScheduleFreq());
  const scheduleFreqRef = useRef<ScheduleFreqState>(emptyScheduleFreq());
  const scheduleApplicability = useMemo(
    () => ({
      replacement: scheduleFrequencies.replacement != null && scheduleFrequencies.replacement > 0,
      cleaning: scheduleFrequencies.cleaning != null && scheduleFrequencies.cleaning > 0,
      integrity: scheduleFrequencies.integrity != null && scheduleFrequencies.integrity > 0,
    }),
    [scheduleFrequencies],
  );

  useEffect(() => {
    scheduleFreqRef.current = scheduleFrequencies;
  }, [scheduleFrequencies]);

  return {
    scheduleFrequencies,
    setScheduleFrequencies,
    scheduleFreqRef,
    scheduleApplicability,
  };
}
