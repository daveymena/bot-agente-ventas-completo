'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CopyBundle, FaqItem, LandingDocument } from '@/premium/types';
import { buildCopy } from '@/premium/copy/generator';
import { hasBannedClaim } from '@/premium/copy/angles';
import { uid } from '@/premium/format';
import type { PanelSettings } from '../storage';
import { Field, Icon, Notice, Panel, TextArea, TextInput } from '../ui';

type FieldSpec = { key: keyof CopyBundle; label: string; rows?: number };

const GROUPS: Array<{ title: string; fields: FieldSpec[] }> = [
  {
    title: 'Encabezado',
    fields: [
      { key: 'announcement', label: 'Barra superior' },
      { key: 'heroEyebrow', label: 'Antetítulo del hero' },
      { key: 'headline', label: 'Titular', rows: 2 },
      { key: 'subheadline', label: 'Subtítulo', rows: 3 },
      { key: 'ctaPrimary', label: 'Botón principal' },
      { key: 'ctaSecondary', label: 'Botón secundario' },
    ],
  },
  {
    title: 'Beneficios',
    fields: [
      { key: 'benefitsEyebrow', label: 'Antetítulo' },
      { key: 'benefitsTitle', label: 'Título' },
    ],
  },
  {
    title: 'Problema → solución',
    fields: [
      { key: 'problemEyebrow', label: 'Antetítulo' },
      { key: 'problemTitle', label: 'Título del problema' },
      { key: 'problemText', label: 'Texto del problema', rows: 4 },
      { key: 'solutionTitle', label: 'Título de la solución' },
      { key: 'solutionText', label: 'Texto de la solución', rows: 4 },
    ],
  },
  {
    title: 'Paso a paso',
    fields: [
      { key: 'howEyebrow', label: 'Antetítulo' },
      { key: 'howTitle', label: 'Título' },
    ],
  },
  {
    title: 'Paquetes y reseñas',
    fields: [
      { key: 'bundlesEyebrow', label: 'Antetítulo de paquetes' },
      { key: 'bundlesTitle', label: 'Título de paquetes' },
      { key: 'bundlesSubtitle', label: 'Subtítulo de paquetes', rows: 2 },
      { key: 'reviewsEyebrow', label: 'Antetítulo de reseñas' },
      { key: 'reviewsTitle', label: 'Título de reseñas' },
    ],
  },
  {
    title: 'Garantía, envío y FAQ',
    fields: [
      { key: 'guaranteeTitle', label: 'Título de garantía' },
      { key: 'guaranteeText', label: 'Texto de garantía', rows: 4 },
      { key: 'shippingTitle', label: 'Título de envío' },
      { key: 'faqTitle', label: 'Título de FAQ' },
    ],
  },
  {
    title: 'Formulario y cierre',
    fields: [
      { key: 'formEyebrow', label: 'Antetítulo del formulario' },
      { key: 'formTitle', label: 'Título del formulario' },
      { key: 'formSubtitle', label: 'Subtítulo del formulario', rows: 2 },
      { key: 'relatedTitle', label: 'Título de relacionados' },
      { key: 'closingTitle', label: 'Título del cierre' },
      { key: 'closingText', label: 'Texto del cierre', rows: 3 },
    ],
  },
  {
    title: 'Advertorial',
    fields: [
      { key: 'articleKicker', label: 'Sección del artículo' },
      { key: 'articleTitle', label: 'Titular del artículo', rows: 2 },
      { key: 'articleStandfirst', label: 'Entradilla', rows: 3 },
      { key: 'articleAuthor', label: 'Autor' },
      { key: 'listicleTitle', label: 'Título del listicle', rows: 2 },
    ],
  },
  {
    title: 'Curso digital',
    fields: [{ key: 'curriculumTitle', label: 'Título del temario' }],
  },
];

