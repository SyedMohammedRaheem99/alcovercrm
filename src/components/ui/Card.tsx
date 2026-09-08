import { cn } from '@/lib/utils/cn';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn('text-sm font-semibold text-slate-900', className)}>{children}</h3>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

/** Dashboard metric tile. */
export function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'default',
  href,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  href?: string;
}) {
  const TONES = {
    default: 'text-slate-900',
    danger: 'text-danger-600',
    warning: 'text-warning-600',
    success: 'text-success-600',
    info: 'text-info-600',
  } as const;

  const ICON_TONES = {
    default: 'bg-slate-100 text-slate-500',
    danger: 'bg-danger-50 text-danger-600',
    warning: 'bg-warning-50 text-warning-600',
    success: 'bg-success-50 text-success-600',
    info: 'bg-info-50 text-info-600',
  } as const;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', ICON_TONES[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn('tabular mt-2 text-2xl font-semibold', TONES[tone])}>{value}</p>
      {sublabel && <p className="mt-0.5 text-xs text-slate-500">{sublabel}</p>}
    </>
  );

  const base = 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm';

  if (href) {
    return (
      <a href={href} className={cn(base, 'block transition-shadow hover:shadow-md')}>
        {content}
      </a>
    );
  }

  return <div className={base}>{content}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} />;
}
