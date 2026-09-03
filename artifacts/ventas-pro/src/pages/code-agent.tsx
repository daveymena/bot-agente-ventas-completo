import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useCajaQueCrece } from "@/hooks/use-caja-que-crece";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, X, Wrench, MessageSquare, Paperclip, RotateCcw, History, Trash2, Copy, Square } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const HELP_GUIDE = getHelpGuide("code-agent")!;

type Mode = "operator" | "agent";

interface ActionEntry {
  tool: string;
  ok: boolean;
  summary: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  /**
   * Cuándo se dijo, en milisegundos.
   *
   * Pedido del admin: "que se vea la hora y la fecha de cada mensaje, como
   * los chats reales". Sin esto una conversación con Atlas es un bloque sin
   * tiempo -- y como un pedido de anuncio puede tardar minutos, no había
   * forma de saber si lo que estás leyendo es de hace un rato o de recién.
   */
  at?: number;
  configApplied?: boolean;
  advancedFeaturesEnabled?: boolean;
  actions?: ActionEntry[];
}

/**
 * La hora de un mensaje, como la escribe un chat de verdad.
 *
 * Hoy es solo la hora; ayer, "Ayer 14:32"; más atrás, la fecha con el día.
 * Un timestamp completo en cada renglón es ruido: lo que uno quiere saber de
 * un mensaje de hace diez minutos es la hora, y de uno de la semana pasada,
 * el día.
 */
function cuandoSeDijo(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mismoDia(d, hoy)) return hora;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(d, ayer)) return `Ayer ${hora}`;
  const fecha = d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  const conAno = d.getFullYear() === hoy.getFullYear() ? fecha : `${fecha} ${d.getFullYear()}`;
  return `${conAno}, ${hora}`;
}

/** El texto completo para el tooltip: ahí sí va la fecha y hora exactas. */
function cuandoExacto(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" });
}

const GREETING: Record<Mode, string> = {
  operator:
    "Soy Atlas, tu asistente VentasPro. Puedo crear y editar productos, categorías, el agente, la configuración y la tienda. Dime qué necesitas y lo hago.",
  agent:
    "Modo diseño de agente. Analizo tu negocio y configuro el ADN de tu agente de ventas.",
};

