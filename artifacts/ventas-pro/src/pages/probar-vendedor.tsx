/**
 * PROBAR VENDEDOR — chat de prueba del dueño (como el de la IA de Meta).
 *
 * El dueño escribe como si fuera un cliente; responde el mismo vendedor de
 * WhatsApp, en memoria (no se crea ninguna conversación real). Si una
 * respuesta sale mal, "Corregir" la arregla al instante: un dato va al
 * conocimiento del negocio y la forma de hablar a las indicaciones del agente.
 * Todo lo aprendido se ve en "Lo que ya sabe" y se deshace con un clic.
 *
 * Backend: artifacts/api-server/src/routes/probar-vendedor.ts
 */
import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ArrowLeft, BookOpen, Loader2, MessageSquareWarning, Package, PencilLine, RotateCcw, Send, Trash2, Wand2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { BurbujaWhatsApp, type Burbuja } from "@/components/burbuja-whatsapp";
import { Revision, DialogoEnvio, type Alerta } from "@/components/revision-del-vendedor";

type Mensaje = {
  role: "customer" | "agent";
  /** Lo que el motor recuerda de su turno (va en el historial del siguiente). */
  content: string;
  /** Lo que ve el cliente: la ficha con su foto, precio, cuentas… */
  burbujas?: Burbuja[];
  corregido?: boolean;
  productoEnFoco?: number | null;
  /** El estado y el pedido de ANTES de este turno: para volver a generarlo al corregir. */
  estadoAntes?: unknown;
  pedidoAntes?: unknown;
  /** Lo que respondía antes de la corrección (para compararlo). */
  antes?: Burbuja[];
  /** La respuesta regenerada salió igual a la de antes. */
  salioIgual?: boolean;
  /** Lo que el servidor encontró que esta respuesta no puede sostener (ver lib/revisar-respuesta.ts). */
  revision?: Alerta[];
};


type LoQueSabe = {
  agente: { id: number; nombre: string } | null;
  agentes?: { id: number; nombre: string }[];
  indicaciones: string[];
  datos: { id: number; pregunta: string; respuesta: string | null; productId: number | null; producto?: string | null }[];
};

const SUGERENCIAS = ["Hola, ¿qué venden?", "¿Cuánto cuesta?", "¿Cómo pago?", "Lo voy a pensar"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.mensaje || data?.error || `Error ${r.status}`);
  return data as T;
}

