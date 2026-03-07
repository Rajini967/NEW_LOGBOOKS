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

interface MissedReadingPopupProps {
  open: boolean;
  onClose: () => void;
  logTypeLabel: string;
  nextDue: Date;
}

/**
 * Popup (modal) shown when a scheduled log book reading was missed.
 */
export function MissedReadingPopup({
  open,
  onClose,
  logTypeLabel,
  nextDue,
}: MissedReadingPopupProps) {
  const formattedDue = format(nextDue, 'PPp');

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Scheduled reading missed</AlertDialogTitle>
          <AlertDialogDescription>
            A scheduled {logTypeLabel} reading was missed. It was due by {formattedDue}. Please log
            the reading when possible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Dismiss</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
