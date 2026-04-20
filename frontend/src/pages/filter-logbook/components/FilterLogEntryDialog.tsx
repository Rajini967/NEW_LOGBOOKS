import React, { type Dispatch, type FormEvent, type SetStateAction } from "react";
import { format } from "date-fns";
import { Clock, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MaintenanceTimingsSection } from "@/components/logbook/MaintenanceTimingsSection";
import type { MaintenanceTimingsValue } from "@/types/maintenance-timings";
import {
  assignmentAreaCategoryLabel,
  formatAssignmentSelectLabel,
  type EquipmentOption,
  type FilterAssignmentRow,
  type FilterLog,
  type LogEntryIntervalType,
} from "@/pages/filter-logbook/helpers";

export type FilterLogEntryFormState = {
  equipmentId: string;
  category: string;
  filterNo: string;
  filterMicron: string;
  filterSize: string;
  tagInfo: string;
  installedDate: string;
  integrityDoneDate: string;
  cleaningDoneDate: string;
  integrityDueDate: string;
  cleaningDueDate: string;
  replacementDueDate: string;
  remarks: string;
  date: string;
  time: string;
};

export type ScheduleApplicability = {
  replacement: boolean;
  cleaning: boolean;
  integrity: boolean;
};

export interface FilterLogEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewEntryClick: () => void;
  editingLogId: string | null;
  logs: FilterLog[];
  user: { name?: string | null; email?: string | null } | null | undefined;
  formData: FilterLogEntryFormState;
  setFormData: Dispatch<SetStateAction<FilterLogEntryFormState>>;
  onSubmit: (e: FormEvent) => void;
  selectedEquipmentUuid: string;
  onEquipmentSelected: (equipmentUuid: string) => void | Promise<void>;
  equipmentOptions: EquipmentOption[];
  assignmentsOnEquipment: FilterAssignmentRow[];
  uniqueAreaCategoryKeys: string[];
  selectedAreaCategoryKey: string;
  onAreaCategorySelected: (areaKey: string, equipmentUuid: string) => void | Promise<void>;
  assignmentsForSelectedArea: FilterAssignmentRow[];
  selectedAssignmentId: string;
  onAssignmentRowSelected: (assignmentId: string, equipmentUuid: string) => void | Promise<void>;
  entryLogInterval: "" | LogEntryIntervalType;
  setEntryLogInterval: Dispatch<SetStateAction<"" | LogEntryIntervalType>>;
  entryShiftDurationHours: number | "";
  setEntryShiftDurationHours: Dispatch<SetStateAction<number | "">>;
  entryToleranceMinutes: number | "";
  setEntryToleranceMinutes: Dispatch<SetStateAction<number | "">>;
  isReadingsApplicable: boolean;
  scheduleApplicability: ScheduleApplicability;
  previousReadingsLoading: boolean;
  previousReadingsForEquipment: FilterLog[];
  maintenanceTimings: MaintenanceTimingsValue;
  setMaintenanceTimings: Dispatch<SetStateAction<MaintenanceTimingsValue>>;
  updateInstalledAndDueDates: (installedDate: string) => void;
  onCancel: () => void;
}

