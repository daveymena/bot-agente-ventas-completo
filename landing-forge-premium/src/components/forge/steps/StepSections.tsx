'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { LandingDocument, SectionSpec, SectionType } from '@/premium/types';
import { PINNED_SECTIONS, SECTION_LABELS } from '@/premium/sections/registry';
import { sectionsForTemplate } from '@/premium/templates';
import { uid } from '@/premium/format';
import { Icon, Notice, Panel } from '../ui';

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as SectionType[];

export function StepSections({
  doc,
  setDoc,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const setSections = (sections: SectionSpec[]) =>
    setDoc((prev) => (prev ? { ...prev, sections, updatedAt: new Date().toISOString() } : prev));

  const movable = useMemo(
    () => doc.sections.filter((s) => !PINNED_SECTIONS.includes(s.type)),
    [doc.sections]
  );
  const pinned = useMemo(
    () => doc.sections.filter((s) => PINNED_SECTIONS.includes(s.type)),
    [doc.sections]
  );

  const commit = (nextMovable: SectionSpec[]) => setSections([...nextMovable, ...pinned]);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= movable.length) return;
    const next = [...movable];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  const available = ALL_SECTIONS.filter(
    (t) => !PINNED_SECTIONS.includes(t) && !doc.sections.some((s) => s.type === t)
  );

  const visibleCount = doc.sections.filter((s) => !s.hidden).length;

  return (
    <div className="space-y-4">
      <Panel
        title="6. Secciones"
        description={`${visibleCount} visibles de ${doc.sections.length}. Arrastra para reordenar y usa el ojo para ocultar sin borrar.`}
        action={
          <button
            type="button"
            className="panel-btn-subtle text-[11px]"
            onClick={() => setSections(sectionsForTemplate(doc.template))}
            title="Volver al orden original de la plantilla"
          >
            <Icon name="refresh" size={13} /> Restaurar
          </button>
        }
      >
        <ol className="space-y-1.5">
          {movable.map((s, i) => {
            const isDragging = dragIndex === i;
            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
            return (
              <li
                key={s.id}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox necesita datos en el dataTransfer para iniciar el arrastre.
                  e.dataTransfer.setData('text/plain', s.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOverIndex(i);
                }}
                onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                  isDragging
                    ? 'border-brand-500 bg-brand-500/10 opacity-60'
                    : isOver
                      ? 'border-brand-500 bg-ink-800'
                      : 'border-ink-700 bg-ink-800'
                } ${s.hidden ? 'opacity-50' : ''}`}
              >
                <span className="cursor-grab text-ink-500 active:cursor-grabbing" title="Arrastrar">
                  <Icon name="drag" size={16} />
                </span>
                <span className="w-5 flex-none text-right text-[11px] font-semibold text-ink-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-ink-100">
                    {SECTION_LABELS[s.type]}
                  </span>
                  <span className="block truncate text-[10px] text-ink-500">{s.type}</span>
                </span>

                <span className="flex flex-none items-center gap-0.5">
                  <button
                    type="button"
                    className="panel-btn-subtle p-1.5 text-ink-500 hover:text-ink-100 disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    title="Subir"
                  >
                    <Icon name="up" size={14} />
                  </button>
                  <button
                    type="button"
                    className="panel-btn-subtle p-1.5 text-ink-500 hover:text-ink-100 disabled:opacity-30"
                    disabled={i === movable.length - 1}
                    onClick={() => move(i, i + 1)}
                    title="Bajar"
                  >
                    <Icon name="down" size={14} />
                  </button>
                  <button
                    type="button"
                    className={`panel-btn-subtle p-1.5 ${s.hidden ? 'text-ink-500' : 'text-mint-400'}`}
                    onClick={() =>
                      commit(movable.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)))
                    }
                    title={s.hidden ? 'Mostrar' : 'Ocultar'}
                  >
                    <Icon name={s.hidden ? 'eyeOff' : 'eye'} size={14} />
                  </button>
                  <button
                    type="button"
                    className="panel-btn-subtle p-1.5 text-ink-500 hover:text-rose-300"
                    onClick={() => commit(movable.filter((_, j) => j !== i))}
                    title="Quitar"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          className="panel-btn-ghost mt-3 w-full"
          onClick={() => setAdding((a) => !a)}
        >
          <Icon name="plus" size={15} /> Agregar sección
        </button>

        {adding ? (
          available.length === 0 ? (
            <p className="mt-3 text-center text-[11px] text-ink-400">
              Ya están todas las secciones disponibles en la landing.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-1.5">
              {available.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-left text-[11px] text-ink-200 transition hover:border-brand-500"
                    onClick={() => {
                      commit([...movable, { id: uid('sec'), type: t }]);
                      setAdding(false);
                    }}
                  >
                    {SECTION_LABELS[t]}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Panel>

      {pinned.length ? (
        <Panel title="Elementos fijos" description="Siempre van al final del documento y flotan sobre la página.">
          <ul className="space-y-1.5">
            {pinned.map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-2.5 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 ${
                  s.hidden ? 'opacity-50' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-100">
                  {SECTION_LABELS[s.type]}
                </span>
                <button
                  type="button"
                  className={`panel-btn-subtle p-1.5 ${s.hidden ? 'text-ink-500' : 'text-mint-400'}`}
                  onClick={() =>
                    setSections(
                      doc.sections.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x))
                    )
                  }
                  title={s.hidden ? 'Mostrar' : 'Ocultar'}
                >
                  <Icon name={s.hidden ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {doc.settings.reviews.length === 0 && doc.sections.some((s) => s.type === 'reviews' && !s.hidden) ? (
        <Notice tone="warn">
          La sección de reseñas está activa pero no hay reseñas cargadas, así que no se va a
          imprimir en la landing. Cárgalas en el paso de oferta.
        </Notice>
      ) : null}

      {!doc.settings.offer.deadline && doc.sections.some((s) => s.type === 'countdown' && !s.hidden) ? (
        <Notice tone="warn">
          La cuenta regresiva necesita una fecha real de fin de promoción. Mientras no la pongas, la
          sección queda vacía: no generamos temporizadores que se reinician solos.
        </Notice>
      ) : null}
    </div>
  );
}
