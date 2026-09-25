/**
 * ENSEÑAR CON UN EJEMPLO — el dueño sube un README con una conversación
 * ejemplar (armada con ChatGPT u otra IA) y el sistema:
 *   1. la lee y pasa los mensajes del cliente por su vendedor REAL;
 *   2. compara "tu ejemplo" con "lo que responde hoy";
 *   3. propone cambios (forma de vender, datos, qué configurar) que el dueño
 *      marca y aplica; los precios nunca salen del ejemplo;
 *   4. vuelve a probar para mostrar el antes y el después.
 *
 * Backend: artifacts/api-server/src/lib/aprender-de-ejemplo.ts
 */
import { useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BurbujaWhatsApp, type Burbuja } from "@/components/burbuja-whatsapp";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, MessageSquareText, Settings2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Turno = { role: "customer" | "agent"; content?: string; burbujas?: Burbuja[] };
type Propuesta = {
  id: string;
  tipo: "forma" | "dato" | "configurar" | "no_aplica";
  texto: string;
  pregunta?: string;
  productoId?: number | null;
  porque: string;
  sugerida: boolean;
  aplicable: boolean;
  aviso?: string;
};
type Analisis = { resumen: string; ejemplo: Turno[]; hoy: Turno[]; propuestas: Propuesta[]; probados: number; recortado: boolean };

async function api<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.mensaje || data?.error || `Error ${r.status}`);
  return data as T;
}

const GRUPOS: { tipo: Propuesta["tipo"]; titulo: string; ayuda: string; icono: any; color: string }[] = [
  { tipo: "forma", titulo: "Forma de vender", ayuda: "Se suman a las indicaciones de tu vendedor.", icono: Sparkles, color: "text-indigo-600" },
  { tipo: "dato", titulo: "Datos del negocio", ayuda: "Salen del ejemplo: márcalos solo si son verdad en tu negocio.", icono: AlertTriangle, color: "text-amber-600" },
  { tipo: "configurar", titulo: "Para configurar tú", ayuda: "Cosas que conviene cargar en tus productos o en tu negocio.", icono: Settings2, color: "text-slate-600" },
  { tipo: "no_aplica", titulo: "No conviene copiar", ayuda: "Lo que el ejemplo hace y aquí no se debe hacer.", icono: XCircle, color: "text-red-600" },
];

