'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Form controls.
 *
 * Two mobile-critical details baked in:
 *  - `text-base` (16px) on inputs. Anything smaller makes iOS Safari zoom in on
 *    focus, which is jarring and leaves the page zoomed.
 *  - `min-h-[44px]` for a comfortable one-handed touch target.
 */

const FIELD_BASE =
  'w-full rounded-md border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 ' +
  'transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const FIELD_STATE = (invalid?: boolean) =>
  invalid
    ? 'border-danger-500 focus:border-danger-600 focus:ring-danger-600'
    : 'border-slate-300 focus:border-brand-600 focus:ring-brand-600';

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

export function Field({ label, hint, error, required, children, htmlFor, className }: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, containerClassName, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            FIELD_BASE,
            FIELD_STATE(!!error),
            'h-11 min-h-[44px] focus:outline-none focus:ring-1',
            leftIcon && 'pl-9',
            rightSlot && 'pr-11',
            className,
          )}
          {...props}
        />
        {rightSlot && <div className="absolute right-1 top-1/2 -translate-y-1/2">{rightSlot}</div>}
      </div>
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_BASE, FIELD_STATE(!!error), 'py-2.5 focus:outline-none focus:ring-1', className)}
        {...props}
      />
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          FIELD_BASE,
          FIELD_STATE(!!error),
          'h-11 min-h-[44px] appearance-none bg-no-repeat pr-9 focus:outline-none focus:ring-1',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
          backgroundPosition: 'right 0.6rem center',
          backgroundSize: '1.1em',
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn('flex cursor-pointer items-center gap-2.5 py-1 text-sm text-slate-700', className)}
    >
      <input
        type="checkbox"
        id={props.id ?? id}
        className="h-[18px] w-[18px] shrink-0 rounded border-slate-300 text-brand-700 focus:ring-2 focus:ring-brand-600 focus:ring-offset-0"
        {...props}
      />
      {label}
    </label>
  );
}

/** Segmented multi-select shown as toggle chips — far faster on mobile than a multi-select. */
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  label?: string;
  options: Array<{ value: T; label: string }>;
  value: T[];
  onChange: (next: T[]) => void;
  error?: string;
  hint?: string;
}) {
  const toggle = (v: T) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              aria-pressed={active}
              className={cn(
                'rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
