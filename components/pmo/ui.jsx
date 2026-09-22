'use client';

// The handful of pieces every PMO screen is built from.

export const TONE = {
  good: 'border-l-signal-good bg-emerald-50/60',
  warn: 'border-l-signal-warn bg-amber-50/60',
  bad: 'border-l-signal-bad bg-rose-50/60',
  info: 'border-l-pmo-500 bg-pmo-50',
  none: 'border-l-pmo-200 bg-white',
};

export const RAG = {
  Red: 'bg-rose-100 text-rose-900 ring-rose-300',
  Amber: 'bg-amber-100 text-amber-900 ring-amber-300',
  Green: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  Critical: 'bg-rose-100 text-rose-900 ring-rose-300',
  High: 'bg-orange-100 text-orange-900 ring-orange-300',
  Medium: 'bg-amber-100 text-amber-900 ring-amber-300',
  Low: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
};

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-pmo-100 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-pmo-100 px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold text-pmo-700">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p> : null}
          </div>
          {action ? <div className="ml-auto">{action}</div> : null}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'none' }) {
  return (
    <div className={`rounded-lg border border-pmo-100 border-l-[3px] px-3 py-2.5 ${TONE[tone] ?? TONE.none}`}>
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold leading-tight text-pmo-700">{value}</div>
      {sub ? <div className="mt-0.5 text-[0.7rem] text-ink-500">{sub}</div> : null}
    </div>
  );
}

export function Badge({ children, tone }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold ring-1 ring-inset ${RAG[tone] ?? 'bg-pmo-50 text-pmo-700 ring-pmo-200'}`}>
      {children}
    </span>
  );
}

export function Button({ as = 'button', variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-pmo-700 text-white hover:bg-pmo-600 disabled:bg-pmo-200',
    secondary: 'border border-pmo-200 bg-white text-pmo-700 hover:bg-pmo-50 disabled:text-ink-400',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
    ghost: 'text-pmo-600 hover:bg-pmo-50',
  }[variant];
  const Tag = as;
  return (
    <Tag
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[0.7rem] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'mt-1 w-full rounded-lg border border-pmo-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-pmo-500 focus:ring-2 focus:ring-pmo-500/20';

export function Alert({ tone = 'bad', children }) {
  const styles = {
    bad: 'border-rose-200 bg-rose-50 text-rose-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-pmo-200 bg-pmo-50 text-pmo-700',
  }[tone];
  return <div role={tone === 'bad' ? 'alert' : undefined} className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>{children}</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-pmo-200 bg-pmo-50/50 px-6 py-10 text-center">
      <h3 className="text-sm font-bold text-pmo-700">{title}</h3>
      <div className="mt-1 text-sm text-ink-500">{children}</div>
    </div>
  );
}

/** A readiness meter: the number and what it is made of, never colour alone. */
export function Readiness({ score, grade, counts }) {
  const tone = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
  const bar = { good: 'bg-signal-good', warn: 'bg-signal-warn', bad: 'bg-signal-bad' }[tone];
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-pmo-700">{score}</span>
        <span className="text-xs text-ink-400">/ 100</span>
        <Badge tone={tone === 'good' ? 'Green' : tone === 'warn' ? 'Amber' : 'Red'}>{grade}</Badge>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pmo-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      {counts ? (
        <p className="mt-1.5 text-[0.7rem] text-ink-500">
          {counts.high} material · {counts.medium} moderate · {counts.low} minor observations
        </p>
      ) : null}
    </div>
  );
}

export const percent = (value, digits = 1) => (Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—');

export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getUTCDate()).padStart(2, '0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
