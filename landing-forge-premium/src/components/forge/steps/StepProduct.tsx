'use client';

import { useMemo, useState } from 'react';
import type { Product, RelatedProduct, StoreInfo } from '@/premium/types';
import { cop, slugify } from '@/premium/format';
import { makeServiceProduct } from '@/premium/defaults';
import type { CatalogState } from '../ForgeApp';
import { Field, Icon, MoneyInput, Notice, Panel, TextArea, TextInput } from '../ui';

type KindFilter = 'all' | 'physical' | 'digital' | 'service';

export function StepProduct({
  catalog,
  onReload,
  onSelect,
  onManual,
}: {
  catalog: CatalogState;
  onReload: () => void;
  onSelect: (product: Product) => void | Promise<void>;
  onManual: (product: Product, store: StoreInfo, related: RelatedProduct[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [category, setCategory] = useState('all');
  const [mode, setMode] = useState<'catalog' | 'service' | 'json'>('catalog');
  const [busyId, setBusyId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set(catalog.products.map((p) => p.category).filter(Boolean));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [catalog.products]);

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return catalog.products.filter((p) => {
      if (kind !== 'all' && p.kind !== kind) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.category} ${p.id}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return hay.includes(q);
    });
  }, [catalog.products, query, kind, category]);

  const counts = useMemo(() => {
    const c = { all: catalog.products.length, physical: 0, digital: 0, service: 0 };
    for (const p of catalog.products) {
      if (p.kind === 'physical') c.physical++;
      else if (p.kind === 'digital') c.digital++;
      else c.service++;
    }
    return c;
  }, [catalog.products]);

  return (
    <div className="space-y-4">
      <Panel
        title="1. Elige el producto"
        description={`Catálogo real de la tienda sofia-premium${
          catalog.source ? ` · fuente: ${catalog.source}` : ''
        }`}
        action={
          <button type="button" className="panel-btn-subtle p-2" onClick={onReload} title="Recargar catálogo">
            <Icon name="refresh" size={16} />
          </button>
        }
      >
        <div className="mb-3 flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
          {(
            [
              ['catalog', 'Catálogo'],
              ['service', 'Servicio'],
              ['json', 'Pegar JSON'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                mode === id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'catalog' ? (
          <>
            <div className="relative mb-3">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400">
                <Icon name="search" size={16} />
              </span>
              <input
                className="panel-input pl-9"
                placeholder="Buscar por nombre, categoría o id…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  ['all', `Todos (${counts.all})`],
                  ['physical', `Físico (${counts.physical})`],
                  ['digital', `Digital (${counts.digital})`],
                  ['service', `Servicio (${counts.service})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKind(id)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    kind === id
                      ? 'border-brand-500 bg-brand-500/15 text-ink-100'
                      : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              className="panel-input mb-3"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'Todas las categorías' : c}
                </option>
              ))}
            </select>

            {catalog.loading ? (
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl border border-ink-700 bg-ink-800" />
                ))}
              </div>
            ) : catalog.error ? (
              <Notice tone="danger">
                No se pudo cargar el catálogo: {catalog.error}. Usa la pestaña &ldquo;Pegar JSON&rdquo;
                para seguir trabajando.
              </Notice>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-400">
                Ningún producto coincide con la búsqueda.
              </p>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-ink-400">{filtered.length} productos</p>
                <ul className="grid max-h-[28rem] grid-cols-2 gap-2.5 overflow-y-auto pr-1">
                  {filtered.map((p) => (
                    <li key={String(p.id)}>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={async () => {
                          setBusyId(String(p.id));
                          try {
                            await onSelect(p);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="group w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-800 text-left transition hover:border-brand-500 disabled:opacity-50"
                      >
                        <span className="relative block aspect-square bg-ink-900">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain p-2 transition group-hover:scale-105"
                            />
                          ) : null}
                          <span className="absolute top-1.5 left-1.5 rounded bg-ink-950/80 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-200 uppercase">
                            {p.kind === 'digital' ? 'Digital' : p.kind === 'service' ? 'Servicio' : 'Físico'}
                          </span>
                          {busyId === String(p.id) ? (
                            <span className="absolute inset-0 grid place-items-center bg-ink-950/70 text-[11px] text-ink-200">
                              Cargando…
                            </span>
                          ) : null}
                        </span>
                        <span className="block p-2.5">
                          <span className="line-clamp-2 block text-[11px] leading-snug font-medium text-ink-100">
                            {p.name}
                          </span>
                          <span className="mt-1 block font-display text-xs font-bold text-brand-400">
                            {cop(p.price)}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-ink-400">{p.category}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}

        {mode === 'service' ? <ServiceForm catalog={catalog} onManual={onManual} /> : null}
        {mode === 'json' ? <JsonForm onManual={onManual} /> : null}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Servicio manual                                                     */
/* ------------------------------------------------------------------ */

function ServiceForm({
  catalog,
  onManual,
}: {
  catalog: CatalogState;
  onManual: (product: Product, store: StoreInfo, related: RelatedProduct[]) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [features, setFeatures] = useState('');
  const [photoSourceId, setPhotoSourceId] = useState('');

  const source = catalog.products.find((p) => String(p.id) === photoSourceId) ?? null;
  const ready = name.trim().length > 2 && (price ?? 0) > 0 && source !== null;

  return (
    <div className="space-y-3">
      <Notice tone="info">
        Las fotos de un servicio salen de un producto real de la tienda: nunca usamos stock ni
        imágenes generadas.
      </Notice>

      <Field label="Nombre del servicio">
        <TextInput value={name} onChange={setName} placeholder="Ej: Montaje de tienda en línea" />
      </Field>

      <Field label="Descripción">
        <TextArea
          value={description}
          onChange={setDescription}
          rows={4}
          placeholder="Qué resuelve, para quién es y qué entregas…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio desde (COP)">
          <MoneyInput value={price} onChange={setPrice} placeholder="350.000" />
        </Field>
        <Field label="Fotos tomadas de">
          <select
            className="panel-input"
            value={photoSourceId}
            onChange={(e) => setPhotoSourceId(e.target.value)}
          >
            <option value="">Elige un producto</option>
            {catalog.products.slice(0, 80).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Qué incluye (una línea por punto)">
        <TextArea
          value={features}
          onChange={setFeatures}
          rows={4}
          placeholder={'Diagnóstico inicial sin costo\nPropuesta con alcance y tiempos\nSoporte por WhatsApp'}
        />
      </Field>

      <button
        type="button"
        disabled={!ready}
        className="panel-btn-primary w-full"
        onClick={() => {
          if (!source) return;
          const product = makeServiceProduct({
            name: name.trim(),
            description: description.trim(),
            price: price ?? 0,
            images: source.images.length ? source.images : source.image ? [source.image] : [],
            category: 'Servicios',
            features: features
              .split('\n')
              .map((f) => f.trim())
              .filter(Boolean),
          });
          const related = catalog.products
            .filter((p) => String(p.id) !== String(source.id))
            .slice(0, 4)
            .map((p) => ({ id: p.id, name: p.name, price: p.price, image: p.image, category: p.category }));
          onManual(product, catalog.store, related);
        }}
      >
        Crear landing de servicio
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pegar JSON (respaldo si la API falla)                               */
/* ------------------------------------------------------------------ */

function JsonForm({
  onManual,
}: {
  onManual: (product: Product, store: StoreInfo, related: RelatedProduct[]) => void;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <Notice tone="info">
        Modo de respaldo. Abre{' '}
        <code className="rounded bg-ink-900 px-1">
          ventasproia.com/api/public/product/sofia-premium/173
        </code>{' '}
        en el navegador, copia todo el JSON y pégalo aquí.
      </Notice>

      <TextArea
        value={raw}
        onChange={(v) => {
          setRaw(v);
          setError(null);
        }}
        rows={10}
        placeholder='{"store":{…},"product":{…},"related":[…]}'
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <button
        type="button"
        className="panel-btn-primary w-full"
        disabled={!raw.trim() || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const parsed = JSON.parse(raw);
            const res = await fetch(`/api/store/product/${slugify(String(parsed?.product?.id ?? 'manual'))}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error ?? 'No se pudo leer el producto');
            onManual(json.product, json.store, json.related ?? []);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'El JSON no es válido');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Procesando…' : 'Usar este producto'}
      </button>
    </div>
  );
}