export function StepCopy({
  doc,
  setDoc,
  panel,
  setPanel,
  focusField,
  onFocusHandled,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
  panel: PanelSettings;
  setPanel: (p: PanelSettings) => void;
  focusField: string | null;
  onFocusHandled: () => void;
}) {
  const [open, setOpen] = useState<string>('Encabezado');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const copy = doc.settings.copy;

  // Cuando se hace clic en un texto de la vista previa, abrimos su grupo y lo enfocamos.
  useEffect(() => {
    if (!focusField) return;
    const group = GROUPS.find((g) => g.fields.some((f) => f.key === focusField));
    if (group) setOpen(group.title);
    const t = setTimeout(() => {
      const el = refs.current[focusField];
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el as HTMLInputElement).focus?.();
      }
      onFocusHandled();
    }, 80);
    return () => clearTimeout(t);
  }, [focusField, onFocusHandled]);

  const setField = (key: keyof CopyBundle, value: string) => {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            settings: { ...prev.settings, copy: { ...prev.settings.copy, [key]: value } },
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
  };

  const setList = (key: 'bullets' | 'curriculum' | 'forWho' | 'notForWho' | 'serviceIncludes', value: string[]) => {
    setDoc((prev) =>
      prev
        ? { ...prev, settings: { ...prev.settings, copy: { ...prev.settings.copy, [key]: value } } }
        : prev
    );
  };

  const setFaq = (faq: FaqItem[]) =>
    setDoc((prev) => (prev ? { ...prev, settings: { ...prev.settings, faq } } : prev));

  const regenerate = () => {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              copy: buildCopy({
                product: prev.product,
                awareness: prev.settings.awareness,
                angle: prev.settings.angle,
                offer: prev.settings.offer,
                emojisInCopy: prev.settings.emojisInCopy,
                storeName: prev.store.name,
              }),
            },
          }
        : prev
    );
  };

  const polishWithAi = async () => {
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch('/api/store/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copy,
          product: {
            name: doc.product.name,
            description: doc.product.description,
            category: doc.product.category,
            kind: doc.product.kind,
            price: doc.settings.offer.price,
          },
          awareness: doc.settings.awareness,
          angle: doc.settings.angle,
          apiKey: panel.aiApiKey,
          model: panel.aiModel,
          baseUrl: panel.aiBaseUrl,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'No se pudo mejorar el copy');
      setDoc((prev) =>
        prev
          ? { ...prev, settings: { ...prev.settings, copy: { ...prev.settings.copy, ...json.copy } } }
          : prev
      );
      setAiMessage({ tone: 'ok', text: `Copy pulido con ${json.model}.` });
    } catch (err) {
      setAiMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Error desconocido' });
    } finally {
      setAiBusy(false);
    }
  };

  const warnings = Object.entries(copy)
    .filter(([, v]) => typeof v === 'string' && hasBannedClaim(v as string))
    .map(([k]) => k);

  return (
    <div className="space-y-4">
      <Panel
        title="5. Textos"
        description="Generados con plantillas a partir del nombre, la descripción y las características. Edita aquí o directo en la vista previa."
        action={
          <button type="button" className="panel-btn-subtle text-[11px]" onClick={regenerate}>
            <Icon name="refresh" size={13} /> Regenerar
          </button>
        }
      >
        {warnings.length ? (
          <div className="mb-3">
            <Notice tone="danger">
              Hay frases que Meta puede rechazar en: {warnings.join(', ')}. Evita promesas médicas y
              escasez falsa.
            </Notice>
          </div>
        ) : null}

        <div className="space-y-2">
          {GROUPS.map((g) => {
            const isOpen = open === g.title;
            return (
              <div key={g.title} className="overflow-hidden rounded-xl border border-ink-700">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? '' : g.title)}
                  className="flex w-full items-center justify-between gap-3 bg-ink-800 px-3.5 py-2.5 text-left"
                >
                  <span className="text-xs font-semibold text-ink-100">{g.title}</span>
                  <Icon name={isOpen ? 'up' : 'down'} size={15} className="text-ink-400" />
                </button>
                {isOpen ? (
                  <div className="space-y-3 bg-ink-850 p-3.5">
                    {g.fields.map((f) => {
                      const value = String(copy[f.key] ?? '');
                      return (
                        <Field key={String(f.key)} label={f.label}>
                          {f.rows ? (
                            <textarea
                              ref={(el) => {
                                refs.current[String(f.key)] = el;
                              }}
                              className="panel-input resize-y leading-relaxed"
                              rows={f.rows}
                              value={value}
                              onChange={(e) => setField(f.key, e.target.value)}
                            />
                          ) : (
                            <input
                              ref={(el) => {
                                refs.current[String(f.key)] = el;
                              }}
                              className="panel-input"
                              value={value}
                              onChange={(e) => setField(f.key, e.target.value)}
                            />
                          )}
                        </Field>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Beneficios" description="De 3 a 6 palabras cada uno, como en los anuncios que convierten.">
        <ListEditor
          items={copy.bullets}
          onChange={(v) => setList('bullets', v)}
          placeholder="Rueda gruesa, más estabilidad"
        />
      </Panel>

      {doc.product.kind === 'digital' ? (
        <>
          <Panel title="Módulos del curso">
            <ListEditor items={copy.curriculum} onChange={(v) => setList('curriculum', v)} placeholder="Módulo 1: fundamentos" />
          </Panel>
          <Panel title="Para quién es / para quién no">
            <p className="panel-label">Es para ti si…</p>
            <ListEditor items={copy.forWho} onChange={(v) => setList('forWho', v)} placeholder="Empiezas desde cero" />
            <p className="panel-label mt-4">No es para ti si…</p>
            <ListEditor
              items={copy.notForWho}
              onChange={(v) => setList('notForWho', v)}
              placeholder="Buscas un título oficial"
            />
          </Panel>
        </>
      ) : null}

      {doc.product.kind === 'service' ? (
        <Panel title="Qué incluye el servicio">
          <ListEditor
            items={copy.serviceIncludes}
            onChange={(v) => setList('serviceIncludes', v)}
            placeholder="Diagnóstico inicial sin costo"
          />
        </Panel>
      ) : null}

      <Panel title="Preguntas frecuentes">
        <ul className="space-y-2.5">
          {doc.settings.faq.map((f, i) => (
            <li key={f.id} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="panel-input flex-1 py-1.5 text-xs"
                  value={f.q}
                  placeholder="Pregunta"
                  onChange={(e) => {
                    const next = [...doc.settings.faq];
                    next[i] = { ...f, q: e.target.value };
                    setFaq(next);
                  }}
                />
                <button
                  type="button"
                  className="panel-btn-subtle p-2 text-ink-400 hover:text-rose-300"
                  onClick={() => setFaq(doc.settings.faq.filter((_, j) => j !== i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <TextArea
                value={f.a}
                rows={3}
                onChange={(v) => {
                  const next = [...doc.settings.faq];
                  next[i] = { ...f, a: v };
                  setFaq(next);
                }}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="panel-btn-ghost mt-3 w-full"
          onClick={() => setFaq([...doc.settings.faq, { id: uid('faq'), q: '', a: '' }])}
        >
          <Icon name="plus" size={15} /> Agregar pregunta
        </button>
      </Panel>

      <Panel
        title="Pulir con IA (opcional)"
        description="El copy ya funciona sin IA. Si pegas una API key, se usa solo para mejorar la redacción respetando las reglas de honestidad."
      >
        <div className="space-y-3">
          <Field label="API key" hint="Se guarda solo en este navegador y se envía únicamente al proveedor que elijas.">
            <TextInput
              value={panel.aiApiKey}
              onChange={(v) => setPanel({ ...panel, aiApiKey: v })}
              type="password"
              placeholder="sk-…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modelo">
              <TextInput value={panel.aiModel} onChange={(v) => setPanel({ ...panel, aiModel: v })} />
            </Field>
            <Field label="Base URL">
              <TextInput value={panel.aiBaseUrl} onChange={(v) => setPanel({ ...panel, aiBaseUrl: v })} />
            </Field>
          </div>
          <button
            type="button"
            className="panel-btn-primary w-full"
            disabled={aiBusy || !panel.aiApiKey}
            onClick={polishWithAi}
          >
            <Icon name="sparkles" size={15} />
            {aiBusy ? 'Mejorando…' : 'Mejorar redacción'}
          </button>
          {aiMessage ? <Notice tone={aiMessage.tone}>{aiMessage.text}</Notice> : null}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 flex-none text-right text-[11px] text-ink-500">{i + 1}</span>
            <input
              className="panel-input py-2 text-xs"
              value={item}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              className="panel-btn-subtle p-1.5 text-ink-500 hover:text-ink-200"
              disabled={i === 0}
              onClick={() => {
                const next = [...items];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              <Icon name="up" size={14} />
            </button>
            <button
              type="button"
              className="panel-btn-subtle p-1.5 text-ink-500 hover:text-rose-300"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="panel-btn-ghost mt-2.5 w-full" onClick={() => onChange([...items, ''])}>
        <Icon name="plus" size={15} /> Agregar
      </button>
    </div>
  );
}
