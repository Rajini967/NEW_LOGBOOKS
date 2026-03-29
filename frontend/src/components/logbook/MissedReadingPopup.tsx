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
      <div className="mt-3 max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto pr-1">
        {equipmentList!.map((eq) => {
          const lastStr = eq.lastTimestamp ? format(eq.lastTimestamp, 'PPp') : 'No readings yet';
          const nextStr = eq.nextDue ? format(eq.nextDue, 'PPp') : 'Not scheduled';
          const intervalLabel =
            eq.interval === 'hourly'
              ? 'Hourly'
              : eq.interval === 'shift'
              ? `Shift (${eq.shiftHours}h)`
              : 'Daily';
          const missedCount = eq.missingSlotCount ?? (eq.isMissed ? 1 : 0);
          const friendly =
            eq.equipmentName?.trim() &&
            eq.equipmentName.trim() !== eq.equipmentId.trim();
          const title = friendly ? eq.equipmentName!.trim() : `Equipment ${eq.equipmentId}`;
          return (
            <div
              key={eq.equipmentId}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm"
            >
              <div className="text-base font-semibold leading-snug text-foreground">{title}</div>
              {eq.equipmentTypeLabel ? (
                <div className="text-xs text-muted-foreground">Type: {eq.equipmentTypeLabel}</div>
              ) : null}
              <div className="text-muted-foreground">
                Last reading: <span className="text-foreground">{lastStr}</span>
              </div>
              <div className="text-muted-foreground">
                Next due: <span className="text-foreground">{nextStr}</span>{' '}
                <span className="text-muted-foreground">({intervalLabel})</span>
              </div>
              <div className="text-muted-foreground">
                Missed slots: <span className="font-semibold text-foreground">{missedCount}</span>
              </div>
              {missedCount === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No missed readings for this day—this equipment already has the expected log(s) for its
                  interval, or remaining slots are not due yet.
                </p>
              ) : null}
              {!!eq.missingSlotRanges?.length && (
                <div className="mt-1 rounded-md border border-border/60 bg-background/80 p-2">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Missing time windows (log one entry per window)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {eq.missingSlotRanges.map((slot, idx) => (
                      <span
                        key={`${eq.equipmentId}-${idx}`}
                        className="inline-flex rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-foreground"
                      >
                        {slot.label}
                      </span>
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
      <AlertDialogContent className="max-h-[85vh] max-w-2xl w-[min(100%,42rem)] overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Missing scheduled readings</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {renderEquipmentList()}
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Dismiss</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
