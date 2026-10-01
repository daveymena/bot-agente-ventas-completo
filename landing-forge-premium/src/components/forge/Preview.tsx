'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

export function Preview({
  html,
  device,
  setDevice,
  bytes,
  sections,
  themeName,
}: {
  html: string | null;
  device: 'mobile' | 'desktop';
  setDevice: (d: 'mobile' | 'desktop') => void;
  bytes: number;
  sections: number;
  themeName: string | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  // Mantiene la posición del scroll entre re-renders para que editar no
  // devuelva siempre al inicio de la landing.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onLoad = () => {
      try {
        frame.contentWindow?.scrollTo(0, scrollY);
        const win = frame.contentWindow;
        if (win) {
          win.addEventListener(
            'scroll',
            () => setScrollY(win.scrollY),
            { passive: true }
          );
        }
      } catch {
        /* cross-origin imposible con srcDoc, pero por si acaso */
      }
    };
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, reloadKey]);

  if (!html) {
    return (
      <div className="grid h-full min-h-[50vh] place-items-center p-8 text-center">
        <div className="max-w-xs">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-ink-700 bg-ink-850 text-ink-400">
            <Icon name="monitor" size={24} />
          </div>
          <p className="font-display text-sm font-semibold text-ink-200">Elige un producto</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
            Apenas selecciones un producto del catálogo vas a ver la landing aquí, en vivo, y vas a
            poder editar los textos haciendo clic encima.
          </p>
        </div>
      </div>
    );
  }

  const kb = (bytes / 1024).toFixed(0);

  return (
    <div className="flex h-full flex-col" style={{ maxHeight: 'calc(100dvh - 104px)' }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2.5">
        <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
          {(
            [
              { id: 'mobile', icon: 'phone', label: 'Celular' },
              { id: 'desktop', icon: 'monitor', label: 'Escritorio' },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              title={d.label}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                device === d.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              <Icon name={d.icon} size={14} />
              <span className="hidden sm:inline">{d.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="panel-btn-subtle px-2.5 py-1.5 text-[11px]"
          onClick={() => setReloadKey((k) => k + 1)}
          title="Recargar la vista previa"
        >
          <Icon name="refresh" size={14} />
        </button>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-400">
          <span className="panel-chip">{sections} secciones</span>
          <span className="panel-chip">{kb} KB</span>
          {themeName ? <span className="panel-chip capitalize">{themeName.replace('-', ' ')}</span> : null}
        </div>
      </div>

      <p className="border-b border-ink-800 bg-ink-900 px-4 py-1.5 text-[11px] text-ink-400">
        Haz clic sobre cualquier título o párrafo de la vista previa para editarlo ahí mismo.
      </p>

      <div className="flex-1 overflow-auto bg-ink-950 p-4">
        {device === 'mobile' ? (
          <div className="mx-auto w-full" style={{ maxWidth: 400 }}>
            <div className="rounded-[2.2rem] border-[10px] border-ink-700 bg-ink-800 shadow-2xl">
              <div className="relative overflow-hidden rounded-[1.5rem] bg-white">
                <span className="absolute top-1.5 left-1/2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-ink-800" />
                <iframe
                  key={`m-${reloadKey}`}
                  ref={frameRef}
                  srcDoc={html}
                  title="Vista previa en celular"
                  className="block w-full border-0"
                  style={{ height: 'min(760px, calc(100dvh - 220px))' }}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-ink-500">390 × 760 · iPhone 14</p>
          </div>
        ) : (
          <div className="mx-auto w-full">
            <div className="overflow-hidden rounded-xl border border-ink-700 bg-white shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-ink-200 bg-ink-100 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 truncate rounded bg-white px-2 py-0.5 text-[10px] text-ink-500">
                  ventasproia.com/l/mi-landing
                </span>
              </div>
              <iframe
                key={`d-${reloadKey}`}
                ref={frameRef}
                srcDoc={html}
                title="Vista previa en escritorio"
                className="block w-full border-0"
                style={{ height: 'calc(100dvh - 240px)', minHeight: 520 }}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
