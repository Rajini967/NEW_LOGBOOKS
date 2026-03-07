import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordRequirementHintsProps {
  password: string;
  className?: string;
  /** When true, show requirements in 2 columns to reduce vertical space (e.g. in modals) */
  compact?: boolean;
}

const checks = {
  length: (p: string) => p.length >= 8,
  upper: (p: string) => /[A-Z]/.test(p),
  lower: (p: string) => /[a-z]/.test(p),
  number: (p: string) => /\d/.test(p),
  special: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(p),
};

const labels = [
  { key: 'length' as const, label: 'At least 8 characters' },
  { key: 'upper' as const, label: 'One uppercase letter (A–Z)' },
  { key: 'lower' as const, label: 'One lowercase letter (a–z)' },
  { key: 'number' as const, label: 'One number (0–9)' },
  { key: 'special' as const, label: 'One special character (!@#$%^&* etc.)' },
];

export function PasswordRequirementHints({ password, className, compact }: PasswordRequirementHintsProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Password must have:</p>
      <ul className={cn('text-xs', compact ? 'grid grid-cols-2 gap-x-4 gap-y-1' : 'space-y-1')}>
        {labels.map(({ key, label }) => {
          const met = checks[key](password);
          return (
            <li
              key={key}
              className={cn(
                'flex items-center gap-2',
                met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
              )}
            >
              {met ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" />
              )}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