export default function CodeAgent() {
  useAutoTour(HELP_GUIDE);
  const [mode, setMode] = useState<Mode>("operator");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING.operator, at: Date.now() }]);
  // ── Conversaciones separadas ──────────────────────────────────────────
  // El historial SIEMPRE se guardo por sessionId, pero esta pantalla usaba
  // una sola sesion fija ("default"): abrir una charla nueva significaba
  // BORRAR la anterior. Reportado: "a veces quiero continuar una charla y no
  // puedo porque ya cerre o limpie la actual".
  //
  // La sesion activa se guarda en localStorage y no en el estado nada mas:
  // si se recarga la pagina o se vuelve desde otra seccion, se sigue en la
  // misma charla en vez de saltar a otra.
  const [sessionId, setSessionId] = useState<string>(() => {
    try { return localStorage.getItem("atlas_sesion") || "default"; } catch { return "default"; }
  });
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [panelSesiones, setPanelSesiones] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Lo que Atlas está haciendo ahora mismo, en lenguaje llano (llega por SSE,
  // ver callAtlas). Sin esto el admin solo veía tres puntitos rebotando y no
  // podía distinguir "está trabajando" de "se colgó".
  const [progreso, setProgreso] = useState("");
  /**
   * Cuántos segundos lleva esperando el turno actual.
   *
   * Un pedido de anuncio tarda ~98 s (medido el 2026-08-30). Con solo tres
   * puntitos rebotando, el admin no puede distinguir "va por la mitad" de "se
   * colgó hace un minuto" -- y lo que hace es recargar la página, que corta el
   * turno justo antes de que llegue la respuesta.
   *
   * El número no acelera nada, pero convierte una espera muda en una espera
   * que se entiende.
   */
  const [segundos, setSegundos] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Cómo se para a Atlas.
   *
   * Reportado el 2026-09-03 con la captura: "no hay forma de detener a Atlas,
   * se queda trabajando y si uno quiere detenerlo no se puede porque no hay
   * cómo". Y era exacto: mientras el turno corría, el botón de enviar se
   * volvía un spinner DESHABILITADO. La única salida era recargar -- que no
   * para nada, solo deja de mirar.
   *
   * Hacen falta las dos cosas, y por eso son dos:
   *
   *  · `cortarRef` aborta el fetch de ESTA pantalla, para que el botón
   *    responda en el acto y no cuando termine el tramo.
   *  · `detenidoRef` frena el encadenado automático. Es lo que más importa:
   *    la página encadena hasta CUATRO continuaciones sola, así que sin esto
   *    abortar una sola llamada no servía de nada -- arrancaba la siguiente.
   *
   * Y además se le avisa al servidor (`/detener`), que es el único que puede
   * dejar de gastar el turno de verdad. Abortar acá cierra la conexión, no el
   * trabajo del otro lado.
   *
   * Es un ref y no estado a propósito: lo leen bucles que ya están corriendo,
   * y un `useState` les dejaría el valor viejo de su render.
   */
  const cortarRef = useRef<AbortController | null>(null);
  const detenidoRef = useRef(false);
  // La caja de escribir crece con lo que se escribe. Ver el hook: acá
  // había un comentario prometiéndolo y ni una línea que lo hiciera.
  const textareaRef = useCajaQueCrece(input);

  // El cronómetro corre solo mientras se espera, y se reinicia en cada turno.
  useEffect(() => {
    if (!loading) { setSegundos(0); return; }
    const desde = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // El hilo vive en el servidor (architect_memory). Al montar la página lo
  // restauramos para que cambiar de sección no borre la conversación.
  //
  // ── Y si Atlas todavía está trabajando, se lo espera ────────────────────
  //
  // El admin lo describió así: *"si me salgo se pega, y también me pide que le
  // dé la información de nuevo"*.
  //
  // El servidor ya hacía su parte desde el 2026-08-30: cerrar la pestaña no
  // cancela el turno, sigue hasta el final y guarda la respuesta. Lo que
  // faltaba estaba de este lado: al volver se leía el historial UNA vez y se
  // paraba. Si el turno seguía corriendo, lo último guardado era el mensaje
  // del admin y nada más -- así que veía su propio pedido sin respuesta, sin
  // ningún indicio de que algo estaba pasando, y lo lógico era concluir que se
  // colgó y escribirlo de nuevo. Pagando el turno dos veces.
  //
  // Ahora, si lo último guardado es del admin, es que la respuesta está en
  // camino: se muestra el indicador de siempre y se relee el historial hasta
  // que aparezca. No hace falta ningún estado nuevo en el servidor -- la
  // respuesta se guarda igual, solo había que ir a buscarla.
  useEffect(() => {
    let cancelled = false;

    const leerHistorial = async () => {
      const res = await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    };

    const pintar = (history: any[]) =>
      setMessages([
        { role: "assistant", content: GREETING.operator, at: Date.now() },
        ...history.map((t: any) => ({ role: t.role, content: t.content, at: typeof t.at === "number" ? t.at : undefined })),
      ]);

    (async () => {
      try {
        const data = await leerHistorial();
        if (cancelled || !Array.isArray(data.history) || data.history.length === 0) return;
        pintar(data.history);
        if (data.awaitingConfirmation) {
          toast.info("Tienes un plan pendiente de confirmar");
        }

        // ── Quedó a medio hacer: se sigue, no se espera a que lo pida ────
        //
        // El encadenado de continuaciones vive en ESTA página. Si el admin se
        // fue, murió con ella: el servidor terminó el tramo que estaba
        // corriendo, lo guardó como parcial, y ahí quedó. Al volver veía un
        // mensaje diciendo que seguía trabajando... y nadie seguía.
        //
        // Se retoma solo. Escribirlo a mano no solo es innecesario: arranca un
        // turno NUEVO y paga la vuelta entera otra vez.
        if (data.hayAlgoPendiente) {
          void seguirPendiente(data.history);
          return;
        }

        if (data.history[data.history.length - 1]?.role !== "user") return;

        // Se reusa `loading` a propósito: prende el mismo indicador de
        // "escribiendo" con su cronómetro y bloquea el campo de escribir, que
        // es lo correcto -- mandar otro pedido encima del que está corriendo
        // los cruza.
        setLoading(true);
        setProgreso("Retomando lo que Atlas estaba haciendo");

        // Un turno pesado puede encadenar hasta 4 continuaciones de ~150s, así
        // que el techo son ~10 min. Pasado eso se suelta el campo en vez de
        // dejar al admin mirando un reloj para siempre: si de verdad se cayó,
        // tiene que poder volver a pedirlo.
        const CADA = 4000;
        const INTENTOS = 150;
        for (let i = 0; i < INTENTOS && !cancelled; i++) {
          await new Promise((r) => setTimeout(r, CADA));
          if (cancelled) return;
          let ahora: any;
          try {
            ahora = await leerHistorial();
          } catch {
            continue; // un error de red suelto no cancela la espera
          }
          const h = Array.isArray(ahora?.history) ? ahora.history : [];
          if (h.length === 0) continue;
          if (h[h.length - 1]?.role === "assistant") {
            if (cancelled) return;
            pintar(h);
            setLoading(false);
            setProgreso("");
            return;
          }
        }
        if (cancelled) return;
        setLoading(false);
        setProgreso("");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Estuve un rato largo con esto y no llegué a terminarlo. ¿Lo intentamos de nuevo?",
            at: Date.now(),
          },
        ]);
      } catch {
        // sin historial: se queda el saludo
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const cargarSesiones = async () => {
    try {
      const r = await fetch("/api/code-agent/sessions", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setSesiones(Array.isArray(d.sesiones) ? d.sesiones : []);
    } catch { /* si no se pueden listar, el panel queda vacio */ }
  };

  const abrirSesion = (id: string) => {
    try { localStorage.setItem("atlas_sesion", id); } catch { /* modo privado */ }
    setSessionId(id);
    setPanelSesiones(false);
    setRestoring(true);
    setMessages([{ role: "assistant", content: GREETING[mode], at: Date.now() }]);
  };

  // Una charla NUEVA no borra la anterior: se abre otra sesion y la vieja
  // queda guardada. Ese era justamente el problema.
  const nuevaConversacion = () => {
    abrirSesion(`s-${Date.now()}`);
    toast.success("Conversación nueva. La anterior quedó guardada.");
  };

  const borrarSesion = async (id: string) => {
    try {
      await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      await cargarSesiones();
      if (id === sessionId) abrirSesion("default");
      toast.success("Conversación borrada");
    } catch {
      toast.error("No se pudo borrar");
    }
  };

  const resetConversation = async () => {
    try {
      await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE", credentials: "include" });
      setMessages([{ role: "assistant", content: GREETING[mode], at: Date.now() }]);
      toast.success("Conversación reiniciada");
    } catch {
      toast.error("No se pudo reiniciar");
    }
  };

  // Subir una imagen/archivo desde el chat (botón 📎) y dejar su URL lista para
  // que el Architect la use (ej: "asigna esta imagen al producto ...").
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Una imagen y un documento NO se procesan igual: la imagen se guarda y se
    // le pasa la URL a un modelo con vision; el documento se lee acá, se le
    // saca el texto y ese texto entra en la conversación. El archivo en sí no
    // se guarda -- interesa el contenido, no tenerlo dando vueltas.
    const esImagen = file.type.startsWith("image/");
    const limite = esImagen ? 8 : 15;
    if (file.size > limite * 1024 * 1024) {
      toast.error(`El archivo supera ${limite}MB`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      if (!esImagen) {
        const r = await fetch("/api/code-agent/upload-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: dataUrl, filename: file.name }),
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo leer el archivo");
        const SALTO = String.fromCharCode(10);
        setInput((prev) =>
          (prev ? prev + SALTO + SALTO : "") +
          `Te paso el contenido de "${d.nombre}" (${d.tipo})${d.recortado ? " — es largo, va la primera parte" : ""}:` +
          SALTO + SALTO + d.texto,
        );
        toast.success(d.resumen || "Archivo leído");
        return;
      }

      const res = await fetch("/api/code-agent/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, filename: file.name }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al subir");
      const data = await res.json();
      setInput((prev) => (prev ? prev + "\n\n" : "") + `Usa esta imagen:\n![Imagen subida](${data.url})`);
      toast.success("Imagen subida ✓ — dime a qué producto asignarla");
    } catch (err: any) {
      toast.error(err.message || "No se pudo subir la imagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setMessages([{ role: "assistant", content: GREETING[m], at: Date.now() }]);
  };

  // Quien usa esto no es programador: un pedido pesado (investigar + armar
  // una campaña, por ejemplo) puede necesitar más de un turno internamente
  // porque el proxy corta la conexión a los ~150s -- pero eso es un detalle
  // de infraestructura, no algo que el admin tenga que resolver escribiendo
  // "continuá" él mismo. Si el backend marca needsContinuation, se sigue
  // solo (silencioso, sin mensaje de usuario nuevo, el indicador de
  // "escribiendo" queda prendido todo el tiempo) hasta un tope razonable de
  // vueltas -- nunca se le muestra al admin nada que suene a error técnico.
  const MAX_AUTO_CONTINUATIONS = 4;
  const CONTINUAR = "Continuá con lo que ya tenías, sin repetir lo que ya investigaste o hiciste.";

  /**
   * Se acabaron las continuaciones automáticas: recién ACÁ tiene sentido
   * pedirle al admin que lo pida él.
   *
   * El servidor decía "decime *continuá* y sigo desde donde iba" en CADA
   * tramo cortado -- mientras esta misma página ya lo estaba continuando
   * sola, hasta cuatro veces. El admin lo vio el 2026-09-03 y lo leyó como
   * que Atlas se había colgado. Y si le hacía caso, escribir "continuá"
   * arrancaba un turno nuevo y pagaba la vuelta otra vez.
   */
  const avisarQueHayQuePedirlo = (data: any) => {
    if (!data?.needsContinuation) return;
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        at: Date.now(),
        content: "Este pedido está llevando bastante más de lo normal. Si querés que siga, decime **continuá**.",
      },
    ]);
  };
  // El backend igual recorta a los últimos 30 turnos (defensa real contra
  // colgadas en hilos largos, ver code-agent.ts) -- este límite acá evita
  // mandar un payload gigante de entrada en primer lugar en conversaciones
  // de varios días como la que causó el cuelgue original (2026-08-10).
  const HISTORY_LIMIT = 30;

  const callAtlas = async (promptText: string, historyForCall: { role: string; content: string }[]) => {
    const esOperador = mode === "operator";
    // Corte al motor nuevo (2026-08-12). Medido en vivo con el MISMO pedido
    // ("investigá la competencia y creá el anuncio"): la ruta vieja
    // `/operator` devolvió 502 a los 79s -- el "No pude terminar de responder"
    // que reportó el admin -- mientras `/operator-opencode` lo resolvió en
    // 27-47s con datos reales, repetidas veces. Además el motor nuevo trae los
    // candados que la vieja no tiene: investigación disparada por el servidor
    // (no por la promesa del modelo), aviso automático si afirma haber
    // investigado sin hacerlo, aviso si escribió algo y no lo guardó, y solo
    // las herramientas del pedido en vez de las 34 (que era lo que lo hacía
    // tardar 69s en algo tan simple como listar 3 productos).
    const endpoint = esOperador ? "/api/code-agent/operator-opencode" : "/api/code-agent/architect";
    // Un controlador por llamada: el encadenado hace varias seguidas, y
    // reusar el mismo dejaría abortada la segunda antes de empezar.
    const controlador = new AbortController();
    cortarRef.current = controlador;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Solo el operador emite progreso; el modo Agente responde de una.
      body: JSON.stringify({ prompt: promptText, history: historyForCall, sessionId, ...(esOperador ? { stream: true } : {}) }),
      credentials: "include",
      signal: controlador.signal,
    });
    if (!res.ok) {
      await res.json().catch(() => null);
      throw new Error(`status ${res.status}`);
    }

    // Si el servidor no habla SSE (versión anterior desplegada, o el modo
    // Agente) se lee como JSON normal: el frontend nuevo sigue andando contra
    // un backend viejo, sin quedarse esperando un stream que no va a llegar.
    const tipo = res.headers.get("content-type") || "";
    if (!tipo.includes("text/event-stream") || !res.body) return res.json();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let resultado: any = null;

    // Formato SSE: bloques separados por línea en blanco, con "event:" y
    // "data:". Se acumula en un buffer porque un bloque puede llegar partido
    // entre dos trozos de red.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const bloques = buffer.split("\n\n");
      buffer = bloques.pop() || "";
      for (const bloque of bloques) {
        const evento = /^event:\s*(.+)$/m.exec(bloque)?.[1]?.trim();
        const datos = /^data:\s*(.+)$/m.exec(bloque)?.[1];
        if (!datos) continue;
        let payload: any;
        try { payload = JSON.parse(datos); } catch { continue; }
        if (evento === "progress" && payload?.texto) setProgreso(String(payload.texto));
        // Una parte del pedido que ya está terminada. Entra al chat como un
        // mensaje más, sin cerrar el turno: Atlas sigue con la parte siguiente
        // y el indicador queda prendido.
        //
        // Antes las partes se acumulaban y salían todas juntas al final, así
        // que un turno que se cortaba en la tercera entregaba CERO -- las dos
        // que ya estaban hechas se perdían con él. Ahora lo entregado queda
        // entregado.
        else if (evento === "avance" && payload?.reply) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: String(payload.reply), at: Date.now() },
          ]);
        }
        else if (evento === "result") resultado = payload;
        else if (evento === "error") throw new Error(payload?.error || "turno interrumpido");
      }
    }
    // Se cortó el stream sin resultado (se cayó la red a mitad de camino):
    // se trata como fallo para que salte el mensaje amable de reintentar, en
    // vez de mostrar una respuesta vacía como si hubiera terminado bien.
    if (!resultado) throw new Error("stream sin resultado");
    return resultado;
  };

  /**
   * Retoma un pedido que quedó cortado por tiempo.
   *
   * Es el mismo encadenado que hace `handleSubmit`, pero arrancando desde lo
   * que ya está guardado en vez de desde un mensaje nuevo del admin.
   */
  const seguirPendiente = async (historyGuardado: any[]) => {
    setLoading(true);
    setProgreso("Retomando tu pedido donde había quedado");
    detenidoRef.current = false;
    try {
      let history = historyGuardado.slice(-HISTORY_LIMIT).map((m: any) => ({ role: m.role, content: m.content }));
      let data: any = null;
      for (let round = 0; round < MAX_AUTO_CONTINUATIONS && !detenidoRef.current; round++) {
        data = await callAtlas(CONTINUAR, history);
        const parcial: Message = {
          role: "assistant",
          at: Date.now(),
          content: data?.reply || "Sigo trabajando en esto...",
          configApplied: data?.configApplied,
          advancedFeaturesEnabled: data?.advancedFeaturesEnabled,
          actions: Array.isArray(data?.actions) ? data.actions : undefined,
        };
        setMessages((prev) => [...prev, parcial]);
        if (!data?.needsContinuation) return;
        history = [...history, { role: "assistant", content: parcial.content }].slice(-HISTORY_LIMIT);
      }
      avisarQueHayQuePedirlo(data);
    } catch {
      // Igual que en handleSubmit: si lo paró el admin, no se le ofrece
      // reintentar algo que acaba de pedir que no siga.
      setMessages((prev) => [
        ...prev,
        loDetuveYo()
          ? { role: "assistant" as const, content: "⏹️ Listo, lo detuve. Lo que ya se había hecho queda como estaba.", at: Date.now() }
          : { role: "assistant" as const, content: "No pude retomar lo que estaba haciendo. ¿Lo intentamos de nuevo?", at: Date.now() },
      ]);
    } finally {
      setLoading(false);
      setProgreso("");
    }
  };

  /**
   * El botón de parar.
   *
   * Hace las tres cosas que hacen falta, en este orden: frena el encadenado
   * (para que no arranque la vuelta siguiente), le avisa al servidor (que es
   * el único que puede dejar de gastar el turno) y recién ahí aborta la
   * conexión de esta pantalla.
   *
   * El aviso al servidor NO se espera con await antes de abortar: si el
   * backend tarda en contestar, el admin seguiría mirando el spinner después
   * de haber apretado, que es justo lo que se está arreglando.
   */
  const detener = () => {
    if (!loading) return;
    detenidoRef.current = true;
    setProgreso("Deteniendo…");
    fetch("/api/code-agent/operator-opencode/detener", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      credentials: "include",
    }).catch(() => {
      // Que falle el aviso no cambia lo que ve el admin: la pantalla corta
      // igual. Solo significa que el servidor termina el tramo que tenía.
    });
    cortarRef.current?.abort();
  };

  /**
   * ¿El fallo que acaba de saltar es "lo detuvo el admin"?
   *
   * Un fetch abortado tira `AbortError`, y sin distinguirlo el catch mostraba
   * "No pude responder, ¿lo intentamos de nuevo?" -- un mensaje de error para
   * algo que salió exactamente como se pidió.
   */
  const loDetuveYo = () => detenidoRef.current;

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg, at: Date.now() }]);
    setLoading(true);
    setProgreso("");
    // Cada pedido nuevo arranca sin la marca del anterior: si no, un turno
    // detenido dejaba a Atlas incapaz de encadenar nunca más en esta pantalla.
    detenidoRef.current = false;

    try {
      let history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
      let data = await callAtlas(userMsg, history);

      for (let round = 0; round < MAX_AUTO_CONTINUATIONS && data?.needsContinuation && !detenidoRef.current; round++) {
        const partial: Message = {
          role: "assistant",
          at: Date.now(),
          content: data.reply || "Sigo trabajando en esto...",
          configApplied: data.configApplied,
          advancedFeaturesEnabled: data.advancedFeaturesEnabled,
          actions: Array.isArray(data.actions) ? data.actions : undefined,
        };
        setMessages((prev) => [...prev, partial]);
        history = [...history, { role: "user", content: userMsg }, { role: "assistant", content: partial.content }].slice(-HISTORY_LIMIT);
        data = await callAtlas(CONTINUAR, history);
      }

      const newMsg: Message = {
        role: "assistant",
        at: Date.now(),
        content: data?.reply || (mode === "operator" ? "Listo." : "Configuración generada."),
        configApplied: data?.configApplied,
        advancedFeaturesEnabled: data?.advancedFeaturesEnabled,
        actions: Array.isArray(data?.actions) ? data.actions : undefined,
      };
      setMessages((prev) => [...prev, newMsg]);

      // Si después de las cuatro vueltas SIGUE pidiendo continuar, ahí sí se
      // le dice al admin -- porque ahora sí depende de él.
      avisarQueHayQuePedirlo(data);

      if (mode === "operator" && data?.actionsCount > 0) {
        toast.success(`${data.actionsCount} acción(es) ejecutada(s)`);
      } else if (data?.configApplied) {
        toast.success("Agente configurado");
      }
    } catch {
      // Detenerlo no es un fallo. Abortar el fetch tira `AbortError` y caía
      // acá, así que apretar el botón contestaba "no pude responder,
      // ¿intentamos de nuevo?" -- un mensaje de error para algo que salió
      // exactamente como se pidió, y encima invitando a repetir el pedido.
      if (loDetuveYo()) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            at: Date.now(),
            content: "⏹️ Listo, lo detuve. Lo que ya se había hecho queda como estaba.",
          },
        ]);
      } else {
        // Nunca se muestra el mensaje técnico crudo (network error, status
        // HTTP, etc.) -- para un admin no programador eso no significa nada,
        // solo lo asusta. Un tono neutral y una acción concreta (reintentar).
        setMessages((prev) => [...prev, { role: "assistant", content: "No pude terminar de responder. ¿Podés intentarlo de nuevo?", at: Date.now() }]);
      }
    } finally {
      setLoading(false);
      setProgreso("");
    }
  };

  // chatCompleto: Atlas es una pantalla de chat, no una tarjeta dentro de una
  // página. En móvil usa todo el alto disponible en vez de quedar encajonada
  // entre el padding de <main> y los 184px que reserva la barra inferior.
  return (
    <Layout chatCompleto>
      {/* Antes: h-[calc(100vh-12rem)] md:h-[calc(100vh-8rem)]. Medía contra
          100vh -- el viewport ENTERO -- y le restaba a mano un chrome que el
          Layout ya había descontado (header, padding de <main>, barra
          inferior en móvil). Esos 12rem/8rem eran una adivinanza fija: en
          cuanto la ventana era baja, la resta se comía casi todo y al área
          de mensajes le quedaban ~100px, cortando las respuestas a media
          frase.

          flex-1 hace que ocupe exactamente el espacio que <main> le da, sea
          el que sea -- el contenedor padre ya es flex-col con min-h-0. Y el
          min-h evita el otro extremo: en pantallas muy bajas el chat no se
          aplasta, mantiene un alto usable y es <main> el que scrollea. */}
      <div className="flex flex-col gap-2 md:gap-4 animate-enter flex-1 min-h-0 md:min-h-[24rem] h-full px-3 pt-3 md:px-0 md:pt-0">
        {/* En móvil el header va en UNA sola fila y sin subtítulo: ocupaba ~140px
            de los ~440px utiles de un celular, dejando el area de mensajes en
            ~300px. El subtitulo explica algo que ya se entiende al usarlo. */}
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base md:text-2xl font-bold tracking-tight truncate">Atlas VentasPro</h1>
                <HelpTourButton guide={HELP_GUIDE} />
              </div>
              <p className="hidden md:block text-muted-foreground text-xs md:text-sm truncate">Tu asistente para operar la app con lenguaje natural</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* "Nueva" ya NO borra la charla actual: abre otra y la anterior
                queda guardada. El boton de historial es el que faltaba para
                poder volver a cualquiera. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPanelSesiones((v) => !v); if (!panelSesiones) cargarSesiones(); }}
              className="h-8 sm:h-9 text-xs px-2 sm:px-3"
              title="Conversaciones guardadas"
            >
              <History className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Historial</span>
            </Button>
            <Button variant="outline" size="sm" onClick={nuevaConversacion} className="h-8 sm:h-9 text-xs px-2 sm:px-3">
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Nueva</span>
            </Button>
            <div data-tour="code-agent-mode-toggle" className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
              <button
                onClick={() => switchMode("operator")}
                className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${mode === "operator" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Wrench className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Operador</span><span className="sm:hidden">Op.</span>
              </button>
              <button
                onClick={() => switchMode("agent")}
                className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${mode === "agent" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Agente</span><span className="sm:hidden">Ag.</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel de conversaciones guardadas.
            Se despliega sobre el chat en vez de ocupar una columna fija: en un
            celular una columna lateral se come la mitad del ancho, y esto se
            usa para saltar a una charla y cerrarse, no para tenerlo abierto. */}
        {panelSesiones && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <p className="text-sm font-semibold">Conversaciones guardadas</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanelSesiones(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sesiones.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Todavía no hay conversaciones guardadas.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {sesiones.map((s) => (
                  <div
                    key={s.sessionId}
                    className={`flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 transition-colors ${s.sessionId === sessionId ? "bg-muted/60" : ""}`}
                  >
                    <button
                      onClick={() => abrirSesion(s.sessionId)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{s.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.mensajes} mensaje{s.mensajes === 1 ? "" : "s"}
                        {s.ultimoMensaje ? ` · ${new Date(s.ultimoMensaje).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        {s.sessionId === sessionId ? " · abierta" : ""}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Borrar esta conversación"
                      onClick={() => borrarSesion(s.sessionId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col border border-border rounded-2xl bg-card overflow-hidden shadow-sm min-h-0">
            {/* El viewport interno de Radix es un `display:table` con
                min-width:100%, y una tabla NO respeta el ancho del padre:
                crece con su contenido. Por eso los mensajes largos --ids de
                Meta, enlaces, bloques de codigo-- empujaban el chat hacia el
                costado en vez de bajar de renglon. Forzarlo a `block` con
                min-w-0 lo devuelve al ancho real disponible. */}
            {/* Lectura tipo ChatGPT, no burbujas de mensajería.
                Pedido del admin: "a veces me cuesta usar el chat de Atlas por
                ser muy sencillo".

                Tres cambios que hacen la diferencia y no son estéticos:

                1. La RESPUESTA ocupa el ancho de una columna de lectura, sin
                   burbuja. Una burbuja al 88% con un informe adentro --que es
                   lo que Atlas devuelve: tablas, listas, planes-- obliga a
                   leer en zigzag. Sin burbuja y con una medida fija de línea
                   se lee de corrido.
                2. Solo el mensaje del ADMIN lleva burbuja, y va a la derecha:
                   es corto y así se distingue de un vistazo quién dijo qué.
                3. Cada turno se separa con una línea tenue en vez de aire
                   suelto: con respuestas largas, el aire solo no alcanza para
                   saber dónde termina una y empieza la otra. */}
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`group py-5 ${i > 0 ? "border-t border-border/50" : ""} ${msg.role === "user" ? "flex justify-end" : "flex gap-3 md:gap-4"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div className={`min-w-0 ${msg.role === "user" ? "max-w-[85%]" : "flex-1"}`}>
                      <div
                        className={
                          msg.role === "user"
                            ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
                            : ""
                        }
                      >
                        {/* break-words + overflow-wrap:anywhere: las respuestas traen URLs largas que sin esto no se pueden partir */}
                        {msg.role === "user" ? (
                          // El mensaje del admin NO pasa por `prose`. Antes usaba
                          // el mismo wrapper que la respuesta del bot, y Typography
                          // fija `color: var(--tw-prose-body)` (gris oscuro) sobre
                          // este div -- eso le ganaba al text-primary-foreground que
                          // hereda de la burbuja, así que quedaba texto casi negro
                          // sobre el fondo morado: ilegible. Además lo que escribe
                          // el admin es texto plano, no Markdown; con whitespace-
                          // pre-wrap se ve tal cual lo tipeó, saltos de línea
                          // incluidos.
                          <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="text-[15px] md:text-base prose prose-sm md:prose-base dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-p:leading-7 prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-img:rounded-lg prose-img:shadow-sm prose-a:text-indigo-500 hover:prose-a:text-indigo-600 prose-a:break-all prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-auto prose-pre:rounded-xl prose-code:break-words prose-table:block prose-table:overflow-x-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* La hora del mensaje. Alineada al lado que corresponde:
                          a la derecha lo que escribió el admin, a la izquierda
                          lo que contestó Atlas -- igual que en WhatsApp. */}
                      {msg.at && (
                        <div
                          title={cuandoExacto(msg.at)}
                          className={`mt-1 text-[11px] text-muted-foreground/70 tabular-nums ${msg.role === "user" ? "text-right" : ""}`}
                        >
                          {cuandoSeDijo(msg.at)}
                        </div>
                      )}

                      {/* Copiar la respuesta. Atlas devuelve copys de anuncios,
                          descripciones y planes: cosas que el admin quiere
                          llevarse a otro lado. Sin esto habia que seleccionar a
                          mano un texto largo dentro de un area que scrollea, que
                          en el celular es directamente imposible.
                          Aparece al pasar el mouse en escritorio y siempre en
                          celular, donde no hay hover. */}
                      {msg.role === "assistant" && msg.content && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content)
                              .then(() => toast.success("Copiado"))
                              .catch(() => toast.error("No se pudo copiar"));
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                          title="Copiar respuesta"
                        >
                          <Copy className="h-3.5 w-3.5" /> Copiar
                        </button>
                      )}

                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-2 rounded-xl border border-border bg-card/50 divide-y divide-border overflow-hidden shadow-xs">
                          {msg.actions.map((a, k) => (
                            <div key={k} className="flex items-start gap-2.5 px-3.5 py-2.5 text-xs md:text-sm">
                              <span
                                className={`mt-0.5 shrink-0 h-5 w-5 rounded-lg flex items-center justify-center ${a.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
                              >
                                {a.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">{a.tool}</span>
                              <span className="text-foreground/90 min-w-0 break-words [overflow-wrap:anywhere]">{a.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.configApplied && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs px-3 py-1">
                            <Check className="h-3 w-3 mr-1" /> Configuración aplicada
                          </Badge>
                          {msg.advancedFeaturesEnabled && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs px-3 py-1">
                              <Sparkles className="h-3 w-3 mr-1" /> Avanzado
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-1 shadow-sm">
                        <User className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3 md:gap-4 border-t border-border/50 py-5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex gap-2 shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce" />
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                        </div>
                        {/* El texto de progreso llega por SSE mientras Atlas
                            trabaja: sin él, un turno de 40s parecía colgado. */}
                        {progreso && (
                          <span className="text-sm text-muted-foreground break-words">{progreso}…</span>
                        )}
                        {/* Cuánto lleva. Un pedido de anuncio tarda ~98s: sin
                            este número, la espera se lee como una pantalla
                            colgada y el admin recarga justo antes del final. */}
                        {segundos > 2 && (
                          <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">
                            {segundos < 60
                              ? `${segundos}s`
                              : `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="px-3 pt-3 pb-4 md:p-4 border-t border-border bg-card/50">
              {/* La caja de escribir se alinea con la columna de lectura y
                  se apoya en un contenedor propio, como en ChatGPT: asi el ojo
                  no salta de ancho entre lo que lee y lo que escribe. */}
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="mx-auto flex w-full max-w-3xl gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {mode === "operator" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={loading || uploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Adjuntar imagen o documento (PDF, Word, Excel, PowerPoint)"
                    className="h-11 w-11 rounded-xl shrink-0"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                )}
                <div className="flex-1 relative" data-tour="code-agent-input">
                  {/* Campo que CRECE con lo que se escribe: el alto lo mide el
                      efecto de arriba, que es lo que faltaba. Crece hasta ~6
                      renglones y después scrollea solo.
                      Enter manda; Shift+Enter hace salto de línea. */}
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading && !restoring && input.trim()) handleSubmit();
                      }
                    }}
                    rows={1}
                    /* Corto a propósito: el anterior ocupaba dos renglones y
                       en un celular quedaba cortado por la mitad, tapado
                       además por el botón de enviar. Un ejemplo alcanza. */
                    placeholder={mode === "operator" ? "Ej: analizá el sistema o creá un producto…" : "Ej: creá un agente de ventas…"}
                    disabled={loading}
                    /* pr-14: el botón de enviar flota adentro de la caja, así
                       que el texto necesita ese margen o le pasa por debajo. */
                    className="flex-1 min-h-[52px] max-h-44 resize-none overflow-y-auto rounded-2xl border-border/70 bg-card pr-14 py-3.5 px-4 text-[15px] leading-relaxed shadow-sm focus-visible:ring-1"
                  />
                  {/* Mientras trabaja, el mismo botón es el de PARAR.
                      Antes acá había un spinner deshabilitado: el admin veía
                      el único control de la pantalla apagado justo cuando lo
                      necesitaba. Se queda en el mismo lugar a propósito --
                      es donde ya está el pulgar. */}
                  {loading ? (
                    <Button
                      type="button"
                      onClick={detener}
                      size="icon"
                      variant="destructive"
                      title="Detener a Atlas"
                      aria-label="Detener a Atlas"
                      className="absolute right-2 bottom-2 h-9 w-9 rounded-xl"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={restoring || !input.trim()}
                      size="icon"
                      className="absolute right-2 bottom-2 h-9 w-9 rounded-xl"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Empezar una conversación nueva?</AlertDialogTitle>
            <AlertDialogDescription>Se borrará el historial guardado de este chat con Atlas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={resetConversation}>Sí, empezar de nuevo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