export default function ProbarVendedorPage() {
  const [, setLocation] = useLocation();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [estado, setEstado] = useState<unknown>(null);
  // El pedido de prueba (simulado: no se registra ni se despacha).
  const [pedido, setPedido] = useState<unknown>(null);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [sabe, setSabe] = useState<LoQueSabe | null>(null);
  const [verSabe, setVerSabe] = useState(false);
  // Qué se corrige: la respuesta `i` y, si el dueño tocó una burbuja, cuál (`k`).
  const [eleccion, setEleccion] = useState<{ i: number; k: number | null } | null>(null);
  const corrigiendo = eleccion?.i ?? null;
  const setCorrigiendo = (i: number | null) => setEleccion(i === null ? null : { i, k: null });
  const finRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);
  // Si el dueño no subió a leer algo, el chat queda pegado abajo aunque las
  // fotos de las fichas terminen de cargar después (antes empujaban el botón
  // "Corregir" fuera de la pantalla).
  const pegadoAbajo = useRef(true);

  const cargarSabe = () => api<LoQueSabe>("/api/probar-vendedor/sabe").then(setSabe).catch(() => {});
  useEffect(() => { cargarSabe(); }, []);
  useEffect(() => { pegadoAbajo.current = true; finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [mensajes, pensando]);
  useEffect(() => {
    const cont = contenidoRef.current;
    if (!cont || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      if (pegadoAbajo.current && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    });
    obs.observe(cont);
    return () => obs.disconnect();
  }, []);

  const enviar = async (contenido: string) => {
    const limpio = contenido.trim();
    if (!limpio || pensando) return;
    const historial = mensajes.map(({ role, content }) => ({ role, content }));
    const estadoAntes = estado;
    const pedidoAntes = pedido;
    setMensajes((m) => [...m, { role: "customer", content: limpio }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await api<{ texto: string; mensajes: Burbuja[]; estado: unknown; pedido: unknown; productoEnFoco: number | null; revision?: Alerta[] }>(
        "/api/probar-vendedor/mensaje",
        { method: "POST", body: JSON.stringify({ mensaje: limpio, historial, estado, pedido }) },
      );
      setEstado(r.estado);
      setPedido(r.pedido ?? null);
      setMensajes((m) => [...m, { role: "agent", content: r.texto || "[ficha]", burbujas: r.mensajes, productoEnFoco: r.productoEnFoco, estadoAntes, pedidoAntes, revision: r.revision || [] }]);
    } catch (e: any) {
      toast.error(e.message || "El vendedor no respondió");
      setMensajes((m) => m.slice(0, -1));
      setTexto(limpio);
    } finally {
      setPensando(false);
    }
  };

  const reiniciar = () => { setMensajes([]); setEstado(null); setPedido(null); };

  /**
   * Vuelve a generar la respuesta `i` con la corrección ya guardada, desde el
   * mismo punto de la conversación. Así el dueño VE si la corrección se tomó
   * (como en el chat de prueba de Meta). La charla sigue desde ahí: lo que
   * venía después dependía de la respuesta vieja.
   */
  const regenerar = async (i: number) => {
    const vieja = mensajes[i];
    let c = i - 1;
    while (c >= 0 && mensajes[c].role !== "customer") c--;
    if (!vieja || c < 0) return;
    const historial = mensajes.slice(0, c).map(({ role, content }) => ({ role, content }));
    setMensajes(mensajes.slice(0, i));
    setPensando(true);
    try {
      const r = await api<{ texto: string; mensajes: Burbuja[]; estado: unknown; pedido: unknown; productoEnFoco: number | null; revision?: Alerta[] }>(
        "/api/probar-vendedor/mensaje",
        { method: "POST", body: JSON.stringify({ mensaje: mensajes[c].content, historial, estado: vieja.estadoAntes ?? null, pedido: vieja.pedidoAntes ?? null }) },
      );
      const textoDe = (bs?: Burbuja[]) => (bs || []).map((b) => b.texto).join("\n").trim();
      const salioIgual = textoDe(r.mensajes) === textoDe(vieja.burbujas);
      setEstado(r.estado);
      setPedido(r.pedido ?? null);
      setMensajes([
        ...mensajes.slice(0, i),
        {
          role: "agent", content: r.texto || "[ficha]", burbujas: r.mensajes, productoEnFoco: r.productoEnFoco,
          estadoAntes: vieja.estadoAntes, pedidoAntes: vieja.pedidoAntes,
          corregido: true, antes: vieja.antes ?? vieja.burbujas, salioIgual, revision: r.revision || [],
        },
      ]);
      if (salioIgual) toast.warning("Respondió igual. Prueba escribir la corrección de otra forma, más concreta.");
    } catch (e: any) {
      toast.error(e.message || "No se pudo volver a generar");
      setMensajes(mensajes);
    } finally {
      setPensando(false);
    }
  };

  const panelSabe = <PanelLoQueSabe sabe={sabe} alCambiar={cargarSabe} />;

  // ── Arreglar con un clic lo que encontró la revisión ──────────────────
  const [arreglando, setArreglando] = useState<string | null>(null);
  const [configEnvio, setConfigEnvio] = useState<number | null>(null);
  const corregirAlerta = async (i: number, a: Alerta) => {
    if (!a.correccion) return;
    setArreglando(`${i}:${a.frase}`);
    try {
      await api("/api/probar-vendedor/corregir", {
        method: "POST",
        body: JSON.stringify({ tipo: "forma", indicacion: a.correccion }),
      });
      toast.success("Corregido", { description: `Tu vendedor ya no dirá "${a.frase}". Así responde ahora:` });
      cargarSabe();
      await regenerar(i);
    } catch (e: any) {
      toast.error(e.message || "No se pudo corregir");
    } finally {
      setArreglando(null);
    }
  };

  return (
    <Layout chatCompleto>
      <div className="vp-test-workspace flex flex-1 min-h-0 flex-col gap-3">
        <div className="vp-test-intro flex shrink-0 items-center justify-between gap-3 px-3 pt-3 md:px-0 md:pt-0">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-indigo-600">Laboratorio de conversación</p><h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-2xl">Así responderá tu vendedor</h1></div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800">Prueba privada</span>
        </div>
        <div className="flex flex-1 min-h-0 gap-5">
        {/* ── El chat ─────────────────────────────────────────────── */}
        <section className="flex flex-1 min-w-0 min-h-0 flex-col vp-conversation-surface overflow-hidden bg-[#f2f5f4] md:rounded-3xl md:border md:border-slate-200 md:shadow-sm">
          <header className="flex items-center gap-3 bg-[#123f38] px-4 py-3 text-white">
            <button onClick={() => setLocation("/agents")} className="md:hidden p-1 -ml-1" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 font-semibold">
              {(sabe?.agente?.nombre || "V").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{sabe?.agente?.nombre || "Tu vendedor"}</p>
              <p className="truncate text-[11px] text-white/75">{pensando ? "escribiendo…" : "Modo prueba · no le llega a ningún cliente"}</p>
            </div>
            <button onClick={() => setLocation("/ensenar-con-ejemplo")} className="rounded-full p-2 hover:bg-white/10" aria-label="Enseñar con un ejemplo" title="Enseñar con un ejemplo"><GraduationCap className="h-5 w-5" /></button>
            <button onClick={() => setVerSabe(true)} className="lg:hidden rounded-full p-2 hover:bg-white/10" aria-label="Lo que ya sabe"><BookOpen className="h-5 w-5" /></button>
            <button onClick={reiniciar} disabled={!mensajes.length} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40" aria-label="Empezar de nuevo" title="Empezar de nuevo"><RotateCcw className="h-5 w-5" /></button>
          </header>

          <div
            ref={chatRef}
            onScroll={(e) => { const el = e.currentTarget; pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-4"
          >
          <div ref={contenidoRef} className="space-y-2">
            {mensajes.length === 0 && (
              <div className="mx-auto my-6 max-w-md rounded-3xl border border-slate-200/80 bg-white p-5 text-center shadow-sm md:my-10 md:p-7">
                <Wand2 className="mx-auto mb-2 h-6 w-6 text-indigo-600" />
                <p className="text-sm font-semibold text-slate-800">Háblale como si fueras un cliente</p>
                <p className="mt-1 text-xs text-slate-500">Si algo sale mal, toca <b>Corregir</b> debajo de la respuesta. Se aplica desde el siguiente mensaje, también en WhatsApp.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} onClick={() => enviar(s)} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === "customer" ? "justify-end" : "justify-start"}`}>
                <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]">
                  {m.antes && (
                    <details className="self-start max-w-full rounded-lg bg-white/60 px-2.5 py-1.5 text-[12px] text-slate-500">
                      <summary className="cursor-pointer select-none">Antes de corregir</summary>
                      <p className="mt-1 whitespace-pre-wrap line-through decoration-slate-300">{m.antes.map((b) => b.texto).join("\n\n")}</p>
                    </details>
                  )}
                  {(m.role === "customer" ? [{ texto: m.content } as Burbuja] : m.burbujas?.length ? m.burbujas : [{ texto: m.content }]).map((b, k) => (
                    <BurbujaWhatsApp
                      key={k}
                      burbuja={b}
                      deCliente={m.role === "customer"}
                      primera={k === 0}
                      alTocar={m.role === "agent" ? () => setEleccion({ i, k: m.burbujas?.length ? k : null }) : undefined}
                      elegida={eleccion?.i === i && eleccion?.k === k}
                    />
                  ))}
                  {m.role === "agent" && m.revision && (
                    <Revision
                      alertas={m.revision}
                      ocupado={arreglando}
                      i={i}
                      alCorregir={(a) => corregirAlerta(i, a)}
                      alConfigurarEnvio={() => setConfigEnvio(i)}
                    />
                  )}
                  {m.role === "agent" && (
                    <button
                      onClick={() => setCorrigiendo(i)}
                      className={`self-start inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.corregido ? (m.salioIgual ? "text-amber-700" : "text-emerald-700") : "text-slate-500 hover:text-indigo-700 hover:bg-white/70"}`}
                    >
                      <PencilLine className="h-3 w-3" /> {m.corregido ? (m.salioIgual ? "Salió igual · corregir otra vez" : "Corregido · así responde ahora") : "Corregir"}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {pensando && (
              <div className="flex justify-start">
                <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
              </div>
            )}
            <div ref={finRef} />
          </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="flex items-end gap-2 border-t border-slate-200/70 bg-white/95 px-3 py-3">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
              placeholder="Escribe como cliente…"
              rows={1}
              className="min-h-[42px] max-h-32 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-[15px] shadow-none focus-visible:ring-1"
            />
            <Button type="submit" size="icon" disabled={!texto.trim() || pensando} className="h-[42px] w-[42px] shrink-0 rounded-full bg-[#00a884] hover:bg-[#029273]" aria-label="Enviar">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </section>

        {/* ── Lo que ya sabe (escritorio) ─────────────────────────── */}
        <aside className="hidden lg:flex w-[300px] xl:w-[340px] shrink-0 flex-col min-h-0">{panelSabe}</aside>
        </div>
      </div>

      <Sheet open={verSabe} onOpenChange={setVerSabe}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Lo que ya sabe</SheetTitle><SheetDescription>Lo que corregiste. Bórralo para deshacerlo.</SheetDescription></SheetHeader>
          <div className="mt-3">{panelSabe}</div>
        </SheetContent>
      </Sheet>

      <DialogoEnvio
        abierto={configEnvio !== null}
        alCerrar={() => setConfigEnvio(null)}
        alGuardar={() => { const i = configEnvio; setConfigEnvio(null); if (i !== null) regenerar(i); }}
      />

      <DialogoCorregir
        abierto={corrigiendo !== null}
        mensajeCliente={corrigiendo !== null ? [...mensajes.slice(0, corrigiendo)].reverse().find((m) => m.role === "customer")?.content || "" : ""}
        respuestaBot={corrigiendo !== null ? (mensajes[corrigiendo]?.burbujas?.map((b) => b.texto).join("\n\n") || mensajes[corrigiendo]?.content || "") : ""}
        burbujaElegida={eleccion && eleccion.k !== null ? mensajes[eleccion.i]?.burbujas?.[eleccion.k] ?? null : null}
        productoEnFoco={corrigiendo !== null ? mensajes[corrigiendo]?.productoEnFoco ?? null : null}
        alCerrar={() => setCorrigiendo(null)}
        alCorregir={() => {
          const i = corrigiendo;
          setCorrigiendo(null);
          cargarSabe();
          if (i !== null) regenerar(i);
        }}
      />
    </Layout>
  );
}

function DialogoCorregir(p: {
  abierto: boolean;
  mensajeCliente: string;
  respuestaBot: string;
  productoEnFoco: number | null;
  /** La burbuja que tocó el dueño (una ficha, un texto, un audio), si tocó una. */
  burbujaElegida?: Burbuja | null;
  alCerrar: () => void;
  alCorregir: () => void;
}) {
  const [texto, setTexto] = useState("");
  const elegida = p.burbujaElegida ?? null;
  const esFicha = elegida?.imagen !== undefined && elegida !== null;
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (p.abierto) setTexto(""); }, [p.abierto]);

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      const r = await api<{ mensaje: string; tipo?: "forma" | "dato"; guardado?: string }>("/api/probar-vendedor/corregir", {
        method: "POST",
        body: JSON.stringify({
          correccion: texto,
          mensajeDelCliente: p.mensajeCliente,
          // Si tocó una burbuja, la corrección es sobre ESE mensaje (la ficha, el audio…).
          respuestaBot: elegida ? `[El dueño señala este mensaje${esFicha ? " (una ficha con foto)" : elegida.audio ? " (una nota de voz)" : ""}]: ${elegida.texto}` : p.respuestaBot,
          productId: p.productoEnFoco,
        }),
      });
      toast.success(
        r.tipo === "dato" ? "Guardado como dato del negocio" : "Guardado como regla para tu vendedor",
        { description: r.guardado ? `"${r.guardado}". ${r.mensaje}` : r.mensaje },
      );
      p.alCorregir();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={p.abierto} onOpenChange={(o) => !o && p.alCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquareWarning className="h-5 w-5 text-indigo-600" /> Corregir respuesta</DialogTitle>
          <DialogDescription>Escríbelo como se lo dirías a tu vendedor. Se aplica al instante, aquí y en WhatsApp, y la respuesta se vuelve a generar para que veas el cambio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
          <p className="text-slate-500">Cliente: <span className="text-slate-800">{p.mensajeCliente || "—"}</span></p>
          {elegida ? (
            <div className="flex gap-2">
              {esFicha && elegida.imagen && <img src={elegida.imagen} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />}
              <p className="text-slate-500 line-clamp-4">
                {esFicha ? "Ficha elegida" : elegida.audio ? "Nota de voz elegida" : "Mensaje elegido"}: <span className="text-slate-800">{elegida.texto}</span>
              </p>
            </div>
          ) : (
            <p className="text-slate-500 line-clamp-3">Vendedor: <span className="text-slate-800">{p.respuestaBot || "—"}</span></p>
          )}
        </div>
        {esFicha && (
          <p className="-mt-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            La presentación de la ficha (el gancho y "Así te ayuda") <b>se reescribe con tu corrección</b> (ej: "no digas que el efecto es inmediato").
            El precio, las fotos y la descripción salen de <a href="/products" className="font-semibold underline">Productos</a>; el envío y el pago, del perfil del negocio.
          </p>
        )}

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder={"¿Qué debió responder o hacer?\nEj: No vuelvas a ofrecer el video si ya lo enviaste.\nEj: Sí tiene garantía de 30 días por defectos de fábrica."}
        />
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Si es una regla de cómo vender, se guarda para todos tus agentes. Si es un dato (garantía, tallas, horarios), queda como respuesta del negocio.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTexto(`Debió decir:\n${elegida?.texto ?? p.respuestaBot}`)}
            className="h-7 text-xs"
          >
            <PencilLine className="mr-1 h-3.5 w-3.5" /> Editar este texto
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={p.alCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={!texto.trim() || guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Aplicar y volver a responder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PanelLoQueSabe({ sabe, alCambiar }: { sabe: LoQueSabe | null; alCambiar: () => void }) {
  const [editInd, setEditInd] = useState<{ i: number; texto: string } | null>(null);
  const [editDato, setEditDato] = useState<{ id: number; texto: string } | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const borrar = async (url: string) => {
    try {
      const r = await api<{ mensaje: string }>(url, { method: "DELETE" });
      toast.success(r.mensaje);
      alCambiar();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const guardarInd = async () => {
    if (!editInd || !editInd.texto.trim() || guardandoEdicion) return;
    setGuardandoEdicion(true);
    try {
      const r = await api<{ mensaje: string }>(`/api/probar-vendedor/indicacion/${editInd.i}`, {
        method: "PUT",
        body: JSON.stringify({ indicacion: editInd.texto }),
      });
      toast.success(r.mensaje);
      setEditInd(null);
      alCambiar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const guardarDato = async () => {
    if (!editDato || !editDato.texto.trim() || guardandoEdicion) return;
    setGuardandoEdicion(true);
    try {
      const r = await api<{ mensaje: string }>(`/api/probar-vendedor/dato/${editDato.id}`, {
        method: "PUT",
        body: JSON.stringify({ respuesta: editDato.texto }),
      });
      toast.success(r.mensaje);
      setEditDato(null);
      alCambiar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  if (!sabe) return <div className="p-4 text-sm text-slate-400">Cargando…</div>;

  return (
    <div className="flex flex-col gap-4 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:overflow-y-auto">
      <div className="hidden lg:block">
        <p className="text-sm font-semibold text-slate-800">Lo que ya sabe</p>
        <p className="text-xs text-slate-500">Lo que corregiste. Bórralo para deshacerlo.</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Forma de hablar</p>
        {sabe.indicaciones.length === 0 ? (
          <p className="text-xs text-slate-400">Sin indicaciones todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {sabe.indicaciones.map((ind, i) => (
              <li key={i} className="group flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                {editInd?.i === i ? (
                  <div className="flex-1">
                    <Textarea value={editInd.texto} onChange={(e) => setEditInd({ i, texto: e.target.value })} rows={3} maxLength={500} className="text-xs" />
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" disabled={!editInd.texto.trim() || guardandoEdicion} onClick={guardarInd}>
                        {guardandoEdicion && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Guardar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditInd(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="flex-1">{ind}</span>
                    <button onClick={() => setEditInd({ i, texto: ind })} className="text-slate-400 hover:text-indigo-600" aria-label="Editar"><PencilLine className="h-3.5 w-3.5" /></button>
                    <button onClick={() => borrar(`/api/probar-vendedor/indicacion/${i}`)} className="text-slate-400 hover:text-red-600" aria-label="Borrar"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Respuestas del negocio</p>
        {sabe.datos.length === 0 ? (
          <p className="text-xs text-slate-400">Sin respuestas cargadas todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {sabe.datos.map((d) => (
              <li key={d.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
                {editDato?.id === d.id ? (
                  <div className="flex-1">
                    <p className="truncate text-slate-500">{d.pregunta}</p>
                    <Textarea value={editDato.texto} onChange={(e) => setEditDato({ id: d.id, texto: e.target.value })} rows={3} maxLength={500} className="mt-1 text-xs" />
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" disabled={!editDato.texto.trim() || guardandoEdicion} onClick={guardarDato}>
                        {guardandoEdicion && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Guardar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditDato(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-500">{d.pregunta}</p>
                      <p className="text-slate-800">{d.respuesta || <i className="text-slate-400">sin respuesta: dirá que lo confirma</i>}</p>
                      <p className={`mt-1 text-[11px] ${d.productId != null ? "text-amber-700" : "text-emerald-700"}`}>
                        {d.productId != null ? `Solo para: ${d.producto ?? `producto ${d.productId}`}` : "Para todos los productos"}
                      </p>
                    </div>
                    <button onClick={() => setEditDato({ id: d.id, texto: d.respuesta || "" })} className="text-slate-400 hover:text-indigo-600" aria-label="Editar"><PencilLine className="h-3.5 w-3.5" /></button>
                    <button onClick={() => borrar(`/api/probar-vendedor/dato/${d.id}`)} className="text-slate-400 hover:text-red-600" aria-label="Borrar"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