export function FilterLogEntryDialog(props: FilterLogEntryDialogProps) {
  const {
    open,
    onOpenChange,
    onNewEntryClick,
    editingLogId,
    logs,
    user,
    formData,
    setFormData,
    onSubmit,
    selectedEquipmentUuid,
    onEquipmentSelected,
    equipmentOptions,
    assignmentsOnEquipment,
    uniqueAreaCategoryKeys,
    selectedAreaCategoryKey,
    onAreaCategorySelected,
    assignmentsForSelectedArea,
    selectedAssignmentId,
    onAssignmentRowSelected,
    entryLogInterval,
    setEntryLogInterval,
    entryShiftDurationHours,
    setEntryShiftDurationHours,
    entryToleranceMinutes,
    setEntryToleranceMinutes,
    isReadingsApplicable,
    scheduleApplicability,
    previousReadingsLoading,
    previousReadingsForEquipment,
    maintenanceTimings,
    setMaintenanceTimings,
    updateInstalledAndDueDates,
    onCancel,
  } = props;

  const editingLog = editingLogId ? logs.find((l) => l.id === editingLogId) : undefined;
  const canEditDateTime =
    editingLog &&
    (editingLog.status === "rejected" || editingLog.status === "pending_secondary_approval");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm" onClick={onNewEntryClick}>
          <Plus className="w-4 h-4 mr-1" />
          New Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{editingLogId ? "Edit Filter Log Entry" : "New Filter Log Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-4">
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {format(new Date(), "PPP")} · {format(new Date(), "p")}
              </p>
              <p className="text-xs text-muted-foreground">Done By: {user?.name || user?.email || "Unknown"}</p>
            </div>
          </div>

          {editingLogId && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  disabled={!canEditDateTime}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  step={1}
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  disabled={!canEditDateTime}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Equipment Name *</Label>
            <Select value={selectedEquipmentUuid} onValueChange={(value) => void onEquipmentSelected(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select equipment (loads assigned filter & approved schedules)" />
              </SelectTrigger>
              <SelectContent
                className="!z-[9999] max-h-60 overflow-y-auto"
                position="popper"
              >
                {equipmentOptions.length === 0 ? (
                  <SelectItem value="__none__" disabled className="text-muted-foreground">
                    No equipment available
                  </SelectItem>
                ) : (
                  equipmentOptions.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.equipment_number} – {eq.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground max-w-full break-words">
              {equipmentOptions.length === 0 ? (
                <>
                  No equipment with an active filter assignment in your scope. In{" "}
                  <span className="font-medium">Filter Register</span>, assign a filter to equipment you can
                  access; then use <span className="font-medium">Filter → Schedule approvals</span> so
                  replacement, cleaning, and integrity schedules are approved (needed for due-date fields).
                </>
              ) : (
                <>
                  Equipment comes from active filter assignments in your scope.{" "}
                  <span className="font-medium">Approved</span> schedules set maintenance frequencies and due
                  dates; until then, only basic log fields may be required.
                </>
              )}
            </p>
          </div>

          {assignmentsOnEquipment.length > 0 ? (
            <div className="space-y-2">
              <Label>Area category{uniqueAreaCategoryKeys.length > 1 ? " *" : ""}</Label>
              {uniqueAreaCategoryKeys.length > 1 ? (
                <Select
                  value={selectedAreaCategoryKey}
                  onValueChange={(value) => {
                    if (selectedEquipmentUuid) {
                      void onAreaCategorySelected(value, selectedEquipmentUuid);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select area for this equipment" />
                  </SelectTrigger>
                  <SelectContent
                    className="!z-[9999] max-h-60 overflow-y-auto"
                    position="popper"
                  >
                    {uniqueAreaCategoryKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {assignmentAreaCategoryLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  value={assignmentAreaCategoryLabel(selectedAreaCategoryKey)}
                  readOnly
                  disabled
                  className="bg-muted"
                  aria-label="Area category"
                />
              )}
              <p className="text-xs text-muted-foreground max-w-full break-words">
                {uniqueAreaCategoryKeys.length > 1
                  ? "Choose the area when this equipment has filters assigned under more than one area category in Filter Register."
                  : "From Filter Register when assigning the filter to this equipment. Shown for all equipment so it matches Schedule approvals."}
              </p>
            </div>
          ) : null}

          {assignmentsForSelectedArea.length > 1 ? (
            <div className="space-y-2">
              <Label>Assigned filter *</Label>
              <Select
                value={selectedAssignmentId || "__none__"}
                onValueChange={(value) => {
                  if (value !== "__none__" && selectedEquipmentUuid) {
                    void onAssignmentRowSelected(value, selectedEquipmentUuid);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select filter on this equipment" />
                </SelectTrigger>
                <SelectContent
                  className="!z-[9999] max-h-60 overflow-y-auto"
                  position="popper"
                >
                  {assignmentsForSelectedArea.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {formatAssignmentSelectLabel(a, assignmentsForSelectedArea)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground max-w-full break-words">
                If two lines look the same, the extra text is tag info or assignment id to tell them apart.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                type="text"
                value={formData.category}
                readOnly
                disabled
                className="bg-muted"
                placeholder="From assignment"
              />
              <p className="text-xs text-muted-foreground">From filter assignment category.</p>
            </div>
            <div className="space-y-2">
              <Label>Filter No *</Label>
              <Input
                type="text"
                value={formData.filterNo}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    filterNo: e.target.value,
                  })
                }
                placeholder="e.g., FMT-0001"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Log entry interval</Label>
              <Select
                value={entryLogInterval || "__none__"}
                onValueChange={(v) => {
                  const next = v === "__none__" ? "" : (v as LogEntryIntervalType);
                  setEntryLogInterval(next);
                  if (next !== "shift") setEntryShiftDurationHours("");
                }}
                disabled={!isReadingsApplicable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use global default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Use global default</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="shift">Shift</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shift duration (hours)</Label>
              <Input
                type="number"
                min={1}
                max={24}
                disabled={!isReadingsApplicable || entryLogInterval !== "shift"}
                value={entryShiftDurationHours === "" ? "" : entryShiftDurationHours}
                onChange={(e) =>
                  setEntryShiftDurationHours(
                    e.target.value === "" ? "" : Math.max(1, Math.min(24, Number(e.target.value) || 8)),
                  )
                }
                placeholder="e.g. 8"
              />
            </div>
            <div className="space-y-2">
              <Label>Log entry tolerance (minutes)</Label>
              <Input
                type="number"
                min={0}
                value={entryToleranceMinutes === "" ? "" : entryToleranceMinutes}
                onChange={(e) =>
                  setEntryToleranceMinutes(
                    e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0),
                  )
                }
                disabled={!isReadingsApplicable}
                placeholder="e.g. 15"
              />
            </div>
          </div>

          {formData.equipmentId && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">Previous readings (Entered by)</p>
              {previousReadingsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : previousReadingsForEquipment.length === 0 ? (
                <p className="text-xs text-muted-foreground">No previous entries for this equipment.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {previousReadingsForEquipment.map((log) => (
                    <div
                      key={log.id}
                      className="text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0"
                    >
                      <span className="font-medium">{format(log.timestamp, "yyyy-MM-dd HH:mm")}</span>
                      <span className="text-muted-foreground"> — Entered by: {log.checkedBy || "—"}</span>
                      <div className="mt-1 text-muted-foreground">
                        {log.category} · {log.filterNo}
                        {log.filterMicron ? ` · ${log.filterMicron}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <MaintenanceTimingsSection value={maintenanceTimings} onChange={setMaintenanceTimings} />

          <div className="space-y-2">
            <Label>Tag Information (auto-fetched)</Label>
            <Input
              type="text"
              value={formData.tagInfo}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tagInfo: e.target.value,
                })
              }
              placeholder="Auto-filled from assignment (editable)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Filter Micron</Label>
              <Input
                type="text"
                value={formData.filterMicron}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    filterMicron: e.target.value,
                  })
                }
                placeholder="e.g., 0.2 µm"
              />
            </div>
            <div className="space-y-2">
              <Label>Filter Size</Label>
              <Input
                type="text"
                value={formData.filterSize}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    filterSize: e.target.value,
                  })
                }
                placeholder="e.g., 10 inch"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Filter Installed Date *</Label>
              <Input
                type="date"
                value={formData.installedDate}
                onChange={(e) => updateInstalledAndDueDates(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Integrity Done Date {!scheduleApplicability.integrity ? "(N/A)" : ""}</Label>
              <Input
                type="date"
                value={formData.integrityDoneDate}
                disabled={!scheduleApplicability.integrity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    integrityDoneDate: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Cleaning Done Date {!scheduleApplicability.cleaning ? "(N/A)" : ""}</Label>
              <Input
                type="date"
                value={formData.cleaningDoneDate}
                disabled={!scheduleApplicability.cleaning}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cleaningDoneDate: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Replacement Due Date {!scheduleApplicability.replacement ? "(N/A)" : ""}</Label>
              <Input
                type="date"
                value={formData.replacementDueDate}
                disabled={!scheduleApplicability.replacement}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    replacementDueDate: e.target.value,
                  })
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Calculated from installed date and approved assignment schedules; you may override.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Integrity Due Date {!scheduleApplicability.integrity ? "(N/A)" : ""}</Label>
              <Input
                type="date"
                value={formData.integrityDueDate}
                disabled={!scheduleApplicability.integrity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    integrityDueDate: e.target.value,
                  })
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Calculated from installed date and approved assignment schedules; you may override.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cleaning Due Date {!scheduleApplicability.cleaning ? "(N/A)" : ""}</Label>
              <Input
                type="date"
                value={formData.cleaningDueDate}
                disabled={!scheduleApplicability.cleaning}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cleaningDueDate: e.target.value,
                  })
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Calculated from installed date and approved assignment schedules; you may override.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={formData.remarks}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  remarks: e.target.value,
                })
              }
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t mt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" variant="accent">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
