import Link from 'next/link';

export function Breadcrumbs({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-aegis-gray-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-aegis-gray-300">/</span>}
          {it.href ? (
            <Link href={it.href} className="hover:text-aegis-navy">{it.label}</Link>
          ) : (
            <span className="font-medium text-aegis-gray">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function DetailHeader({
  title, subtitle, badges, actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col items-start gap-4 border-b border-aegis-gray-100 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-aegis-navy sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-aegis-gray-500">{subtitle}</p>}
        {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

export function Section({
  title, action, children, dense,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="mb-8 rounded-lg border border-aegis-gray-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-aegis-gray-100 px-5 py-3 sm:px-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-aegis-gray-500">
          {title}
        </h3>
        {action}
      </header>
      <div className={dense ? 'px-5 py-3 sm:px-6' : 'px-5 py-5 sm:px-6'}>{children}</div>
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">{children}</dl>;
}

export function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-aegis-gray">{children}</dd>
    </div>
  );
}

export function EmptyMini({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
      {children}
    </p>
  );
}
