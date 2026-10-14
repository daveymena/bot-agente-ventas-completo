/**
 * Pestaña "IA" del Estudio: creación SOBRE la foto real del producto.
 * La IA nunca inventa el producto: pinta el entorno (imagen) o anima la foto
 * (vídeo). Sin proveedor configurado lo dice tal cual y no promete nada.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clapperboard, ImagePlus, Loader2, Scissors, Sparkles, Trash2, Wand2 } from "lucide-react";
import { FIDELIDAD, apiEstudio, type CreacionIA, type EstadoEstudio, type RecorteGuardado, type Trabajo } from "@/lib/estudio/diseno";

const miniatura = (src: string | null | undefined) => (!src ? "" : src.startsWith("/") || src.startsWith("data:") ? src : `/api/estudio-anuncios/imagen?src=${encodeURIComponent(src)}`);

const IDEAS = [
  "Sobre una mesa de madera clara con luz de tarde",
  "En un estudio fotográfico con fondo liso y sombra suave",
  "Ambiente navideño con luces cálidas desenfocadas",
  "Sobre mármol blanco, estilo premium y minimalista",
  "Al aire libre, césped y cielo despejado",
  "En una repisa de tienda con fondo desenfocado",
];

export interface PanelIAProps {
  productId: number;
  estado: EstadoEstudio;
  onCambio: () => void | Promise<void>;
}

export function PanelIA({ productId, estado, onCambio }: PanelIAProps) {
  const ia = estado.ia;
  const fotos = estado.estudio.contenido?.fotos || [];
  const recortes = estado.estudio.recortes || {};
  const creaciones = estado.estudio.ia || [];
  const trabajos = estado.trabajos.ia || {};
  const [tipo, setTipo] = useState<"imagen" | "video">("imagen");
  const [foto, setFoto] = useState<string>(fotos[0] || "");
  const [instruccion, setInstruccion] = useState("");
  const [proveedor, setProveedor] = useState<string>("auto");
  const [conservar, setConservar] = useState(true);
  const [duracion, setDuracion] = useState(6);
  const [pidiendo, setPidiendo] = useState(false);
  const [recortando, setRecortando] = useState<string | null>(null);
  const fotoActual = foto || fotos[0] || "";
  const recorte = recortes[fotoActual];
  const disponibles = (ia?.proveedores || []).filter((p) => p.configurado && p[tipo]);
  const puede = tipo === "imagen" ? !!ia?.imagen : !!ia?.video;

  const pedir = async () => {
    if (!fotoActual) { toast.error("El producto no tiene fotos reales"); return; }
    setPidiendo(true);
    try {
      await apiEstudio(`/${productId}/ia`, { method: "POST", body: JSON.stringify({ tipo, foto: fotoActual, instruccion, proveedor: proveedor === "auto" ? null : proveedor, conservarProducto: conservar, duracion }) });
      toast.success(tipo === "imagen" ? "La IA está pintando el entorno (1–2 min)" : "La IA está animando la foto (2–6 min)");
      await onCambio();
    } catch (e: any) { toast.error(e?.message || "No se pudo pedir"); }
    setPidiendo(false);
  };

  const recortar = async (src: string) => {
    setRecortando(src);
    try {
      const r = await apiEstudio<{ recorte: RecorteGuardado }>(`/${productId}/recortar`, { method: "POST", body: JSON.stringify({ foto: src }) });
      if (r.recorte.usable) toast.success(`Fondo quitado (confianza ${Math.round(r.recorte.confianza * 100)} %)`);
      else toast.message(`No se recortó: ${r.recorte.motivo || "el fondo no es liso"} (confianza ${Math.round(r.recorte.confianza * 100)} %)`);
      await onCambio();
    } catch (e: any) { toast.error(e?.message || "No se pudo recortar"); }
    setRecortando(null);
  };

  const usar = async (c: CreacionIA, como: "foto" | "clip") => {
    try {
      await apiEstudio(`/${productId}/ia/${c.id}/usar`, { method: "POST", body: JSON.stringify({ como, escena: 0 }) });
      toast.success(como === "foto" ? "Ahora es la primera foto del producto: genera de nuevo para verla en las piezas" : "Quedó como fondo de la escena 1 del vídeo");
      await onCambio();
    } catch (e: any) { toast.error(e?.message || "No se pudo usar"); }
  };

  const borrar = async (c: CreacionIA) => {
    try { await apiEstudio(`/${productId}/ia/${c.id}`, { method: "DELETE" }); await onCambio(); } catch (e: any) { toast.error(e?.message || "No se pudo borrar"); }
  };

  return (
    <div className="space-y-5">
      {/* Recortes locales: la base de todo (sin IA) */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Scissors className="h-4 w-4 text-indigo-500" />Producto sin fondo (local, sin IA)</h3>
            <p className="mt-1 text-sm text-muted-foreground">Se calcula aquí mismo con la foto real: si el fondo es liso, el producto queda recortado y flota con sombra en piezas y vídeo. Si no, se dice y se usa la foto entera.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {fotos.slice(0, 6).map((f) => {
            const r = recortes[f];
            return (
              <div key={f} className="w-[132px]">
                <button className={`relative block h-[132px] w-[132px] overflow-hidden rounded-xl border bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:16px_16px] ${fotoActual === f ? "border-indigo-500 ring-2 ring-indigo-200" : "border-border"}`} onClick={() => setFoto(f)} title="Usar como foto de partida">
                  <img src={r?.usable && r.url ? r.url : miniatura(f)} alt="" className="h-full w-full object-contain" />
                  {r?.usable && <Badge className="absolute left-1 top-1 bg-emerald-600 text-[10px]">sin fondo {Math.round(r.confianza * 100)} %</Badge>}
                </button>
                <div className="mt-1 flex items-center justify-between">
                  <span className="truncate text-[11px] text-muted-foreground" title={r?.motivo}>{r ? (r.usable ? "Recortada" : r.motivo || "No recortable") : "Sin calcular"}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={recortando === f} onClick={() => void recortar(f)}>{recortando === f ? <Loader2 className="h-3 w-3 animate-spin" /> : r ? "Rehacer" : "Recortar"}</Button>
                </div>
              </div>
            );
          })}
          {!fotos.length && <p className="text-sm text-muted-foreground">Este producto no tiene fotos: súbelas en el catálogo primero.</p>}
        </div>
      </div>

      {/* Espacio de IA */}
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-indigo-500" />Crear con IA sobre la foto real</h3>
        <p className="mt-1 text-sm text-muted-foreground">La IA no inventa el producto: recibe tu foto real (y, cuando el fondo es liso, una máscara que protege el producto), pinta solo el entorno o anima la foto, y al final se comprueba que el producto siga igual.</p>

        {!ia?.configurada ? (
          <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />No hay ningún proveedor de IA configurado en el servidor.</p>
            <p className="mt-1">Todo lo demás del Estudio funciona en local (piezas, vídeo, recortes, movimiento). Para activar este espacio, pon una de estas variables en el servidor: {(ia?.proveedores || []).map((p) => <code key={p.id} className="mx-0.5 rounded bg-black/5 px-1">{p.variable}</code>)}.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_280px]">
            <div className="space-y-3">
              <div className="flex rounded-md border">
                {([["imagen", "Imagen: entorno nuevo", ImagePlus], ["video", "Vídeo: animar la foto", Clapperboard]] as const).map(([v, n, Icono]) => (
                  <button key={v} className={`flex flex-1 items-center justify-center gap-1 py-2 text-sm ${tipo === v ? "bg-indigo-600 text-white" : "text-muted-foreground"}`} onClick={() => setTipo(v)}><Icono className="h-4 w-4" />{n}</button>
                ))}
              </div>
              <div>
                <Label>¿Qué entorno quieres? <span className="text-xs text-muted-foreground">(el producto no se toca)</span></Label>
                <Textarea className="mt-1" rows={2} value={instruccion} onChange={(ev) => setInstruccion(ev.target.value.slice(0, 500))} placeholder={tipo === "imagen" ? "Ej.: sobre una mesa de madera con luz cálida de tarde" : "Ej.: la cámara se acerca despacio y la luz recorre el producto"} />
                <div className="mt-2 flex flex-wrap gap-1.5">{IDEAS.map((t) => <button key={t} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-indigo-400 hover:text-foreground" onClick={() => setInstruccion(t)}>{t}</button>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Proveedor</Label>
                  <Select value={proveedor} onValueChange={setProveedor}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático{tipo === "imagen" && recorte?.usable ? " (prefiere máscara)" : ""}</SelectItem>
                      {(ia.proveedores || []).filter((p) => p[tipo]).map((p) => <SelectItem key={p.id} value={p.id} disabled={!p.configurado}>{p.nombre}{p.configurado ? "" : " · sin clave"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {tipo === "video" ? (
                  <div>
                    <Label>Duración</Label>
                    <Select value={String(duracion)} onValueChange={(v) => setDuracion(Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{[5, 6, 8, 10].map((d) => <SelectItem key={d} value={String(d)}>{d} s</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-2 pb-1">
                    <Label className="text-sm">Volver a pegar el producto original encima</Label>
                    <Switch checked={conservar} onCheckedChange={setConservar} />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="bg-indigo-600 hover:bg-indigo-500" disabled={pidiendo || !puede || !fotoActual} onClick={() => void pedir()}>{pidiendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}{tipo === "imagen" ? "Pintar el entorno" : "Animar la foto"}</Button>
                {!puede && <span className="text-xs text-amber-600">No hay proveedor de {tipo} con clave ({(ia.proveedores || []).filter((p) => p[tipo]).map((p) => p.variable).join(" o ")}).</span>}
                {puede && <span className="text-xs text-muted-foreground">Gasta créditos de {disponibles.map((p) => p.nombre.split(" ")[0]).join(" / ")}.</span>}
              </div>
            </div>
            <div>
              <Label>Foto real de partida</Label>
              <div className="mt-1 overflow-hidden rounded-xl border bg-slate-100 dark:bg-slate-900">
                {fotoActual ? <img src={miniatura(fotoActual)} alt="" className="aspect-square w-full object-contain" /> : <div className="aspect-square" />}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tipo === "imagen"
                  ? recorte?.usable ? <><CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-600" />Fondo liso: el producto va protegido por máscara y se repone píxel a píxel.</> : <><AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" />{recorte?.motivo || "Fondo no liso"}: sin máscara; se comprueba a ojo que el producto siga igual.</>
                  : "La foto es el primer fotograma: el vídeo arranca exactamente con tu producto."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Resultados */}
      {creaciones.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="font-semibold">Creaciones ({creaciones.length})</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creaciones.map((c) => {
              const t: Trabajo | undefined = trabajos[c.id];
              const f = c.fidelidad ? FIDELIDAD[c.fidelidad] : null;
              const enCurso = c.estado === "pendiente" || c.estado === "en_curso";
              return (
                <div key={c.id} className="overflow-hidden rounded-xl border">
                  <div className="relative aspect-[4/5] bg-slate-100 dark:bg-slate-900">
                    {c.estado === "lista" && c.url ? (
                      c.tipo === "video" ? <video src={c.url} controls playsInline muted loop className="h-full w-full object-contain" /> : <img src={c.url} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">
                        {enCurso ? <><Loader2 className="mb-2 h-5 w-5 animate-spin" />{t?.detalle || (c.estado === "pendiente" ? "En cola" : "Trabajando…")}<Progress className="mt-2 h-1 w-full" value={t?.progreso ?? 0} /></> : <><AlertTriangle className="mb-2 h-5 w-5 text-amber-500" />{c.error || "Falló"}</>}
                      </div>
                    )}
                    <Badge variant="secondary" className="absolute left-2 top-2 text-[10px]">{c.tipo === "video" ? "Vídeo IA" : "Imagen IA"}{c.proveedor ? ` · ${c.proveedor}` : ""}</Badge>
                  </div>
                  <div className="space-y-1.5 p-2.5 text-xs">
                    {c.instruccion && <p className="line-clamp-2 text-muted-foreground">“{c.instruccion}”</p>}
                    {f && <p className={f.tono === "ok" ? "text-emerald-600" : f.tono === "aviso" ? "text-amber-600" : "text-muted-foreground"}>{f.tono === "ok" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <AlertTriangle className="mr-1 inline h-3 w-3" />}{f.etiqueta}</p>}
                    {c.nota && <p className="text-[11px] text-muted-foreground" title={c.nota}>{c.nota}</p>}
                    {c.estado === "lista" && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {c.tipo === "imagen" && c.fidelidad !== "baja" && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void usar(c, "foto")}>Usar como foto</Button>}
                        {c.tipo === "video" && <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!estado.estudio.escenas?.length} onClick={() => void usar(c, "clip")}>Fondo de la escena 1</Button>}
                        {c.url && <a className="inline-flex h-7 items-center rounded-md border px-2 text-[11px]" href={c.url} download>Descargar</a>}
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-red-600" onClick={() => void borrar(c)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
