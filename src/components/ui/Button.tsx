'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-600 active:bg-brand-800 shadow-sm',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-700 shadow-sm',
  success: 'bg-success-600 text-white hover:bg-success-700 active:bg-success-700 shadow-sm',
};

const SIZES: Record<Size, string> = {
  // 44px is the iOS/Android minimum comfortable touch target. Small buttons get
  // it on phones and shrink to 36px from `sm:` up, where a mouse is in play.
  sm: 'h-11 min-h-[44px] px-3 text-sm gap-1.5 sm:h-9 sm:min-h-0',
  md: 'h-11 min-h-[44px] px-4 text-sm gap-2',
  lg: 'h-12 min-h-[48px] px-6 text-base gap-2',
  icon: 'h-11 w-11 min-h-[44px] min-w-[44px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, fullWidth, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button must not be clickable twice — this is what prevents
      // duplicate leads from an impatient double-tap on a slow connection.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium',
        'transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
