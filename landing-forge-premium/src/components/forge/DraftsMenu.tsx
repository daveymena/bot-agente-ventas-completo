'use client';

import { useEffect, useRef, useState } from 'react';
import type { LandingDocument } from '@/premium/types';
import { Icon } from './ui';
import { deleteDraft } from './storage';
import { cop } from '@/premium/format';

export function DraftsMenu({
  drafts,
  onOpen,
  onChange,
  currentId,
}: {
  drafts: LandingDocument[];
  onOpen: (doc: LandingDocument) => void;
  onChange: (list: LandingDocument[]) => void;
  currentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="panel-btn-ghost" onClick={() => setOpen((o) => !o)}>
        <Icon name="copy" size={15} />
        <span className="hidden sm:inline">Mis landings</span>
        <span className="rounded bg-ink-700 px-1.5 text-[10px] font-bold">{drafts.length}</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
          <div className="border-b border-ink-700 px-4 py-2.5">
            <p className="text-xs font-semibold text-ink-200">Borradores guardados</p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              Se guardan en este navegador (localStorage).
            </p>
          </div>

          {drafts.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-ink-400">
              Todavía no has creado ninguna landing.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-center gap-3 border-b border-ink-800 px-3 py-2.5 last:border-0 ${
                    d.id === currentId ? 'bg-brand-500/10' : ''
                  }`}
                >
                  {d.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.product.image}
                      alt=""
                      className="h-10 w-10 flex-none rounded-lg border border-ink-700 bg-ink-800 object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-10 w-10 flex-none rounded-lg border border-ink-700 bg-ink-800" />
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      onOpen(d);
                      setOpen(false);
                    }}
                  >
                    <span className="block truncate text-xs font-medium text-ink-100">{d.title}</span>
                    <span className="block truncate text-[11px] text-ink-400">
                      {d.template} · {d.theme} · {cop(d.settings.offer.price)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="panel-btn-subtle p-1.5 text-ink-400 hover:text-rose-300"
                    title="Eliminar borrador"
                    onClick={() => onChange(deleteDraft(d.id))}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
