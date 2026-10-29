/**
 * Ejemplos de diseño publicitario y de landing generados con IA.
 *
 * Son referencias de estilo, no productos reales ni promesas de resultado.
 * Cada pieza va marcada como ejemplo para que nadie la confunda con una
 * oferta de su catálogo. Al tocar una tarjeta se abre en grande, con
 * teclado (flechas, Esc) y con el foco contenido en el diálogo.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = "/estudio/ejemplos";

export const EJEMPLOS_IA: Array<{ archivo: string; titulo: string; formato: string; uso: string; ancho: number; alto: number }> = [
  { archivo: "creativo-audifonos-1080", titulo: "Audífonos · cuadrado", formato: "1080 × 1080", uso: "Anuncio en feed", ancho: 1080, alto: 1080 },
  { archivo: "creativo-camara-1080", titulo: "Cámara WiFi · cuadrado", formato: "1080 × 1080", uso: "Anuncio en feed", ancho: 1080, alto: 1080 },
  { archivo: "creativo-corrector-postura-1080x1920", titulo: "Corrector de postura · vertical", formato: "1080 × 1920", uso: "Historias y reels", ancho: 1080, alto: 1920 },
  { archivo: "creativo-curso-digital-1080", titulo: "Curso digital · cuadrado", formato: "1080 × 1080", uso: "Anuncio en feed", ancho: 1080, alto: 1080 },
  { archivo: "landing-hero-audifonos-1440x900", titulo: "Audífonos · hero de landing", formato: "1440 × 900", uso: "Primera pantalla de landing", ancho: 1440, alto: 900 },
  { archivo: "landing-hero-camara-1440x900", titulo: "Cámara WiFi · hero de landing", formato: "1440 × 900", uso: "Primera pantalla de landing", ancho: 1440, alto: 900 },
];

function Tarjeta({ ejemplo, onAbrir }: { ejemplo: (typeof EJEMPLOS_IA)[number]; onAbrir: () => void }) {
  const [cargada, setCargada] = useState(false);
  const [fallo, setFallo] = useState(false);
  return (
    <figure className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:hover:border-violet-800">
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver en grande: ${ejemplo.titulo}`}
        className="relative flex min-h-44 items-center justify-center bg-muted/70 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
      >
        {!cargada && !fallo && <Skeleton className="absolute inset-2 rounded-lg" />}
        {fallo ? (
          <span className="text-xs text-muted-foreground">No se pudo cargar el ejemplo</span>
        ) : (
          <img
            src={`${BASE}/${ejemplo.archivo}.webp`}
            alt={`Ejemplo: ${ejemplo.titulo}`}
            loading="lazy"
            onLoad={() => setCargada(true)}
            onError={() => setFallo(true)}
            className={`max-h-56 w-auto object-contain rounded transition-opacity duration-300 group-hover:scale-[1.01] ${cargada ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </button>
      <figcaption className="space-y-1 p-3">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-violet-600">Ejemplo IA</span>
        <p className="text-xs font-medium leading-snug">{ejemplo.titulo}</p>
        <p className="text-[11px] text-muted-foreground">{ejemplo.formato} · {ejemplo.uso}</p>
      </figcaption>
    </figure>
  );
}

export function EjemplosIA() {
  const [indiceAbierto, setIndiceAbierto] = useState<number | null>(null);
  const abierto = indiceAbierto !== null ? EJEMPLOS_IA[indiceAbierto] : null;
  const total = EJEMPLOS_IA.length;

  const mover = (paso: number) => {
    if (indiceAbierto === null) return;
    setIndiceAbierto((indiceAbierto + paso + total) % total);
  };

  return (
    <section aria-labelledby="ejemplos-ia-titulo" className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-5 sm:px-6 sm:py-7">
      <div>
        <h2 id="ejemplos-ia-titulo" className="text-base font-semibold">Ejemplos de diseño con IA</h2>
        <p className="text-xs text-muted-foreground">
          Referencias de estilo para tus anuncios y landings. Son ejemplos, no productos de tu catálogo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {EJEMPLOS_IA.map((e, i) => (
          <Tarjeta key={e.archivo} ejemplo={e} onAbrir={() => setIndiceAbierto(i)} />
        ))}
      </div>

      <Dialog open={abierto !== null} onOpenChange={(v) => { if (!v) setIndiceAbierto(null); }}>
        <DialogContent
          className="max-w-[min(96vw,1100px)] p-3 sm:p-4 bg-background"
          onKeyDown={(ev) => {
            if (ev.key === "ArrowRight") mover(1);
            if (ev.key === "ArrowLeft") mover(-1);
          }}
        >
          {abierto && (
            <>
              <DialogTitle className="text-sm font-semibold">{abierto.titulo}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Ejemplo generado con IA · {abierto.formato} · {abierto.uso}
              </DialogDescription>
              <div className="relative flex items-center justify-center bg-muted rounded-lg p-2 max-h-[75vh]">
                <img
                  key={abierto.archivo}
                  src={`${BASE}/${abierto.archivo}.webp`}
                  alt={`Ejemplo: ${abierto.titulo}`}
                  className="max-h-[72vh] w-auto object-contain rounded"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => mover(-1)}
                  aria-label="Ejemplo anterior"
                  className="h-9 px-3 rounded-lg border text-sm inline-flex items-center gap-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
                </button>
                <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                  {(indiceAbierto ?? 0) + 1} de {total}
                </span>
                <button
                  type="button"
                  onClick={() => mover(1)}
                  aria-label="Ejemplo siguiente"
                  className="h-9 px-3 rounded-lg border text-sm inline-flex items-center gap-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
