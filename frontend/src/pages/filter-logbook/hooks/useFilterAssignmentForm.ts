import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  formatFilterSize,
  type FilterAssignmentRow,
  type FilterCategory,
  type LogEntryIntervalType,
} from "@/pages/filter-logbook/helpers";

type EquipmentIntervalMeta = {
  equipment_id?: string;
  log_entry_interval?: string | null;
  shift_duration_hours?: number | null;
  tolerance_minutes?: number | null;
};

type AssignmentFormFields = {
  equipmentId: string;
  category: FilterCategory;
  filterNo: string;
  filterMicron: string;
  filterSize: string;
  tagInfo: string;
};

export function useFilterAssignmentForm<T extends AssignmentFormFields>(options: {
  filterIdToEquipmentInterval: Map<string, EquipmentIntervalMeta>;
  setFormData: Dispatch<SetStateAction<T>>;
  setEntryLogInterval: Dispatch<SetStateAction<"" | LogEntryIntervalType>>;
  setEntryShiftDurationHours: Dispatch<SetStateAction<number | "">>;
  setEntryToleranceMinutes: Dispatch<SetStateAction<number | "">>;
}) {
  const {
    filterIdToEquipmentInterval,
    setFormData,
    setEntryLogInterval,
    setEntryShiftDurationHours,
    setEntryToleranceMinutes,
  } = options;

  const applyAssignmentRowToForm = useCallback(
    (active: FilterAssignmentRow) => {
      const catRaw = (active.filter_category_name || "").trim();
      setFormData((prev) => ({
        ...prev,
        equipmentId: active.filter_id || "",
        category: (catRaw || prev.category || "hvac") as FilterCategory,
        filterNo: active.filter_id || "",
        filterMicron: active.filter_micron_size || prev.filterMicron,
        filterSize: formatFilterSize(active) || prev.filterSize,
        tagInfo: active.tag_info ?? prev.tagInfo,
      }));
      // Prefer equipment UUID: filter_id is omitted from the map when the same filter is on multiple assets.
      const equipKey = (active.equipment || "").trim();
      const filterKey = (active.filter_id || "").trim();
      const timingMeta =
        (equipKey ? filterIdToEquipmentInterval.get(equipKey) : undefined) ??
        (filterKey ? filterIdToEquipmentInterval.get(filterKey) : undefined);
      if (timingMeta) {
        setEntryLogInterval((timingMeta.log_entry_interval as LogEntryIntervalType) || "");
        setEntryShiftDurationHours(timingMeta.shift_duration_hours ?? "");
        setEntryToleranceMinutes(timingMeta.tolerance_minutes ?? "");
      } else {
        setEntryLogInterval("");
        setEntryShiftDurationHours("");
        setEntryToleranceMinutes("");
      }
    },
    [
      filterIdToEquipmentInterval,
      setFormData,
      setEntryLogInterval,
      setEntryShiftDurationHours,
      setEntryToleranceMinutes,
    ],
  );

  return { applyAssignmentRowToForm };
}
