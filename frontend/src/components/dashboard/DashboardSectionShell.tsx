import React from 'react';
import { cn } from '@/lib/utils';

export type DashboardShellVariant = 'gradient' | 'rail' | 'plain' | 'framed';

/** Accent-tinted chrome so each module reads distinctly in an enterprise layout */
export type DashboardAccentEdge = 'none' | 'subtle' | 'strong';

interface DashboardSectionShellProps {
  title: string;
  accentHsl: string;
  variant?: DashboardShellVariant;
  /** Extra border / glow from module accent */
  accentEdge?: DashboardAccentEdge;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DashboardSectionShell({
  title,
  accentHsl,
  variant = 'gradient',
  accentEdge = 'none',
  toolbar,
  children,
  className,
}: DashboardSectionShellProps) {
  const hsl = (alpha: string) => `hsl(${accentHsl} / ${alpha})`;

  const edgeStyle: React.CSSProperties | undefined =
    accentEdge === 'subtle'
      ? { boxShadow: `0 0 0 1px hsl(${accentHsl} / 0.38), 0 4px 14px hsl(220 15% 10% / 0.06)` }
      : accentEdge === 'strong'
        ? {
            borderColor: `hsl(${accentHsl})`,
            boxShadow: `0 0 0 1px hsl(${accentHsl} / 0.2), 0 6px 20px hsl(${accentHsl} / 0.12)`,
          }
        : undefined;

  const railLeft = variant === 'rail' ? { borderLeftColor: `hsl(${accentHsl})` } : {};

  return (
    <div
      className={cn(
        'overflow-hidden bg-card',
        variant === 'gradient' && 'rounded-xl border border-border shadow-md',
        variant === 'rail' && 'rounded-lg border border-border shadow-sm border-l-[5px]',
        variant === 'plain' && 'rounded-xl border border-border',
        variant === 'framed' && 'rounded-xl border-2 border-border bg-muted/15 shadow-[inset_0_1px_0_0_hsl(var(--border))]',
        accentEdge === 'strong' && 'border-2',
        className
      )}
      style={{ ...railLeft, ...edgeStyle }}
    >
      <div
        className={cn(
          'flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3',
          variant === 'rail' && 'bg-muted/25',
          variant === 'framed' && 'bg-card'
        )}
        style={
          variant === 'gradient'
            ? {
                background: `linear-gradient(135deg, ${hsl('0.12')} 0%, hsl(var(--card)) 55%)`,
                borderBottomColor: hsl('0.2'),
              }
            : variant === 'plain'
              ? { borderBottomColor: `hsl(${accentHsl})`, borderBottomWidth: 2 }
              : undefined
        }
      >
        <h3
          className={cn(
            'text-foreground tracking-tight',
            variant === 'plain' && 'text-base font-semibold',
            variant !== 'plain' && 'text-sm font-semibold'
          )}
        >
          {title}
        </h3>
        {toolbar ? (
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end [&>*]:shrink-0">
            {toolbar}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </div>
  );
}
