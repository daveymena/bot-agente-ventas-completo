'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TemplateId, ThemeId } from '@/premium/types';
import { TEMPLATE_LIST } from '@/premium/templates';
import { THEME_LIST } from '@/premium/themes';
import { Icon } from '@/components/forge/ui';

export function DemoMatrix() {
  const [template, setTemplate] = useState<TemplateId>('cod-product');
  const [theme, setTheme] = useState<ThemeId>('clean-luxe');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');

  const src = `/premium/demo/view?template=${template}&theme=${theme}`;
  const currentTemplate = TEMPLATE_LIST.find((t) => t.id === template);
  const currentTheme = THEME_LIST.find((t) => t.id === theme);

  return (
    <div className="min-h-dvh bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/premium" className="panel-btn-ghost">
            <Icon name="arrowLeft" size={15} /> Generador
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-sm font-semibold text-ink-100">
              Demo · 4 plantillas × 4 temas
            </h1>
            <p className="truncate text-[11px] text-ink-400">
              Renderizadas con productos reales del catálogo sofia-premium.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
              {(
                [
                  { id: 'mobile', icon: 'phone' },
                  { id: 'desktop', icon: 'monitor' },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDevice(d.id)}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    device === d.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'
                  }`}
                >
                  <Icon name={d.icon} size={15} />
                </button>
              ))}
            </div>
            <a href={src} target="_blank" rel="noopener noreferrer" className="panel-btn-ghost">
              <Icon name="external" size={15} />
              <span className="hidden sm:inline">Abrir sola</span>
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[18rem_1fr]">
        {/* Matriz ------------------------------------------------- */}
        <div className="space-y-4">
          <section className="panel-card p-4">
            <p className="panel-label">Plantilla</p>
            <ul className="space-y-1.5">
              {TEMPLATE_LIST.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      template === t.id
                        ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                        : 'border-ink-700 bg-ink-800 text-ink-300 hover:border-ink-500'
                    }`}
                  >
                    <span className="block font-medium">{t.name}</span>
                    <span className="mt-0.5 block text-[10px] text-ink-500">{t.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-card p-4">
            <p className="panel-label">Tema</p>
            <ul className="grid grid-cols-2 gap-2">
              {THEME_LIST.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`w-full overflow-hidden rounded-lg border text-left transition ${
                      theme === t.id ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-ink-700'
                    }`}
                  >
                    <span
                      className="flex h-10 items-end gap-1 p-1.5"
                      style={{ background: t.tokens.bg }}
                    >
                      <span className="h-4 w-6 rounded" style={{ background: t.tokens.primary }} />
                      <span className="h-4 w-4 rounded" style={{ background: t.tokens.accent }} />
                      <span
                        className="h-4 flex-1 rounded"
                        style={{ background: t.tokens.surface, border: `1px solid ${t.tokens.border}` }}
                      />
                    </span>
                    <span className="block bg-ink-800 px-2 py-1.5 text-[10px] font-medium text-ink-200">
                      {t.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-card p-4">
            <p className="panel-label">Combinación actual</p>
            <p className="text-xs leading-relaxed text-ink-300">
              <strong className="text-ink-100">{currentTemplate?.name}</strong> con{' '}
              <strong className="text-ink-100">{currentTheme?.name}</strong>.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">{currentTemplate?.description}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">{currentTheme?.tagline}</p>
          </section>
        </div>

        {/* Vista -------------------------------------------------- */}
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
          {device === 'mobile' ? (
            <div className="mx-auto w-full" style={{ maxWidth: 400 }}>
              <div className="rounded-[2.2rem] border-[10px] border-ink-700 bg-ink-800 shadow-2xl">
                <div className="overflow-hidden rounded-[1.5rem] bg-white">
                  <iframe
                    key={src}
                    src={src}
                    title={`${currentTemplate?.name} · ${currentTheme?.name}`}
                    className="block w-full border-0"
                    style={{ height: 'min(820px, calc(100dvh - 180px))' }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-700 bg-white shadow-2xl">
              <iframe
                key={src}
                src={src}
                title={`${currentTemplate?.name} · ${currentTheme?.name}`}
                className="block w-full border-0"
                style={{ height: 'calc(100dvh - 180px)', minHeight: 560 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
