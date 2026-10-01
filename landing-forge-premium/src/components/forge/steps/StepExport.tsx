'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { LandingDocument } from '@/premium/types';
import { buildUtmLink, renderLandingFull } from '@/premium/render';
import { Field, Icon, Notice, Panel, TextInput, Toggle } from '../ui';
import { copyToClipboard, downloadFile, type PanelSettings } from '../storage';

type Flash = { tone: 'ok' | 'danger' | 'warn'; text: string } | null;

export function StepExport({
  doc,
  setDoc,
  panel,
  setPanel,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
  panel: PanelSettings;
  setPanel: (p: PanelSettings) => void;
}) {
  const [flash, setFlash] = useState<Flash>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = (panel.publicBaseUrl || origin).replace(/\/+$/, '');
  const publicUrl = `${base}/l/${doc.slug}`;

  const utmLink = useMemo(
    () => buildUtmLink(publicUrl, doc.settings.utm),
    [publicUrl, doc.settings.utm]
  );

  const exported = useMemo(() => {
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
        preview: false,
        canonicalUrl: publicUrl,
        // HTML para subir a otro servidor: si hay dominio público, sigue
        // usando el relé de pedidos; si no, manda el pedido al webhook.
        standalone: true,
        apiBase: panel.publicBaseUrl.trim().replace(/\/+$/, '') || null,
      });
    } catch (err) {
      return { html: '', meta: { title: '', description: String(err), sections: 0, bytes: 0 } };
    }
  }, [doc, publicUrl, panel.publicBaseUrl]);

  const say = (tone: 'ok' | 'danger' | 'warn', text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 3500);
  };

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    say(ok ? 'ok' : 'danger', ok ? `${label} copiado.` : 'El navegador bloqueó el portapapeles.');
  };

  const setUtm = (patch: Partial<LandingDocument['settings']['utm']>) =>
    setDoc((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, utm: { ...prev.settings.utm, ...patch } } } : prev
    );

  const kb = (exported.meta.bytes / 1024).toFixed(0);

  return (
    <div className="space-y-4">
      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}

      {/* Exportar ------------------------------------------------- */}
      <Panel
        title="7. Exportar"
        description={`HTML autocontenido, sin librerías: ${kb} KB, ${exported.meta.sections} secciones. Las fotos se cargan desde la tienda.`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="panel-btn-primary"
            onClick={() => {
              downloadFile(`${doc.slug}.html`, exported.html);
              say('ok', 'HTML descargado.');
            }}
          >
            <Icon name="download" size={16} /> Descargar HTML
          </button>
          <button
            type="button"
            className="panel-btn-ghost"
            onClick={() => copy(exported.html, 'Código')}
          >
            <Icon name="copy" size={16} /> Copiar código
          </button>
          <button type="button" className="panel-btn-ghost" onClick={() => copy(utmLink, 'Link UTM')}>
            <Icon name="link" size={16} /> Copiar link UTM
          </button>
          <button
            type="button"
            className="panel-btn-ghost"
            onClick={() => {
              const blob = new Blob([exported.html], { type: 'text/html' });
              window.open(URL.createObjectURL(blob), '_blank', 'noopener');
            }}
          >
            <Icon name="external" size={16} /> Abrir en pestaña
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="panel-label">Link para el anuncio</p>
          <p className="font-mono text-[11px] break-all text-mint-400">{utmLink}</p>
        </div>
      </Panel>

      {/* Publicar -------------------------------------------------- */}
      <Panel
        title="Publicar en /l/[slug]"
        description="Guarda la landing en el servidor para abrirla con una URL real."
      >
        <div className="space-y-3">
          <Field label="Dominio público" hint="Déjalo vacío para usar el dominio actual.">
            <TextInput
              value={panel.publicBaseUrl}
              onChange={(v) => setPanel({ ...panel, publicBaseUrl: v })}
              placeholder="https://ventasproia.com"
            />
          </Field>

          <button
            type="button"
            className="panel-btn-primary w-full"
            disabled={publishing}
            onClick={async () => {
              setPublishing(true);
              try {
                const res = await fetch('/api/store/publish', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ doc }),
                });
                const json = await res.json();
                if (!json.ok) throw new Error(json.error ?? 'No se pudo publicar');
                setPublishedUrl(`${base}/l/${json.slug}`);
                say('ok', 'Landing publicada.');
              } catch (err) {
                say('danger', err instanceof Error ? err.message : 'No se pudo publicar');
              } finally {
                setPublishing(false);
              }
            }}
          >
            <Icon name="save" size={16} /> {publishing ? 'Publicando…' : 'Publicar landing'}
          </button>

          {publishedUrl ? (
            <div className="rounded-xl border border-mint-400/35 bg-mint-400/10 p-3">
              <p className="text-[11px] text-ink-200">Publicada en</p>
              <a
                href={`/l/${doc.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] break-all text-mint-400 underline"
              >
                {publishedUrl}
              </a>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* UTM ------------------------------------------------------- */}
      <Panel title="UTM" description="Se guardan en el navegador del visitante y viajan con el pedido.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="utm_source">
            <TextInput value={doc.settings.utm.source} onChange={(v) => setUtm({ source: v })} />
          </Field>
          <Field label="utm_medium">
            <TextInput value={doc.settings.utm.medium} onChange={(v) => setUtm({ medium: v })} />
          </Field>
          <Field label="utm_campaign">
            <TextInput value={doc.settings.utm.campaign} onChange={(v) => setUtm({ campaign: v })} />
          </Field>
          <Field label="utm_content">
            <TextInput value={doc.settings.utm.content ?? ''} onChange={(v) => setUtm({ content: v })} />
          </Field>
        </div>
      </Panel>

      {/* Medición -------------------------------------------------- */}
      <Panel
        title="Medición"
        description="El Pixel se dispara en la landing publicada, nunca en la vista previa."
      >
        <div className="space-y-3">
          <Field label="ID del Pixel de Meta">
            <TextInput
              value={doc.settings.tracking.pixelId ?? ''}
              onChange={(v) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          tracking: { ...prev.settings.tracking, pixelId: v || null },
                        },
                      }
                    : prev
                )
              }
              placeholder="1193902929595904"
            />
          </Field>

          <Field
            label="Token de Conversions API"
            hint="Se usa solo desde el servidor. Lo recomendable es ponerlo en la variable de entorno META_CAPI_TOKEN y dejar este campo vacío."
          >
            <TextInput
              value={panel.capiToken}
              onChange={(v) => setPanel({ ...panel, capiToken: v })}
              type="password"
              placeholder="EAAG…"
            />
          </Field>

          <Field label="Código de evento de prueba (opcional)">
            <TextInput
              value={doc.settings.tracking.testEventCode ?? ''}
              onChange={(v) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          tracking: { ...prev.settings.tracking, testEventCode: v || null },
                        },
                      }
                    : prev
                )
              }
              placeholder="TEST12345"
            />
          </Field>

          <ul className="space-y-1.5 rounded-xl border border-ink-700 bg-ink-900 p-3 text-[11px] text-ink-300">
            {[
              'PageView al abrir la landing',
              'ViewContent con content_ids, value y currency COP',
              'InitiateCheckout al abrir el formulario o tocar el CTA',
              `${doc.settings.tracking.conversionEvent} al enviar el pedido`,
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Icon name="check" size={13} className="mt-0.5 flex-none text-mint-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* Pedidos --------------------------------------------------- */}
      <Panel title="Pedidos" description="A dónde llega cada pedido del formulario contra entrega.">
        <div className="space-y-3">
          <Field label="WhatsApp de la tienda">
            <TextInput
              value={doc.settings.whatsappPhone}
              onChange={(v) =>
                setDoc((prev) =>
                  prev
                    ? { ...prev, settings: { ...prev.settings, whatsappPhone: v.replace(/\D/g, '') } }
                    : prev
                )
              }
              placeholder="573042748687"
            />
          </Field>

          <Field
            label="Webhook de pedidos"
            hint="POST con el JSON del pedido. Pasa por /api/store/order para no exponer la URL en el HTML."
          >
            <TextInput
              value={doc.settings.webhookUrl ?? ''}
              onChange={(v) => {
                setPanel({ ...panel, webhookUrl: v });
                setDoc((prev) =>
                  prev ? { ...prev, settings: { ...prev.settings, webhookUrl: v || null } } : prev
                );
              }}
              placeholder="https://hooks.tu-crm.com/pedidos"
            />
          </Field>

          <Field label="Razón social del pie de página">
            <TextInput
              value={doc.settings.legalName}
              onChange={(v) =>
                setDoc((prev) => (prev ? { ...prev, settings: { ...prev.settings, legalName: v } } : prev))
              }
            />
          </Field>

          {doc.product.kind === 'physical' ? (
            <Toggle
              checked={doc.settings.showCod}
              onChange={(v) =>
                setDoc((prev) => (prev ? { ...prev, settings: { ...prev.settings, showCod: v } } : prev))
              }
              label='Mostrar la franja "pago contra entrega"'
            />
          ) : (
            <Notice tone="info">
              Es un producto {doc.product.kind === 'digital' ? 'digital' : 'de servicio'}: la landing
              nunca menciona pago contra entrega ni formulario de envío.
            </Notice>
          )}
        </div>
      </Panel>

      {/* JSON ------------------------------------------------------ */}
      <Panel
        title="Plantilla en JSON"
        description="Formato { theme, sections: [{ type, props }] } para guardarlo en tu generador."
      >
        <pre className="scrollbar-none max-h-48 overflow-auto rounded-xl border border-ink-700 bg-ink-900 p-3 font-mono text-[10px] leading-relaxed text-ink-300">
          {JSON.stringify({ theme: doc.theme, accent: doc.accent, sections: doc.sections }, null, 2)}
        </pre>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="panel-btn-ghost"
            onClick={() =>
              copy(
                JSON.stringify({ theme: doc.theme, accent: doc.accent, sections: doc.sections }, null, 2),
                'JSON de la plantilla'
              )
            }
          >
            <Icon name="copy" size={15} /> Copiar plantilla
          </button>
          <button
            type="button"
            className="panel-btn-ghost"
            onClick={() => {
              downloadFile(`${doc.slug}.json`, JSON.stringify(doc, null, 2), 'application/json');
              say('ok', 'Documento descargado.');
            }}
          >
            <Icon name="download" size={15} /> Descargar documento
          </button>
        </div>
      </Panel>
    </div>
  );
}
