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
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, LayoutTemplate, Image as ImageIcon, Palette, Sparkles, PanelRightClose, PanelRightOpen, Gem } from "lucide-react";
import { KitMarca } from "@/components/estudio/kit-marca";
import LandingStudioV2, { type ContextoLanding } from "@/pages/landing-studio-v2";
import CreativosPage from "@/pages/creativos";
import { GaleriaDisenos, DISENOS } from "@/components/estudio/galeria-disenos";
import { EjemplosIA } from "@/components/estudio/ejemplos-ia";
import { AtlasDock, type ContextoEstudio } from "@/components/estudio/atlas-dock";

type Espacio = "landings" | "disenos" | "creativos" | "marca";

const ESPACIOS: { id: Espacio; nombre: string; icono: any; ayuda: string }[] = [
  { id: "landings", nombre: "Landings", icono: LayoutTemplate, ayuda: "Editá tu página: bloques, textos, tema" },
  { id: "disenos", nombre: "Diseños", icono: Palette, ayuda: "22 diseños en vivo con tu producto" },
  { id: "creativos", nombre: "Creativos", icono: ImageIcon, ayuda: "Imágenes para tus anuncios" },
  { id: "marca", nombre: "Marca", icono: Gem, ayuda: "Tus colores, letras y logo: todo sale con tu identidad" },
];

export default function EstudioPage() {
  const [espacio, setEspacio] = useState<Espacio>(() => {
    const q = new URLSearchParams(window.location.search).get("espacio");
    return q === "creativos" || q === "disenos" || q === "marca" ? q : "landings";
  });
  const [producto, setProducto] = useState<number | "">(() => {
    const p = Number(new URLSearchParams(window.location.search).get("producto"));
    return Number.isInteger(p) && p > 0 ? p : "";
  });
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

  const contextoRef = useRef<ContextoEstudio | null>(null);
  const alTerminarAtlas = useCallback(() => { window.dispatchEvent(new Event("estudio:refrescar")); }, []);
  // Cada espacio registra cómo guardar lo suyo; antes de un pedido a Atlas se guarda todo.
  const guardadores = useRef<Record<string, () => Promise<void>>>({});
  const registrarGuardado = useCallback((espacio: string, fn: (() => Promise<void>) | null) => { if (fn) guardadores.current[espacio] = fn; else delete guardadores.current[espacio]; }, []);
  const guardarTodo = useCallback(async () => { for (const fn of Object.values(guardadores.current)) await fn().catch(() => {}); }, []);

  contextoRef.current = contexto;
  const plantillaActual = ctxLanding?.plantilla || "";
  const disenoActual = DISENOS.find((d) => d.id === plantillaActual)?.id ?? null;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-muted/30 text-foreground dark:bg-background">
      {/* Barra superior */}
      <header className="shrink-0 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
        <Link href="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2" title="Volver al panel" aria-label="Volver al panel"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex items-center gap-2 pr-2 sm:pr-3 sm:border-r">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-sm"><Sparkles className="h-4 w-4 text-white" /></div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-bold tracking-tight">Studio</p>
            <p className="text-[10px] text-muted-foreground">Landings · Diseños · Creativos</p>
          </div>
        </div>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1 [scrollbar-width:none]" aria-label="Espacios del estudio">
          {ESPACIOS.map((e) => (
            <button key={e.id} onClick={() => setEspacio(e.id)} aria-pressed={espacio === e.id} title={e.ayuda}
              className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${espacio === e.id ? "bg-background text-foreground shadow-sm dark:bg-violet-600 dark:text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
              <e.icono className="h-4 w-4" /><span className="hidden sm:inline">{e.nombre}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAtlasAbierto((v) => !v)} aria-pressed={atlasAbierto}
            className={`h-10 px-3 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${atlasAbierto ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200" : "bg-background hover:bg-muted"}`}>
            {atlasAbierto ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}<span className="hidden sm:inline">Atlas</span>
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-background">
          <div className={espacio === "landings" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <LandingStudioV2 incrustado producto={producto} onProducto={setProducto} onContexto={setCtxLanding} pedidoDiseno={pedidoDiseno} registrarGuardado={registrarGuardado} />
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
            {espacio === "disenos" && <EjemplosIA />}
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
            <CreativosPage incrustado producto={producto} onProducto={setProducto} onContexto={setCtxCreativo} onIrAMarca={() => setEspacio("marca")} registrarGuardado={registrarGuardado} />
          </div>
          <div className={espacio === "marca" ? "flex-1 min-h-0 overflow-y-auto" : "hidden"}>
            {!producto && productos.length > 0 && (
              <div className="px-6 pt-6">
                <select value="" onChange={(e) => setProducto(e.target.value ? Number(e.target.value) : "")} className="h-10 rounded-lg border bg-background px-3 text-sm" aria-label="Producto">
                  <option value="">Elegí un producto para ver la vista previa…</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {espacio === "marca" && <KitMarca productId={typeof producto === "number" ? producto : null} />}
          </div>
        </main>

        {/* Atlas: acoplado en pantallas grandes, encima en las chicas. */}
        {atlasAbierto && (
          <aside className="fixed inset-0 z-40 flex min-h-0 flex-col bg-background shadow-2xl lg:static lg:z-auto lg:w-[380px] lg:border-l lg:shadow-none xl:w-[420px]">
            <AtlasDock contexto={contexto} onTurnoTerminado={alTerminarAtlas} onCerrar={() => setAtlasAbierto(false)} antesDeEnviar={guardarTodo} leerContexto={() => contextoRef.current || contexto} />
          </aside>
        )}
      </div>

      {!atlasAbierto && (
        <button onClick={() => setAtlasAbierto(true)} className="lg:hidden fixed bottom-24 right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2" aria-label="Abrir Atlas">
          <Sparkles className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
