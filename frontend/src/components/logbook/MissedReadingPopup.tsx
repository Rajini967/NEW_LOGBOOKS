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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EquipmentMissInfo } from '@/lib/missed-reading';

type MissingReadingsDayGroup = {
  date: string;
  totalMissingSlots: number;
  equipmentList: EquipmentMissInfo[];
};

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
  isRangeLoading?: boolean;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onApplyRange?: () => void;
  dayGroups?: MissingReadingsDayGroup[];
  totalMissingSlotsInRange?: number;
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
  isRangeLoading = false,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onApplyRange,
  dayGroups,
  totalMissingSlotsInRange,
}: MissedReadingPopupProps) {
  const hasEquipment = equipmentList && equipmentList.length > 0;
  const hasDayGroups = !!dayGroups?.length;

  const renderEquipmentCard = (eq: EquipmentMissInfo, keyPrefix = '') => {
    const lastStr = eq.lastTimestamp ? format(eq.lastTimestamp, 'PPp') : 'No readings yet';
    const nextStr = eq.nextDue ? format(eq.nextDue, 'PPp') : 'Not scheduled';
    const intervalLabel =
      eq.interval === 'hourly'
        ? 'Hourly'
        : eq.interval === 'shift'
        ? `Shift (${eq.shiftHours}h)`
        : 'Daily';
    const missedCount = eq.missingSlotCount ?? (eq.isMissed ? 1 : 0);
    const id = eq.equipmentId?.trim() ?? '';
    const rawName = (eq.equipmentName ?? '').trim();
    const title =
      !rawName
        ? id || 'Equipment'
        : rawName === id || (id && rawName.startsWith(`${id} `))
          ? rawName
          : `${id} ${rawName}`.trim();
    const isDaily = eq.interval === 'daily';
    const dailyMissingDates =
      isDaily && eq.missingSlotRanges?.length
        ? Array.from(new Set(eq.missingSlotRanges.map((slot) => format(slot.slotStart, 'yyyy-MM-dd'))))
        : [];

    return (
      <div
        key={`${keyPrefix}${eq.equipmentId}`}
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
        {dailyMissingDates.length > 0 ? (
          <div className="text-muted-foreground">
            Missing date{dailyMissingDates.length > 1 ? 's' : ''}:{' '}
            <span className="text-foreground">{dailyMissingDates.join(', ')}</span>
          </div>
        ) : null}
        {missedCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            No missed readings for this day-this equipment already has expected logs, or remaining slots are not due
            yet.
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
                  key={`${keyPrefix}${eq.equipmentId}-${idx}`}
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
  };

  const renderEquipmentList = () => {
    if (!hasEquipment) return null;
    return <div className="mt-3 max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto pr-1">{equipmentList!.map((eq) => renderEquipmentCard(eq))}</div>;
  };

  const renderDayGroups = () => {
    if (!hasDayGroups) return null;
    return (
      <div className="mt-3 max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto pr-1">
        {dayGroups!.map((group) => (
          <div key={group.date} className="rounded-lg border border-border/70 bg-background">
            <div className="border-b border-border/70 px-3 py-2 text-sm">
              <span className="font-semibold text-foreground">{group.date}</span>
              <span className="ml-2 text-muted-foreground">Missed slots: {group.totalMissingSlots}</span>
            </div>
            <div className="space-y-3 p-3">{group.equipmentList.map((eq) => renderEquipmentCard(eq, `${group.date}-`))}</div>
          </div>
        ))}
      </div>
    );
  };

  const defaultDescription =
    nextDue && !hasEquipment
      ? `A scheduled ${logTypeLabel} reading was missed. It was due by ${format(
          nextDue,
          'PPp',
        )}. Please log the reading when possible.`
      : `One or more ${logTypeLabel} equipments have missed scheduled readings. Review by date and log pending windows.`;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-h-[85vh] max-w-2xl w-[min(100%,42rem)] overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Missing scheduled readings</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {onApplyRange ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input type="date" value={dateFrom ?? ''} onChange={(e) => onDateFromChange?.(e.target.value)} />
            <Input type="date" value={dateTo ?? ''} onChange={(e) => onDateToChange?.(e.target.value)} />
            <Button type="button" variant="outline" onClick={onApplyRange} disabled={isRangeLoading}>
              {isRangeLoading ? 'Loading...' : 'Load'}
            </Button>
          </div>
        ) : null}
        {typeof totalMissingSlotsInRange === 'number' ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total missed slots (selected range): </span>
            <span className="font-semibold text-foreground">{totalMissingSlotsInRange}</span>
          </div>
        ) : null}
        {isRangeLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading missing readings...</p> : null}
        {!isRangeLoading ? renderDayGroups() : null}
        {!isRangeLoading && !hasDayGroups ? renderEquipmentList() : null}
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Dismiss</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
