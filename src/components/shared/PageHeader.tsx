import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Script accent line above the title (e.g. "Good morning"). */
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  /** Buttons rendered on the right (stack under the title on mobile). */
  actions?: ReactNode;
}

/** Page title block shared by every admin/staff screen. */
export default function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-3xl sm:text-4xl -mb-1">{eyebrow}</p>}
        <h1 className="font-display text-3xl sm:text-4xl text-espresso-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-bark-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:gap-3 sm:justify-end">{actions}</div>}
    </div>
  );
}
