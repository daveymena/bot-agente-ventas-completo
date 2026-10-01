'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Angle, Awareness, LandingDocument } from '@/premium/types';
import { ANGLES, AWARENESS_HINT, AWARENESS_LABEL, FAMILY_LABEL, detectFamily } from '@/premium/copy/angles';
import { buildCopy } from '@/premium/copy/generator';
import { Icon, Notice, Panel, Toggle } from '../ui';

const AWARENESS_IDS: Awareness[] = ['cold', 'problem', 'product'];
const ANGLE_IDS: Angle[] = ['pain', 'desire', 'saving', 'gift', 'status'];

export function StepAudience({
  doc,
  setDoc,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
}) {
  const family = detectFamily(doc.product.category, doc.product.name, doc.product.kind);

  const regenerate = (patch: { awareness?: Awareness; angle?: Angle; emojisInCopy?: boolean }) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const awareness = patch.awareness ?? prev.settings.awareness;
      const angle = patch.angle ?? prev.settings.angle;
      const emojisInCopy = patch.emojisInCopy ?? prev.settings.emojisInCopy;
      const copy = buildCopy({
        product: prev.product,
        awareness,
        angle,
        offer: prev.settings.offer,
        emojisInCopy,
        storeName: prev.store.name,
      });
      return {
        ...prev,
        settings: { ...prev.settings, awareness, angle, emojisInCopy, copy },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        title="3. Nivel de conciencia del público"
        description="Define por dónde entra la landing: por la historia, por el dolor o directo al precio."
      >
        <ul className="space-y-2">
          {AWARENESS_IDS.map((id) => {
            const active = doc.settings.awareness === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => regenerate({ awareness: id })}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-800 hover:border-ink-500'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${
                        active ? 'border-brand-500 bg-brand-500' : 'border-ink-600'
                      }`}
                    >
                      {active ? <Icon name="check" size={9} className="text-white" /> : null}
                    </span>
                    <span className="text-sm font-medium text-ink-100">{AWARENESS_LABEL[id]}</span>
                  </span>
                  <span className="mt-1 block pl-6.5 text-[11px] text-ink-400" style={{ paddingLeft: 26 }}>
                    {AWARENESS_HINT[id]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Ángulo de venta"
        description={`Familia detectada: ${FAMILY_LABEL[family]}. El ángulo cambia el titular, el subtítulo y el cierre.`}
      >
        <ul className="grid grid-cols-2 gap-2">
          {ANGLE_IDS.map((id) => {
            const active = doc.settings.angle === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => regenerate({ angle: id })}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-800 hover:border-ink-500'
                  }`}
                >
                  <span className="block text-sm font-medium text-ink-100">{ANGLES[id].label}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-400">{ANGLES[id].ctaPrimary}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Estilo del texto">
        <Toggle
          checked={doc.settings.emojisInCopy}
          onChange={(v) => regenerate({ emojisInCopy: v })}
          label="Emojis en los textos tipo anuncio"
          hint="Los íconos del diseño siempre son SVG de línea. Esto solo afecta a los bullets y a la barra superior, donde los emojis sí funcionan como en los anuncios de Meta."
        />
      </Panel>

      <Notice tone="info">
        Cada vez que cambias el nivel de conciencia o el ángulo, el copy se vuelve a generar desde
        el nombre, la descripción, las características y la categoría del producto. Si ya editaste
        textos a mano, vuelve al paso de textos para revisarlos.
      </Notice>
    </div>
  );
}
