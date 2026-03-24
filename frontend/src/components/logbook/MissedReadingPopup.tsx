import React from 'react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { EquipmentMissInfo } from '@/lib/missed-reading';

interface MissedReadingPopupProps {
  open: boolean;
  onClose: () => void;
  logTypeLabel: string;
  /**
   * Optional single next-due time for legacy usage.
   */
  nextDue?: Date;
  /**
   * Optional equipment-wise details. When provided, these are shown in a list.
   */
  equipmentList?: EquipmentMissInfo[];
}

/**
 * Popup (modal) shown when one or more scheduled log book readings were missed.
 */
export function MissedReadingPopup({
  open,
  onClose,
  logTypeLabel,
  nextDue,
  equipmentList,
}: MissedReadingPopupProps) {
  const hasEquipment = equipmentList && equipmentList.length > 0;

  const renderEquipmentList = () => {
    if (!hasEquipment) return null;
    return (
      <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {equipmentList!.map((eq) => {
          const lastStr = eq.lastTimestamp ? format(eq.lastTimestamp, 'PPp') : 'no readings yet';
          const nextStr = eq.nextDue ? format(eq.nextDue, 'PPp') : 'not scheduled';
          const intervalLabel =
            eq.interval === 'hourly'
              ? 'Hourly'
              : eq.interval === 'shift'
              ? `Shift (${eq.shiftHours}h)`
              : 'Daily';
          const missedCount = eq.missingSlotCount ?? (eq.isMissed ? 1 : 0);
          return (
            <div
              key={eq.equipmentId}
              className="flex flex-col rounded-md border border-border px-3 py-2 text-sm bg-muted/40"
            >
              <div className="font-medium text-foreground">
                Equipment {eq.equipmentId}
                {eq.equipmentName ? ` – ${eq.equipmentName}` : ''}
                {eq.equipmentTypeLabel ? ` (${eq.equipmentTypeLabel})` : ''}
              </div>
              <div className="text-muted-foreground">
                Last reading: <span className="font-mono">{lastStr}</span>
              </div>
              <div className="text-muted-foreground">
                Next due: <span className="font-mono">{nextStr}</span> ({intervalLabel})
              </div>
              <div className="text-muted-foreground">
                Missed slots: <span className="font-semibold text-foreground">{missedCount}</span>
              </div>
              {!!eq.missingSlotRanges?.length && (
                <div className="mt-2 rounded border border-border/70 bg-background p-2">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Missing slot ranges
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {eq.missingSlotRanges.map((slot, idx) => (
                      <div key={`${eq.equipmentId}-${idx}`} className="font-mono text-xs text-foreground">
                        {slot.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const defaultDescription =
    nextDue && !hasEquipment
      ? `A scheduled ${logTypeLabel} reading was missed. It was due by ${format(
          nextDue,
          'PPp',
        )}. Please log the reading when possible.`
      : `One or more ${logTypeLabel} equipments have missed scheduled readings. Please review the list below and log the pending readings.`;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Scheduled reading missed</AlertDialogTitle>
          <AlertDialogDescription>{defaultDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {renderEquipmentList()}
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Dismiss</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
