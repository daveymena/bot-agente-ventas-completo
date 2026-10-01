'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { LandingDocument, TemplateId, ThemeId } from '@/premium/types';
import { TEMPLATE_LIST, sectionsForTemplate, suggestTemplate } from '@/premium/templates';
import { THEME_LIST, suggestTheme } from '@/premium/themes';
import { Field, Icon, Notice, Panel, TextInput } from '../ui';

export function StepTemplate({
  doc,
  setDoc,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
}) {
  const suggestedTemplate = suggestTemplate(doc.product.kind);
  const suggestedTheme = suggestTheme(doc.product.category, doc.product.kind);

  const setTemplate = (template: TemplateId) => {
    setDoc((prev) =>
      prev
        ? { ...prev, template, sections: sectionsForTemplate(template), updatedAt: new Date().toISOString() }
        : prev
    );
  };

  const setTheme = (theme: ThemeId) => {
    setDoc((prev) => (prev ? { ...prev, theme, updatedAt: new Date().toISOString() } : prev));
  };

  return (
    <div className="space-y-4">
      <Panel
        title="2. Plantilla"
        description={`Sugerida para un producto ${
          doc.product.kind === 'digital' ? 'digital' : doc.product.kind === 'service' ? 'de servicio' : 'físico'
        }: ${TEMPLATE_LIST.find((t) => t.id === suggestedTemplate)?.name}`}
      >
        <ul className="space-y-2.5">
          {TEMPLATE_LIST.map((t) => {
            const active = doc.template === t.id;
            const recommended = t.id === suggestedTemplate;
            const mismatch = !t.kinds.includes(doc.product.kind);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition ${
                    active
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-ink-700 bg-ink-800 hover:border-ink-500'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${
                        active ? 'border-brand-500 bg-brand-500' : 'border-ink-600'
                      }`}
                    >
                      {active ? <Icon name="check" size={11} className="text-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold text-ink-100">{t.name}</span>
                        {recommended ? (
                          <span className="rounded-full bg-mint-400/15 px-2 py-0.5 text-[10px] font-bold text-mint-400">
                            SUGERIDA
                          </span>
                        ) : null}
                        {mismatch ? (
                          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                            OTRO TIPO
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-ink-400">
                        {t.description}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Tema visual"
        description={`Sugerido por la categoría "${doc.product.category}": ${
          THEME_LIST.find((t) => t.id === suggestedTheme)?.name
        }`}
      >
        <ul className="grid grid-cols-2 gap-2.5">
          {THEME_LIST.map((t) => {
            const active = doc.theme === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`w-full overflow-hidden rounded-xl border text-left transition ${
                    active ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-ink-700 hover:border-ink-500'
                  }`}
                >
                  {/* Muestra de los tokens del tema */}
                  <span
                    className="block h-16 w-full p-2"
                    style={{ background: t.tokens.bg, borderBottom: `1px solid ${t.tokens.border}` }}
                  >
                    <span className="flex h-full flex-col justify-between">
                      <span
                        className="block h-2.5 w-14 rounded-full"
                        style={{ background: t.tokens.text, opacity: 0.85 }}
                      />
                      <span className="flex items-center gap-1.5">
                        <span className="h-5 w-10 rounded" style={{ background: t.tokens.primary }} />
                        <span className="h-5 w-5 rounded" style={{ background: t.tokens.accent }} />
                        <span
                          className="h-5 flex-1 rounded"
                          style={{ background: t.tokens.surface, border: `1px solid ${t.tokens.border}` }}
                        />
                      </span>
                    </span>
                  </span>
                  <span className="block bg-ink-800 p-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className="font-display text-xs font-semibold text-ink-100">{t.name}</span>
                      {t.id === suggestedTheme ? (
                        <span className="rounded-full bg-mint-400/15 px-1.5 text-[9px] font-bold text-mint-400">
                          AUTO
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[10px] leading-snug text-ink-400">{t.tagline}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-end gap-3">
          <Field label="Acento">
            <input
              type="color"
              className="h-10 w-14 rounded-lg"
              value={doc.accent ?? THEME_LIST.find((t) => t.id === doc.theme)?.tokens.accent ?? '#B88A3E'}
              onChange={(e) =>
                setDoc((prev) => (prev ? { ...prev, accent: e.target.value } : prev))
              }
            />
          </Field>
          <Field label="Hex del acento" hint="Déjalo vacío para usar el color original del tema.">
            <TextInput
              value={doc.accent ?? ''}
              onChange={(v) => setDoc((prev) => (prev ? { ...prev, accent: v || null } : prev))}
              placeholder="#C8FF2E"
            />
          </Field>
          <button
            type="button"
            className="panel-btn-ghost mb-[1px]"
            onClick={() => setDoc((prev) => (prev ? { ...prev, accent: null } : prev))}
          >
            Reiniciar
          </button>
        </div>
      </Panel>

      <Panel title="Identidad de la landing">
        <div className="space-y-3">
          <Field label="Título de la página (pestaña del navegador)">
            <TextInput
              value={doc.title}
              onChange={(v) => setDoc((prev) => (prev ? { ...prev, title: v } : prev))}
            />
          </Field>
          <Field label="Slug (ruta pública)" hint={`La landing quedará en /l/${doc.slug}`}>
            <TextInput
              value={doc.slug}
              onChange={(v) =>
                setDoc((prev) =>
                  prev
                    ? { ...prev, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') }
                    : prev
                )
              }
            />
          </Field>
        </div>
      </Panel>

      {doc.product.kind === 'digital' && doc.template === 'cod-product' ? (
        <Notice tone="warn">
          Estás usando la plantilla de pago contra entrega con un producto digital. La plantilla
          &ldquo;Curso / Infoproducto&rdquo; es la correcta: entrega inmediata y sin formulario de
          envío.
        </Notice>
      ) : null}
    </div>
  );
}
