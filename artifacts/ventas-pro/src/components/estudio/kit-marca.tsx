/**
 * Espacio "Marca" del Studio: el kit de marca del negocio.
 *
 * Es el antídoto contra el look genérico: colores, letras y logo propios que
 * después usan TODAS las maquetas de creativos (y el tema de landings, con un
 * botón). Mientras se edita se ve en vivo cómo quedan tres creativos reales
 * del producto elegido, con el mismo dibujante que exporta el PNG.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Upload, RotateCcw, Check, Wand2 } from "lucide-react";
import { capasAHtml, FORMATOS, normalizarEscena, type Escena } from "@estudio/escena";
import { armarCreativo, maquetaPorId, type DatosCreativo } from "@estudio/maquetas-creativo";
import { normalizarKit, contraste, type KitDeMarca } from "@estudio/kit";
import { PAREJAS, FUENTES, fuentePorId, enlaceDeFuentes } from "@estudio/fuentes";

type Paleta = { nombre: string; acento: string; oscuro: string; claro: string };

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Error ${r.status}`); }
  return r.json();
}

function Mini({ escena, ancho }: { escena: Escena; ancho: number }) {
  const f = FORMATOS[escena.formato];
  const esc = ancho / f.ancho;
  const html = useMemo(() => capasAHtml(escena), [escena]);
  return (
    <div className="rounded-lg overflow-hidden ring-1 ring-black/10 shadow-md" style={{ width: ancho, height: f.alto * esc }}>
      <div style={{ width: f.ancho, height: f.alto, maxWidth: "none", transform: `scale(${esc})`, transformOrigin: "top left", pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function Color({ etiqueta, ayuda, valor, onChange }: { etiqueta: string; ayuda: string; valor?: string | null; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border p-2 cursor-pointer hover:bg-muted/50">
      <span className="h-10 w-10 rounded-md border relative overflow-hidden shrink-0" style={{ background: valor || "transparent" }}>
        <input type="color" value={valor || "#888888"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={etiqueta} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{etiqueta} <span className="font-mono text-[11px] text-muted-foreground">{valor || "sin definir"}</span></span>
        <span className="block text-[11px] text-muted-foreground">{ayuda}</span>
      </span>
    </label>
  );
}

export function KitMarca({ productId }: { productId: number | null }) {
  const [kit, setKit] = useState<KitDeMarca>({});
  const [guardado, setGuardado] = useState("{}");
  const [definido, setDefinido] = useState(false);
  const [logoPerfil, setLogoPerfil] = useState<string | null>(null);
  const [paletas, setPaletas] = useState<Paleta[]>([]);
  const [datos, setDatos] = useState<DatosCreativo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = "vp-fuentes-estudio";
    if (!document.getElementById(id)) { const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; l.href = enlaceDeFuentes(FUENTES.map((f) => f.id)); document.head.appendChild(l); }
    api<{ kit: KitDeMarca; definido: boolean; logoDelPerfil: string | null }>("/api/creativos/kit").then((r) => {
      setKit(r.kit); setGuardado(JSON.stringify(normalizarKit(r.kit))); setDefinido(r.definido); setLogoPerfil(r.logoDelPerfil);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productId) { setDatos(null); setPaletas([]); return; }
    api<any>(`/api/creativos/producto/${productId}`).then((d) => setDatos(d.datos)).catch(() => setDatos(null));
    api<{ paletas: Paleta[] }>(`/api/creativos/paletas?productId=${productId}`).then((r) => setPaletas(r.paletas)).catch(() => setPaletas([]));
  }, [productId]);

  const hayCambios = JSON.stringify(normalizarKit(kit)) !== guardado;
  const muestras = useMemo(() => {
    if (!datos) return [];
    return (["impacto", "sello-oferta", "premium", "ficha-tecnica"] as const).map((id) => ({ id, escena: normalizarEscena(armarCreativo(maquetaPorId(id), datos, "4:5", kit)) }));
  }, [datos, kit]);

  const avisoContraste = kit.oscuro && kit.claro && contraste(kit.oscuro, kit.claro) < 7 ? "El oscuro y el claro se parecen mucho: los textos pueden perder contraste." : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api<{ kit: KitDeMarca; definido: boolean }>("/api/creativos/kit", { method: "PUT", body: JSON.stringify({ kit: { ...kit, logo: kit.logo === logoPerfil ? null : kit.logo } }) });
      setKit(r.kit); setGuardado(JSON.stringify(normalizarKit(r.kit))); setDefinido(r.definido);
      window.dispatchEvent(new Event("estudio:kit"));
      toast.success("Kit de marca guardado: los creativos nuevos ya salen con tu identidad.");
    } catch (e: any) { toast.error(e.message); }
    finally { setGuardando(false); }
  };

  const subirLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setSubiendo(true);
    try {
      const dataUrl = await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(f); });
      const r = await api<{ url: string }>("/api/creativos/subir-imagen", { method: "POST", body: JSON.stringify({ dataUrl, nombre: "logo" }) });
      setKit((k) => ({ ...k, logo: r.url }));
    } catch (err: any) { toast.error(err.message); }
    finally { setSubiendo(false); }
  };

  const pareja = PAREJAS.find((p) => p.titulos === kit.titulos && p.texto === kit.texto)?.id;

  return (
    <div className="p-4 sm:p-6 grid gap-6 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Tu marca</h2>
          <p className="text-sm text-muted-foreground">{definido ? "Todas tus piezas salen con esta identidad." : "Todavía no definiste tu marca: los creativos adivinan el color desde la foto. Definila una vez y todo sale con tu identidad."}</p>
        </div>

        {paletas.length > 0 && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" /> Paletas desde la foto de tu producto</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {paletas.map((p) => {
                const elegida = kit.acento === p.acento && kit.oscuro === p.oscuro && kit.claro === p.claro;
                return (
                  <button key={`${p.nombre}${p.acento}`} onClick={() => setKit((k) => ({ ...k, acento: p.acento, oscuro: p.oscuro, claro: p.claro }))}
                    className={`rounded-lg border p-1.5 text-left hover:shadow-md transition ${elegida ? "ring-2 ring-violet-600" : ""}`}>
                    <div className="flex h-8 rounded overflow-hidden">
                      <span style={{ flex: 1, background: p.oscuro }} /><span style={{ flex: 2, background: p.acento }} /><span style={{ flex: 1, background: p.claro }} />
                    </div>
                    <span className="text-[10px] font-semibold flex items-center gap-1 mt-1">{elegida && <Check className="h-3 w-3" />}{p.nombre}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Colores</p>
          <Color etiqueta="Principal" ayuda="Botones, precios y sellos." valor={kit.acento} onChange={(v) => setKit((k) => ({ ...k, acento: v }))} />
          <Color etiqueta="Oscuro" ayuda="Fondos oscuros, en vez del negro de siempre." valor={kit.oscuro} onChange={(v) => setKit((k) => ({ ...k, oscuro: v }))} />
          <Color etiqueta="Claro" ayuda="Fondos claros, en vez del gris de siempre." valor={kit.claro} onChange={(v) => setKit((k) => ({ ...k, claro: v }))} />
          {avisoContraste && <p className="text-[11px] text-amber-700">{avisoContraste}</p>}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Tipografía</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PAREJAS.map((p) => (
              <button key={p.id} onClick={() => setKit((k) => ({ ...k, titulos: p.titulos, texto: p.texto }))}
                className={`rounded-lg border p-2 text-left hover:bg-muted ${pareja === p.id ? "ring-2 ring-violet-600 border-violet-600" : ""}`}>
                <span className="block text-base leading-tight truncate" style={{ fontFamily: `'${fuentePorId(p.titulos).familia}'`, fontWeight: 700 }}>{p.nombre}</span>
                <span className="block text-[10px] text-muted-foreground truncate" style={{ fontFamily: `'${fuentePorId(p.texto).familia}'` }}>{fuentePorId(p.titulos).familia} + {fuentePorId(p.texto).familia}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Logo</p>
          <input ref={archivo} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={subirLogo} />
          <div className="flex items-center gap-3">
            <div className="h-14 w-28 rounded-lg border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] [background-size:12px_12px] grid place-items-center overflow-hidden">
              {kit.logo ? <img src={kit.logo} alt="Logo" className="max-h-12 max-w-[104px] object-contain" /> : <span className="text-[10px] text-muted-foreground">Sin logo</span>}
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => archivo.current?.click()} disabled={subiendo}>{subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}Subir logo</Button>
              {kit.logo && <button className="text-[11px] underline text-muted-foreground text-left" onClick={() => setKit((k) => ({ ...k, logo: null }))}>Sin logo en los creativos</button>}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Mejor un PNG con fondo transparente. Se pone chico, arriba, y solo donde no pisa ningún texto.</p>
        </section>

        <div className="flex gap-2 sticky bottom-0 bg-background py-2">
          <Button variant="ghost" className="text-xs" disabled={!hayCambios} onClick={() => setKit(JSON.parse(guardado))}><RotateCcw className="h-3.5 w-3.5 mr-1" />Deshacer</Button>
          <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={!hayCambios || guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Guardar mi marca
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Así salen tus creativos</p>
        {!productId && <p className="text-sm text-muted-foreground">Elegí un producto arriba para ver la vista previa con su foto real.</p>}
        {productId && !datos && <div className="h-40 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>}
        <div className="flex flex-wrap gap-4">
          {muestras.map((m) => (
            <div key={m.id} className="space-y-1">
              <Mini escena={m.escena} ancho={220} />
              <p className="text-[11px] text-muted-foreground">{maquetaPorId(m.id).nombre}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
