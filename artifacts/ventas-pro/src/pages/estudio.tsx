/**
 * VentasPro Studio: la suite de diseño.
 *
 * Junta en una sola herramienta lo que antes estaba suelto —el editor de
 * landings, la galería de diseños y el estudio de creativos— con Atlas
 * acoplado al costado como director creativo: ve lo que está abierto, usa
 * sus herramientas reales (landing_editar, landing_tema, creativo_crear…) y,
 * cuando termina, el espacio de trabajo se recarga solo.
 *
 * Los tres espacios quedan montados (se esconden, no se desmontan) para que
 * cambiar de pestaña no pierda lo que se estaba editando.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, LayoutTemplate, Image as ImageIcon, Palette, Sparkles, PanelRightClose, PanelRightOpen } from "lucide-react";
import LandingStudioV2, { type ContextoLanding } from "@/pages/landing-studio-v2";
import CreativosPage from "@/pages/creativos";
import { GaleriaDisenos, DISENOS } from "@/components/estudio/galeria-disenos";
import { AtlasDock, type ContextoEstudio } from "@/components/estudio/atlas-dock";

type Espacio = "landings" | "disenos" | "creativos";

const ESPACIOS: { id: Espacio; nombre: string; icono: any; ayuda: string }[] = [
  { id: "landings", nombre: "Landings", icono: LayoutTemplate, ayuda: "Editá tu página: bloques, textos, tema" },
  { id: "disenos", nombre: "Diseños", icono: Palette, ayuda: `${DISENOS.length} diseños en vivo con tu producto` },
  { id: "creativos", nombre: "Creativos", icono: ImageIcon, ayuda: "Imágenes para tus anuncios" },
];

export default function EstudioPage() {
  const [espacio, setEspacio] = useState<Espacio>(() => {
    const q = new URLSearchParams(window.location.search).get("espacio");
    return q === "creativos" || q === "disenos" ? q : "landings";
  });
  const [producto, setProducto] = useState<number | "">("");
  const [ctxLanding, setCtxLanding] = useState<ContextoLanding | null>(null);
  const [ctxCreativo, setCtxCreativo] = useState<{ productId: number | null; productoNombre: string | null; creativo: { id: string | null; nombre: string } | null } | null>(null);
  const [atlasAbierto, setAtlasAbierto] = useState(() => window.innerWidth >= 1280);
  const [pedidoDiseno, setPedidoDiseno] = useState<{ plantilla: string; n: number } | null>(null);
  const [productos, setProductos] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/products", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((p) => setProductos(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  // La URL recuerda el espacio: recargar no te saca de donde estabas.
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("espacio", espacio);
    window.history.replaceState(null, "", u.toString());
  }, [espacio]);

  const contexto: ContextoEstudio = {
    espacio,
    producto: typeof producto === "number" ? { id: producto, nombre: productos.find((p) => p.id === producto)?.name || ctxLanding?.productoNombre || ctxCreativo?.productoNombre || `Producto ${producto}` } : null,
    landing: espacio !== "creativos" && ctxLanding?.landing ? ctxLanding.landing : null,
    creativo: espacio === "creativos" ? ctxCreativo?.creativo ?? null : null,
  };

  const alTerminarAtlas = useCallback(() => { window.dispatchEvent(new Event("estudio:refrescar")); }, []);

  const plantillaActual = ctxLanding?.plantilla || "";
  const disenoActual = DISENOS.find((d) => d.id === plantillaActual)?.id ?? null;

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Barra superior */}
      <header className="h-14 shrink-0 border-b flex items-center gap-2 px-2 sm:px-3 bg-background/95 backdrop-blur">
        <Link href="/" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground" title="Volver al panel" aria-label="Volver al panel"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex items-center gap-2 pr-2 sm:pr-3 sm:border-r">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-sm"><Sparkles className="h-4 w-4 text-white" /></div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-bold tracking-tight">Studio</p>
            <p className="text-[10px] text-muted-foreground">Landings · Diseños · Creativos</p>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Espacios del estudio">
          {ESPACIOS.map((e) => (
            <button key={e.id} onClick={() => setEspacio(e.id)} aria-pressed={espacio === e.id} title={e.ayuda}
              className={`h-9 px-2.5 sm:px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition ${espacio === e.id ? "bg-violet-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <e.icono className="h-4 w-4" /><span className={`${espacio === e.id ? "inline" : "hidden sm:inline"} text-[11px] sm:text-sm`}>{e.nombre}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAtlasAbierto((v) => !v)} aria-pressed={atlasAbierto}
            className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 border transition ${atlasAbierto ? "border-violet-500 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40" : "hover:bg-muted"}`}>
            {atlasAbierto ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}<span className="hidden sm:inline">Atlas</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className={espacio === "landings" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <LandingStudioV2 incrustado producto={producto} onProducto={setProducto} onContexto={setCtxLanding} pedidoDiseno={pedidoDiseno} />
          </div>
          <div className={espacio === "disenos" ? "flex-1 min-h-0 overflow-y-auto" : "hidden"}>
            {!producto && productos.length > 0 && (
              <div className="px-6 pt-6">
                <select value="" onChange={(e) => setProducto(e.target.value ? Number(e.target.value) : "")} className="h-10 rounded-lg border bg-background px-3 text-sm" aria-label="Producto">
                  <option value="">Elegí un producto para ver los diseños…</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {espacio === "disenos" && (
              <GaleriaDisenos
                productId={typeof producto === "number" ? producto : null}
                secciones={ctxLanding?.landing ? ctxLanding.secciones : []}
                retoque={ctxLanding?.landing ? ctxLanding.retoque : undefined}
                actual={ctxLanding?.landing ? disenoActual : null}
                landingAbierta={!!ctxLanding?.landing}
                onUsar={(d) => { setPedidoDiseno({ plantilla: d.id, n: Date.now() }); setEspacio("landings"); }}
              />
            )}
          </div>
          <div className={espacio === "creativos" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <CreativosPage incrustado producto={producto} onProducto={setProducto} onContexto={setCtxCreativo} />
          </div>
        </main>

        {/* Atlas: acoplado en pantallas grandes, encima en las chicas. */}
        {atlasAbierto && (
          <aside className="fixed inset-0 z-40 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:w-[380px] xl:w-[420px] lg:border-l flex flex-col min-h-0 bg-background">
            <AtlasDock contexto={contexto} onTurnoTerminado={alTerminarAtlas} onCerrar={() => setAtlasAbierto(false)} />
          </aside>
        )}
      </div>

      {!atlasAbierto && (
        <button onClick={() => setAtlasAbierto(true)} className="lg:hidden fixed bottom-24 right-4 z-30 h-12 w-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl grid place-items-center" aria-label="Abrir Atlas">
          <Sparkles className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
