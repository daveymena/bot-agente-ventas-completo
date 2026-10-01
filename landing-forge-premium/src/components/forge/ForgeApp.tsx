'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LandingDocument,
  Product,
  RelatedProduct,
  StoreInfo,
} from '@/premium/types';
import { renderLandingFull } from '@/premium/render';
import { createLandingDocument } from '@/premium/defaults';
import { SEED_STORE } from '@/premium/data/seed';
import { normalizeStore } from '@/premium/store';
import { Icon, Notice } from './ui';
import {
  DEFAULT_PANEL_SETTINGS,
  loadDrafts,
  loadPanelSettings,
  saveDraft,
  savePanelSettings,
  type PanelSettings,
} from './storage';
import { StepProduct } from './steps/StepProduct';
import { StepTemplate } from './steps/StepTemplate';
import { StepAudience } from './steps/StepAudience';
import { StepOffer } from './steps/StepOffer';
import { StepCopy } from './steps/StepCopy';
import { StepSections } from './steps/StepSections';
import { StepExport } from './steps/StepExport';
import { Preview } from './Preview';
import { DraftsMenu } from './DraftsMenu';

const STEPS = [
  { id: 'producto', label: 'Producto', icon: 'search' },
  { id: 'plantilla', label: 'Plantilla y tema', icon: 'sparkles' },
  { id: 'publico', label: 'Público y ángulo', icon: 'star' },
  { id: 'oferta', label: 'Oferta', icon: 'save' },
  { id: 'copy', label: 'Textos', icon: 'copy' },
  { id: 'secciones', label: 'Secciones', icon: 'drag' },
  { id: 'exportar', label: 'Exportar', icon: 'download' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export interface CatalogState {
  store: StoreInfo;
  products: Product[];
  source: 'live' | 'cache' | 'seed' | null;
  warning: string | null;
  loading: boolean;
  error: string | null;
}

export function ForgeApp() {
  const [step, setStep] = useState<StepId>('producto');
  const [doc, setDoc] = useState<LandingDocument | null>(null);
  const [drafts, setDrafts] = useState<LandingDocument[]>([]);
  const [panel, setPanel] = useState<PanelSettings>(DEFAULT_PANEL_SETTINGS);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogState>({
    store: normalizeStore(SEED_STORE),
    products: [],
    source: null,
    warning: null,
    loading: true,
    error: null,
  });

  /* --- Carga inicial -------------------------------------------- */
  useEffect(() => {
    setDrafts(loadDrafts());
    setPanel(loadPanelSettings());
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalog((c) => ({ ...c, loading: true, error: null }));
    try {
      const res = await fetch('/api/store/products');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'No se pudo cargar el catálogo');
      setCatalog({
        store: json.store,
        products: json.products ?? [],
        source: json.source,
        warning: json.warning ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setCatalog((c) => ({
        ...c,
        loading: false,
        error: err instanceof Error ? err.message : 'Error desconocido',
      }));
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  /* --- Edición en línea desde la vista previa -------------------- */
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { source?: string; type?: string; field?: string; value?: string };
      if (!data || data.source !== 'landing-forge') return;
      if (data.type === 'copy-edit' && data.field) {
        const field = data.field;
        const value = data.value ?? '';
        setDoc((prev) => {
          if (!prev) return prev;
          const current = (prev.settings.copy as unknown as Record<string, unknown>)[field];
          if (typeof current !== 'string' || current === value) return prev;
          return {
            ...prev,
            settings: {
              ...prev.settings,
              copy: { ...prev.settings.copy, [field]: value },
            },
            updatedAt: new Date().toISOString(),
          };
        });
      }
      if (data.type === 'copy-focus' && data.field) {
        setFocusField(data.field);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* --- Selección de producto ------------------------------------ */
  const selectProduct = useCallback(
    async (product: Product) => {
      let related: RelatedProduct[] = [];
      let store = catalog.store;
      let full = product;

      try {
        const res = await fetch(`/api/store/product/${product.id}`);
        const json = await res.json();
        if (json.ok) {
          full = json.product as Product;
          related = (json.related ?? []) as RelatedProduct[];
          store = json.store as StoreInfo;
        }
      } catch {
        // Nos quedamos con los datos del catálogo.
      }

      const next = createLandingDocument({ product: full, store, related });
      if (panel.webhookUrl) next.settings.webhookUrl = panel.webhookUrl;
      setDoc(next);
      setStep('plantilla');
      setMobileTab('editor');
    },
    [catalog.store, panel.webhookUrl]
  );

  const useManualProduct = useCallback(
    (product: Product, store: StoreInfo, related: RelatedProduct[]) => {
      const next = createLandingDocument({ product, store, related });
      if (panel.webhookUrl) next.settings.webhookUrl = panel.webhookUrl;
      setDoc(next);
      setStep('plantilla');
    },
    [panel.webhookUrl]
  );

  /* --- Guardado -------------------------------------------------- */
  const persist = useCallback((d: LandingDocument) => {
    setDrafts(saveDraft(d));
    setSavedAt(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
  }, []);

  // Autoguardado suave: 1,5 s después del último cambio.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => persist(doc), 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [doc, persist]);

  const updatePanel = useCallback((next: PanelSettings) => {
    setPanel(next);
    savePanelSettings(next);
  }, []);

  /* --- HTML de la vista previa ----------------------------------- */
  const preview = useMemo(() => {
    if (!doc) return null;
    try {
      return renderLandingFull(doc.product, doc.store, {
        slug: doc.slug,
        title: doc.title,
        template: doc.template,
        theme: doc.theme,
        accent: doc.accent,
        related: doc.related,
        settings: doc.settings,
        sections: doc.sections,
        preview: true,
      });
    } catch (err) {
      return {
        html: `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;color:#b00">
          <h1>Error al renderizar</h1><pre>${String(err)}</pre></body>`,
        meta: { title: '', description: '', sections: 0, bytes: 0 },
      };
    }
  }, [doc]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canNavigate = Boolean(doc);

  return (
    <div className="flex min-h-dvh flex-col bg-ink-900">
      {/* Barra superior ------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-mint-400 font-display text-sm font-bold text-ink-950">
              LF
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">Landing Forge Premium</p>
              <p className="truncate text-[11px] text-ink-400">
                {doc ? doc.product.name : 'VentasProIA · sofia-premium'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {savedAt ? (
              <span className="hidden items-center gap-1.5 text-[11px] text-ink-400 sm:flex">
                <Icon name="check" size={13} /> Guardado {savedAt}
              </span>
            ) : null}
            <DraftsMenu
              drafts={drafts}
              onOpen={(d) => {
                setDoc(d);
                setStep('plantilla');
              }}
              onChange={setDrafts}
              currentId={doc?.id ?? null}
            />
            {doc ? (
              <button type="button" className="panel-btn-ghost" onClick={() => persist(doc)}>
                <Icon name="save" size={15} />
                <span className="hidden sm:inline">Guardar</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Pasos */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const disabled = !canNavigate && s.id !== 'producto';
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => setStep(s.id)}
                className={`flex flex-none items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-brand-500 text-white'
                    : disabled
                      ? 'text-ink-500'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded text-[10px] font-bold ${
                    active ? 'bg-white/25' : 'bg-ink-700'
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Tabs móviles --------------------------------------------- */}
      {doc ? (
        <div className="flex gap-1 border-b border-ink-700 bg-ink-850 p-1.5 lg:hidden">
          {(['editor', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                mobileTab === t ? 'bg-ink-700 text-ink-100' : 'text-ink-400'
              }`}
            >
              {t === 'editor' ? 'Editor' : 'Vista previa'}
            </button>
          ))}
        </div>
      ) : null}

      {/* Cuerpo ---------------------------------------------------- */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <main
          className={`w-full border-ink-700 lg:w-[460px] lg:flex-none lg:overflow-y-auto lg:border-r xl:w-[520px] ${
            doc && mobileTab === 'preview' ? 'hidden lg:block' : ''
          }`}
          style={{ maxHeight: 'calc(100dvh - 104px)' }}
        >
          <div className="space-y-4 p-4">
            {catalog.warning && step === 'producto' ? (
              <Notice tone="warn">
                {catalog.warning} Puedes seguir trabajando: el panel usa los productos de prueba
                reales del catálogo.
              </Notice>
            ) : null}

            {step === 'producto' ? (
              <StepProduct
                catalog={catalog}
                onReload={loadCatalog}
                onSelect={selectProduct}
                onManual={useManualProduct}
              />
            ) : null}

            {doc && step === 'plantilla' ? <StepTemplate doc={doc} setDoc={setDoc} /> : null}
            {doc && step === 'publico' ? <StepAudience doc={doc} setDoc={setDoc} /> : null}
            {doc && step === 'oferta' ? <StepOffer doc={doc} setDoc={setDoc} /> : null}
            {doc && step === 'copy' ? (
              <StepCopy
                doc={doc}
                setDoc={setDoc}
                panel={panel}
                setPanel={updatePanel}
                focusField={focusField}
                onFocusHandled={() => setFocusField(null)}
              />
            ) : null}
            {doc && step === 'secciones' ? <StepSections doc={doc} setDoc={setDoc} /> : null}
            {doc && step === 'exportar' ? (
              <StepExport doc={doc} setDoc={setDoc} panel={panel} setPanel={updatePanel} />
            ) : null}

            {/* Navegación entre pasos */}
            {doc ? (
              <div className="flex items-center justify-between gap-3 pt-2 pb-8">
                <button
                  type="button"
                  className="panel-btn-subtle"
                  disabled={stepIndex <= 0}
                  onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
                >
                  <Icon name="arrowLeft" size={15} /> Atrás
                </button>
                <button
                  type="button"
                  className="panel-btn-primary"
                  disabled={stepIndex >= STEPS.length - 1}
                  onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)}
                >
                  Siguiente <Icon name="arrowRight" size={15} />
                </button>
              </div>
            ) : null}
          </div>
        </main>

        {/* Vista previa ------------------------------------------- */}
        <aside
          className={`flex-1 bg-ink-950 ${doc && mobileTab === 'editor' ? 'hidden lg:block' : ''} ${
            !doc ? 'hidden lg:block' : ''
          }`}
        >
          <Preview
            html={preview?.html ?? null}
            device={device}
            setDevice={setDevice}
            bytes={preview?.meta.bytes ?? 0}
            sections={preview?.meta.sections ?? 0}
            themeName={doc?.theme ?? null}
          />
        </aside>
      </div>
    </div>
  );
}
