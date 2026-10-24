/**
 * Galería de diseños de landing, dibujados EN VIVO.
 *
 * Cada tarjeta es la página real que saldría —con el producto elegido y, si
 * hay una landing abierta, con SUS textos— armada por el mismo renderer que
 * la publicada (`POST /api/landing-pages/preview`). No es una captura de
 * muestra con otro producto: es lo que vas a obtener.
 *
 * Las vistas se piden recién cuando la tarjeta entra en pantalla: 22 páginas
 * completas a la vez frenarían al navegador y al servidor.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Maximize2, Monitor, Smartphone, X } from "lucide-react";

export interface Diseno {
  id: string;
  nombre: string;
  desc: string;
  grupo: string;
  color: string;
  design: Record<string, unknown>;
}

export const DISENOS: Diseno[] = [
  { id: "estilo:cleanhome", nombre: "CleanHome COD", desc: "Página de producto con formulario arriba a la derecha.", grupo: "Páginas de producto que venden", color: "#08783A", design: { renderer: "estilo", style: "cleanhome" } },
  { id: "estilo:urgencia", nombre: "Urgencia", desc: "Cuenta regresiva, stock y combos 2x / 3x.", grupo: "Páginas de producto que venden", color: "#E5342A", design: { renderer: "estilo", style: "urgencia" } },
  { id: "estilo:clinico", nombre: "Clínico", desc: "Azul marino, pasos y paquetes. Salud y ortopedia.", grupo: "Páginas de producto que venden", color: "#1E5BD7", design: { renderer: "estilo", style: "clinico" } },
  { id: "estilo:pro", nombre: "Pro", desc: "Precio alto, mucha confianza y detalle.", grupo: "Páginas de producto que venden", color: "#0E9F8A", design: { renderer: "estilo", style: "pro" } },
  ...([
    ["dropshipping", "Dropshipping directo", "#4F46E5", "Directa al pedido, para tráfico frío."],
    ["respuesta-directa", "Respuesta directa", "#E5342A", "Titular grande y llamados fuertes."],
    ["ecommerce", "Ecommerce", "#1B6EF3", "Tienda limpia, foto y compra."],
    ["premium", "Premium", "#8C7A5B", "Lujo sobrio, mucho aire."],
    ["minimal", "Minimal", "#111111", "Blanco y negro, sin ruido."],
    ["editorial", "Editorial", "#1F4E42", "Como una revista: cuenta una historia."],
    ["belleza", "Belleza", "#C08573", "Suave y cálida."],
    ["fitness", "Fitness", "#C8FF3D", "Energía y contraste."],
    ["suplemento", "Salud y suplementos", "#16A34A", "Confianza y claridad."],
    ["clinica", "Clínica", "#1D4ED8", "Profesional, de consultorio."],
    ["creator", "Creator · digital", "#7047EB", "Cursos, ebooks y productos descargables."],
    ["servicios-pro", "Servicios Pro", "#087F68", "Consultorías, servicios y reservas."],
    ["tecnologia", "Tecnología", "#5B4BE8", "Moderna, de producto tech."],
    ["electronica", "Electrónica", "#22D3EE", "Oscura con brillo."],
    ["oscura", "Oscura", "#00D3A7", "Fondo oscuro, acento neón."],
    ["launch", "Launch", "#F59E4B", "Lanzamiento de producto."],
    ["educacion", "Educación", "#2A5BD7", "Cursos y programas."],
    ["familiar", "Familiar", "#E8792B", "Cercana, para el hogar."],
    ["creativa", "Creativa", "#3B1FD9", "Atrevida y diferente."],
    ["gourmet", "Gourmet", "#7C3F1D", "Comida y bebida."],
  ] as const).map(([id, nombre, color, desc]) => ({ id, nombre, desc, color, grupo: "Familias visuales", design: { familia: id } })),
];

const ANCHO_PAGINA = { escritorio: 1280, movil: 390 } as const;

function Vista({ productId, secciones, diseno, retoque, alto, ancho, modo }: { productId: number; secciones: unknown[]; diseno: Diseno; retoque?: unknown; alto: number; ancho: number; modo: keyof typeof ANCHO_PAGINA }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setHtml(null); setError(false);
    fetch("/api/landing-pages/preview", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, sections: secciones, design: { ...diseno.design, retoque }, name: diseno.nombre }),
    })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => { if (vivo) setHtml(t); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [visible, productId, JSON.stringify(secciones), diseno.id, JSON.stringify(retoque)]); // eslint-disable-line react-hooks/exhaustive-deps

  const anchoPagina = ANCHO_PAGINA[modo];
  const escala = ancho / anchoPagina;
  return (
    <div ref={ref} className="relative overflow-hidden bg-white" style={{ width: ancho, height: alto }}>
      {html ? (
        <iframe title={diseno.nombre} srcDoc={html} sandbox="allow-same-origin" loading="lazy" tabIndex={-1}
          style={{ width: anchoPagina, height: alto / escala, transform: `scale(${escala})`, transformOrigin: "top left", border: 0, pointerEvents: "none", maxWidth: "none" }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          {error ? "No se pudo dibujar" : <Loader2 className="h-5 w-5 animate-spin text-violet-500" />}
        </div>
      )}
    </div>
  );
}

export function GaleriaDisenos({ productId, secciones, retoque, actual, landingAbierta, onUsar }: {
  productId: number | null;
  secciones: unknown[];
  retoque?: unknown;
  /** id del diseño que tiene la landing abierta. */
  actual?: string | null;
  landingAbierta: boolean;
  onUsar: (d: Diseno) => void;
}) {
  const [grande, setGrande] = useState<Diseno | null>(null);
  const [modoGrande, setModoGrande] = useState<keyof typeof ANCHO_PAGINA>("escritorio");
  const [filtro, setFiltro] = useState<string>("Todos");
  const grupos = ["Todos", ...new Set(DISENOS.map((d) => d.grupo))];

  if (!productId) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Elegí un producto arriba: los diseños se dibujan con su foto, su precio y sus condiciones reales.</div>;
  }
  const lista = DISENOS.filter((d) => filtro === "Todos" || d.grupo === filtro);

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Diseños de página</h2>
          <p className="text-sm text-muted-foreground">{landingAbierta ? "Con los textos de tu landing abierta. Elegí uno y se aplica sin perder el contenido." : "Con los datos reales del producto. Elegí uno para crear la landing."}</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border p-0.5 whitespace-nowrap">
          {grupos.map((g) => (
            <button key={g} onClick={() => setFiltro(g)} aria-pressed={filtro === g} className={`h-8 px-3 rounded-md text-xs font-semibold ${filtro === g ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>{g}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {lista.map((d) => {
          const es = actual === d.id;
          return (
            <div key={d.id} className={`group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-lg transition ${es ? "ring-2 ring-violet-600" : ""}`}>
              <div className="relative">
                <Vista productId={productId} secciones={secciones} diseno={d} retoque={retoque} ancho={230} alto={290} modo="escritorio" />
                <div className="absolute inset-0 hidden sm:flex bg-black/0 group-hover:bg-black/35 transition items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setGrande(d)}><Maximize2 className="h-3.5 w-3.5 mr-1" />Ver</Button>
                  <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onUsar(d)}>{landingAbierta ? "Aplicar" : "Crear"}</Button>
                </div>
                {es && <span className="absolute top-2 left-2 text-[10px] font-bold bg-violet-600 text-white rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Check className="h-3 w-3" />En uso</span>}
              </div>
              <div className="flex sm:hidden gap-2 px-3 pb-2">
                <Button size="sm" variant="outline" className="h-10 flex-1 text-xs" onClick={() => setGrande(d)}><Maximize2 className="h-3.5 w-3.5 mr-1" />Ver</Button>
                <Button size="sm" className="h-10 flex-1 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onUsar(d)}>{landingAbierta ? "Aplicar diseño" : "Crear landing"}</Button>
              </div>
              <div className="p-3 flex items-start gap-2">
                <span className="mt-1 h-3 w-3 rounded-full shrink-0 ring-1 ring-black/10" style={{ background: d.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{d.nombre}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{d.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {grande && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" onClick={() => setGrande(null)}>
          <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 min-h-14 bg-background border-b" onClick={(e) => e.stopPropagation()}>
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: grande.color }} />
            <p className="font-semibold text-sm flex-1 min-w-0 truncate">{grande.nombre}</p>
            <div className="flex rounded-md border p-0.5">
              {([["escritorio", Monitor], ["movil", Smartphone]] as const).map(([m, I]) => (
                <button key={m} onClick={() => setModoGrande(m)} aria-pressed={modoGrande === m} aria-label={m} className={`h-7 w-8 grid place-items-center rounded ${modoGrande === m ? "bg-muted" : ""}`}><I className="h-3.5 w-3.5" /></button>
              ))}
            </div>
            <div className="w-full sm:w-auto sm:ml-auto flex gap-2">
              <Button size="sm" className="h-10 sm:h-9 flex-1 sm:flex-none bg-violet-600 hover:bg-violet-700 text-white" onClick={() => { onUsar(grande); setGrande(null); }}>{landingAbierta ? "Aplicar a mi landing" : "Crear landing con este diseño"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setGrande(null)} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-xl overflow-hidden shadow-2xl bg-white" style={{ width: modoGrande === "movil" ? 390 : "min(1280px, 100%)" }}>
              <GrandeVivo productId={productId} secciones={secciones} diseno={grande} retoque={retoque} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GrandeVivo({ productId, secciones, diseno, retoque }: { productId: number; secciones: unknown[]; diseno: Diseno; retoque?: unknown }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/landing-pages/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, sections: secciones, design: { ...diseno.design, retoque }, name: diseno.nombre }) })
      .then((r) => r.text()).then(setHtml).catch(() => setHtml("<p style='padding:40px;font-family:system-ui'>No se pudo dibujar.</p>"));
  }, [productId, diseno.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!html) return <div className="h-[70vh] grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>;
  return <iframe title={diseno.nombre} srcDoc={html} sandbox="allow-same-origin allow-scripts" className="w-full h-[calc(100vh-7rem)] border-0 block" />;
}
