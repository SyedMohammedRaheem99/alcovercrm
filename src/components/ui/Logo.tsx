import { cn } from '@/lib/utils/cn';

/**
 * Brand mark.
 *
 * The glyph is an abstracted window frame — a rectangle divided into panes,
 * which reads as fenestration without being literal about it. Drawn in SVG so
 * it stays crisp at any size and needs no image asset.
 *
 * The wordmark is a placeholder: the client confirms the final CRM name in
 * Phase 10, and only this file plus the manifest need to change.
 */
export function LogoMark({ className, color = 'currentColor' }: { className?: string; color?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8', className)}
      role="img"
      aria-label="Alcove CRM"
    >
      <rect x="3" y="3" width="26" height="26" rx="5" stroke={color} strokeWidth="2.5" />
      <path d="M16 4v24" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 16h24" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Filled pane — the "light through the window" accent */}
      <rect x="18" y="18" width="9" height="9" rx="2" fill={color} opacity="0.9" />
    </svg>
  );
}

export function Logo({
  className,
  showText = true,
  variant = 'dark',
}: {
  className?: string;
  showText?: boolean;
  variant?: 'dark' | 'light';
}) {
  const color = variant === 'light' ? '#FFFFFF' : '#1E3A8A';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark color={color} />
      {showText && (
        <span
          className={cn(
            'text-lg font-semibold leading-none tracking-tight',
            variant === 'light' ? 'text-white' : 'text-brand-700',
          )}
        >
          Alcove
          <span className={variant === 'light' ? 'text-white/70' : 'text-slate-400'}> CRM</span>
        </span>
      )}
    </span>
  );
}
