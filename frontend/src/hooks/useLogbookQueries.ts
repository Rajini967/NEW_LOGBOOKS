import { useQuery } from "@tanstack/react-query";
import {
  boilerLogAPI,
  briquetteLogAPI,
  chemicalPrepAPI,
  filterLogAPI,
} from "@/lib/api";

export function useBoilerAndBriquetteLogsQuery() {
  const boiler = useQuery({
    queryKey: ["logbook", "boiler", "list"],
    queryFn: () => boilerLogAPI.list(),
    staleTime: 15_000,
  });
  const briquette = useQuery({
    queryKey: ["logbook", "briquette", "list"],
    queryFn: () => briquetteLogAPI.list(),
    staleTime: 15_000,
  });
  return { boiler, briquette };
}

export function useChemicalLogsQuery() {
  return useQuery({
    queryKey: ["logbook", "chemical", "list"],
    queryFn: () => chemicalPrepAPI.list(),
    staleTime: 15_000,
  });
}

export function useFilterLogsQuery() {
  return useQuery({
    queryKey: ["logbook", "filter", "list"],
    queryFn: () => filterLogAPI.list(),
    staleTime: 15_000,
  });
}

export function useBoilerAndBriquetteMissingSlotsQuery(selectedDate: string, refreshKey: number) {
  const boilerMissing = useQuery({
    queryKey: ["logbook", "boiler", "missing-slots", selectedDate, refreshKey],
    queryFn: () => boilerLogAPI.missingSlots({ date: selectedDate }),
    staleTime: 10_000,
  });
  const briquetteMissing = useQuery({
    queryKey: ["logbook", "briquette", "missing-slots", selectedDate, refreshKey],
    queryFn: () => briquetteLogAPI.missingSlots({ date: selectedDate }),
    staleTime: 10_000,
  });
  return { boilerMissing, briquetteMissing };
}

export function useChemicalMissingSlotsQuery(selectedDate: string, refreshKey: number) {
  return useQuery({
    queryKey: ["logbook", "chemical", "missing-slots", selectedDate, refreshKey],
    queryFn: () => chemicalPrepAPI.missingSlots({ date: selectedDate }),
    staleTime: 10_000,
  });
}

export function useFilterMissingSlotsQuery(selectedDate: string, refreshKey: number) {
  return useQuery({
    queryKey: ["logbook", "filter", "missing-slots", selectedDate, refreshKey],
    queryFn: () => filterLogAPI.missingSlots({ date: selectedDate }),
    staleTime: 10_000,
  });
}