function Charla({ turnos, titulo }: { turnos: Turno[]; titulo: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-[#efeae2] p-2">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
      <div className="space-y-2">
        {turnos.map((t, i) => {
          const burbujas = t.burbujas?.length ? t.burbujas : [{ texto: t.content || "" }];
          return (
            <div key={i} className={`flex flex-col gap-1 ${t.role === "customer" ? "items-end" : "items-start"}`}>
              {burbujas.map((b, k) => (
                <div key={k} className="max-w-[92%]"><BurbujaWhatsApp burbuja={b} deCliente={t.role === "customer"} primera={k === 0} /></div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EnsenarConEjemploPage() {
  const [, setLocation] = useLocation();
  const [texto, setTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [ediciones, setEdiciones] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState(false);
  const [aplicadas, setAplicadas] = useState<Record<string, boolean>>({});
  const [despues, setDespues] = useState<Turno[] | null>(null);
  const [probando, setProbando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const leerArchivo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) {
      toast.error("El archivo es muy grande: sube solo la conversación.");
      return;
    }
    setTexto(await f.text());
    setNombreArchivo(f.name);
  };

  const analizar = async () => {
    setAnalizando(true);
    setAnalisis(null);
    setDespues(null);
    setAplicadas({});
    try {
      const r = await api<Analisis>("/api/probar-vendedor/ejemplo/analizar", { texto });
      setAnalisis(r);
      setMarcadas(Object.fromEntries(r.propuestas.map((p) => [p.id, p.sugerida && p.aplicable])));
      setEdiciones(Object.fromEntries(r.propuestas.map((p) => [p.id, p.texto])));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalizando(false);
    }
  };

  const elegidas = analisis?.propuestas.filter((p) => p.aplicable && marcadas[p.id] && !aplicadas[p.id]) ?? [];

  const aplicar = async () => {
    if (!elegidas.length) return;
    setAplicando(true);
    try {
      const r = await api<{ resultados: { ok: boolean; mensaje: string }[] }>("/api/probar-vendedor/ejemplo/aplicar", {
        propuestas: elegidas.map((p) => ({ tipo: p.tipo, texto: ediciones[p.id] ?? p.texto, pregunta: p.pregunta, productoId: p.productoId })),
      });
      const nuevas = { ...aplicadas };
      r.resultados.forEach((res, i) => {
        if (res.ok) nuevas[elegidas[i].id] = true;
        else toast.error(res.mensaje);
      });
      setAplicadas(nuevas);
      const ok = r.resultados.filter((x) => x.ok).length;
      if (ok) toast.success(`${ok} cambio${ok === 1 ? "" : "s"} aplicado${ok === 1 ? "" : "s"}. Ya responde así, también en WhatsApp.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAplicando(false);
    }
  };

  const probarDeNuevo = async () => {
    if (!analisis) return;
    setProbando(true);
    try {
      const turnos = analisis.ejemplo.filter((t) => t.role === "customer").map((t) => t.content || "");
      const r = await api<{ conversacion: Turno[] }>("/api/probar-vendedor/ejemplo/probar", { turnos });
      setDespues(r.conversacion);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProbando(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Enseñar con un ejemplo</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Sube una conversación de cómo te gustaría que venda (por ejemplo, una que armaste con ChatGPT). La comparamos con lo que responde hoy tu vendedor y te proponemos qué mejorar. No se copia al pie de la letra y <b>los precios siempre salen de tu catálogo</b>.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/probar-vendedor")}><MessageSquareText className="mr-1.5 h-4 w-4" /> Chat de prueba</Button>
        </header>

        {/* ── 1. El ejemplo ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={archivoRef} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => leerArchivo(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => archivoRef.current?.click()}><FileUp className="mr-1.5 h-4 w-4" /> Subir README (.md o .txt)</Button>
            {nombreArchivo && <span className="text-xs text-slate-500">{nombreArchivo}</span>}
          </div>
          <Textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setNombreArchivo(""); }}
            rows={8}
            className="mt-3 font-mono text-xs"
            placeholder={"…o pégala aquí. Cada mensaje empieza con quién habla:\n\nCliente: Hola, vi el corrector de postura\nVendedor: ¡Hola! 😊 ¿Lo buscas para el dolor de espalda o para mejorar la postura?\nCliente: Para el dolor, trabajo sentado"}
          />
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={analizar} disabled={!texto.trim() || analizando}>
              {analizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Analizar
            </Button>
            {analizando && <span className="text-xs text-slate-500">Probando tu vendedor con los mensajes del ejemplo… puede tardar un minuto.</span>}
          </div>
        </section>

        {analisis && (
          <>
            {/* ── 2. Resumen y propuestas ─────────────────────────── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Qué se puede mejorar</h2>
              {analisis.resumen && <p className="mt-1 text-sm text-slate-600">{analisis.resumen}</p>}
              {analisis.recortado && <p className="mt-1 text-xs text-amber-700">El ejemplo era largo: se probaron los primeros {analisis.probados} mensajes del cliente.</p>}

              <div className="mt-4 space-y-5">
                {GRUPOS.map((g) => {
                  const del = analisis.propuestas.filter((p) => p.tipo === g.tipo);
                  if (!del.length) return null;
                  return (
                    <div key={g.tipo}>
                      <p className={`flex items-center gap-1.5 text-sm font-semibold ${g.color}`}><g.icono className="h-4 w-4" /> {g.titulo}</p>
                      <p className="mb-2 text-xs text-slate-500">{g.ayuda}</p>
                      <ul className="space-y-2">
                        {del.map((p) => (
                          <li key={p.id} className={`rounded-xl border p-3 ${aplicadas[p.id] ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}>
                            <div className="flex items-start gap-3">
                              {p.aplicable && (
                                aplicadas[p.id]
                                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                  : <input type="checkbox" checked={!!marcadas[p.id]} onChange={(e) => setMarcadas({ ...marcadas, [p.id]: e.target.checked })} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" aria-label="Aplicar" />
                              )}
                              <div className="min-w-0 flex-1">
                                {p.pregunta && <p className="text-xs font-medium text-slate-500">{p.pregunta}</p>}
                                {p.aplicable && !aplicadas[p.id] ? (
                                  <Textarea value={ediciones[p.id] ?? p.texto} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: e.target.value })} rows={2} className="mt-1 min-h-0 text-sm" />
                                ) : (
                                  <p className="text-sm text-slate-800">{ediciones[p.id] ?? p.texto}</p>
                                )}
                                <p className="mt-1 text-xs text-slate-500">{p.porque}</p>
                                {p.aviso && <p className="mt-1 text-xs text-amber-700">{p.aviso}</p>}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {!analisis.propuestas.length && <p className="text-sm text-slate-500">Tu vendedor ya responde como el ejemplo: no hay nada que cambiar.</p>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Button onClick={aplicar} disabled={!elegidas.length || aplicando}>
                  {aplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Aplicar {elegidas.length ? `${elegidas.length} marcada${elegidas.length === 1 ? "" : "s"}` : "marcadas"}
                </Button>
                <Button variant="outline" onClick={probarDeNuevo} disabled={probando}>
                  {probando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Probar de nuevo
                </Button>
                <span className="text-xs text-slate-500">Todo lo aplicado se ve y se deshace en el chat de prueba → Lo que ya sabe.</span>
              </div>
            </section>

            {/* ── 3. Comparación ─────────────────────────────────── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">{despues ? "Antes y después" : "Tu ejemplo y lo que responde hoy"}</h2>
              <div className="flex flex-col gap-3 md:flex-row">
                <Charla titulo="Tu ejemplo" turnos={analisis.ejemplo} />
                <Charla titulo={despues ? "Antes" : "Hoy"} turnos={analisis.hoy} />
                {despues && <Charla titulo="Después de aplicar" turnos={despues} />}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
