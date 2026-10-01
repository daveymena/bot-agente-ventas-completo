'use client';

import { useId, type ReactNode } from 'react';
import { cop } from '@/premium/format';

/* ------------------------------------------------------------------ */
/* Campos                                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="panel-label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-snug text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <input
      className="panel-input"
      type={type}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="panel-input resize-y leading-relaxed"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function MoneyInput({
  value,
  onChange,
  placeholder = '0',
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-ink-400">$</span>
      <input
        className="panel-input pl-7"
        type="text"
        inputMode="numeric"
        value={value === null || Number.isNaN(value) ? '' : value.toLocaleString('es-CO').replace(/,/g, '.')}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits ? Number(digits) : null);
        }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-11 flex-none rounded-full border transition ${
          checked ? 'border-brand-500 bg-brand-500' : 'border-ink-600 bg-ink-800'
        }`}
      >
        <span
          className={`block h-4.5 w-4.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
          style={{ height: 18, width: 18, transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">{hint}</span> : null}
      </label>
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select className="panel-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Bloques                                                             */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel-card animate-panel p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-ink-100">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-relaxed text-ink-400">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'ok' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    info: 'border-brand-500/35 bg-brand-500/10 text-ink-100',
    warn: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    ok: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100',
    danger: 'border-rose-500/35 bg-rose-500/10 text-rose-100',
  } as const;
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${tones[tone]}`}>{children}</div>
  );
}

export function PriceTag({ value }: { value: number }) {
  return <span className="font-display font-semibold text-ink-100">{cop(value)}</span>;
}

/* ------------------------------------------------------------------ */
/* Íconos del panel (set de línea, consistente con el motor)           */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13',
  drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z|M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M3 3l18 18M10.5 10.6a2.5 2.5 0 0 0 3.4 3.4M6.4 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1M9.9 5.7A7.9 7.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a19 19 0 0 1-2.6 3.5',
  check: 'm20 6-11 11-5-5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  sparkles: 'm12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  phone: 'M7 2.5h10v19H7z|M11 18.5h2',
  monitor: 'M2.5 4h19v12h-19zM9 20h6M12 16v4',
  refresh: 'M4 9a8 8 0 0 1 13.7-3.7L20 7M20 4v3h-3M20 15a8 8 0 0 1-13.7 3.7L4 17M4 20v-3h3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z',
  external: 'M14 5h5v5M19 5l-8 8M18 14v5H5V6h5',
};

export function Icon({ name, size = 16, className = '' }: { name: keyof typeof ICONS | string; size?: number; className?: string }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d.split('|').map((path, i) => (
        <path key={i} d={path} />
      ))}
    </svg>
  );
}
