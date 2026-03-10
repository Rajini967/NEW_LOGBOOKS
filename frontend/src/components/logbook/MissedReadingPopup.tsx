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
      <div className="mt-3 space-y-2">
        {equipmentList!.map((eq) => {
          const lastStr = eq.lastTimestamp ? format(eq.lastTimestamp, 'PPp') : 'no readings yet';
          const nextStr = eq.nextDue ? format(eq.nextDue, 'PPp') : 'not scheduled';
          const intervalLabel =
            eq.interval === 'hourly'
              ? 'Hourly'
              : eq.interval === 'shift'
              ? `Shift (${eq.shiftHours}h)`
              : 'Daily';
          return (
            <div
              key={eq.equipmentId}
              className="flex flex-col rounded-md border border-border px-3 py-2 text-sm bg-muted/40"
            >
              <div className="font-medium text-foreground">
                Equipment {eq.equipmentId}
                {eq.equipmentName ? ` – ${eq.equipmentName}` : ''}
              </div>
              <div className="text-muted-foreground">
                Last reading: <span className="font-mono">{lastStr}</span>
              </div>
              <div className="text-muted-foreground">
                Next due: <span className="font-mono">{nextStr}</span> ({intervalLabel})
              </div>
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
      <AlertDialogContent>
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
