import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Sparkles, X, Send, Loader2, Phone, BookOpen, PlayCircle } from "lucide-react";
import { getHelpGuide } from "@/data/help-guides";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  escalate?: boolean;
  whatsappPhone?: string | null;
  suggestedGuideId?: string | null;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content: "¡Hola! 👋 ¿En qué te puedo ayudar? Preguntame sobre planes, precios o cómo funciona VentasPro.",
  time: "",
};

const SUGGESTIONS = [
  { label: "💳 Planes y precios", text: "¿Qué planes tienen y cuánto cuestan?" },
  { label: "📦 Cómo funciona", text: "¿Cómo funciona VentasPro?" },
];

function now() {
  return new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Cada página envuelve su contenido en su propio <Layout>, así que este
// componente se desmonta y se vuelve a montar en cada navegación -- sin
// esto, cambiar de sección durante una conversación la borraba de golpe.
// sessionStorage (no localStorage) porque el corte natural es "mientras
// dura la visita" -- se limpia sola al cerrar el widget (la persona ya
// terminó) o al cerrar la pestaña, no debe sobrevivir para siempre.
const SESSION_KEY = "vp-help-chat-messages";

function loadPersistedMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Asistente de ayuda flotante, disponible en todo el dashboard (y en /pricing,
 * que también usa <Layout>). Responde dudas sobre VentasPro mismo -- planes,
 * cómo funciona, facturación -- NO es el bot de ventas de cada tenant (ese
 * habla con los CLIENTES de cada negocio, este habla con quien usa/quiere
 * contratar la plataforma). Cuando el asistente no puede resolver algo,
 * ofrece un botón directo a WhatsApp en vez de dejar a la persona sin salida.
 *
 * Estilo tomado 1:1 del handoff de diseño (design_handoff_mobile_ui,
 * VentasPro.dc.html) -- degradado indigo, burbujas con hora, chips de
 * sugerencia, CTA de WhatsApp en pastilla verde. Mismo comportamiento de
 * siempre, solo cambió el vestido visual.
 */
/**
 * `ocultoEnMovil`: la pantalla ya tiene su propio campo de escritura abajo.
 *
 * El botón flotante vive en `bottom: 132px`, y en una pantalla de chat esos
 * 132px caen JUSTO sobre la caja de escribir --que ocupa de los 72px de la
 * barra hasta unos 160px--. Se veía en un celular el 2026-09-02: la burbuja
 * de ayuda tapaba media caja de texto de Atlas.
 *
 * No se resuelve moviéndolo: cualquier lugar por encima de la barra pisa la
 * caja, y por debajo pisa la barra. En una pantalla que YA es un chat, el
 * botón para abrir otro chat encima no aporta nada. En escritorio no hay
 * conflicto --va abajo a la derecha, lejos de todo-- así que ahí se queda.
 */
export function HelpChatWidget({ ocultoEnMovil = false }: { ocultoEnMovil?: boolean } = {}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadPersistedMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    try {
      if (messages.length > 0) sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } catch {
      // Modo privado u otro caso donde sessionStorage no está disponible --
      // la conversación simplemente no sobrevive a la navegación, sin romper nada.
    }
  }, [messages]);

  // Al cerrar (la persona ya terminó de preguntar) se limpia la conversación
  // sola, para que la próxima vez que se abra el widget arranque en blanco en
  // vez de mostrar la charla anterior ya resuelta. El delay es solo para que
  // no se vea el contenido vaciarse mientras el panel todavía está cerrando.
  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setMessages([]);
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }, 300);
  };

  const handleToggle = () => {
    if (open) { handleClose(); return; }
    setHasOpenedOnce(true);
    setOpen(true);
  };

  const sendText = async (text: string) => {
    if (!text.trim() || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text, time: now() }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply, time: now(), escalate: data.escalate, whatsappPhone: data.whatsappPhone, suggestedGuideId: data.suggestedGuideId }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Tuvimos un problema para responder. Intentá de nuevo.", time: now(), escalate: true, whatsappPhone: null }]);
    } finally {
      setLoading(false);
    }
  };

  const send = () => sendText(input);

  const waLink = (phone: string) => `https://wa.me/${phone}?text=${encodeURIComponent("Hola, vengo del asistente de ayuda de VentasPro y necesito hablar con alguien.")}`;

  const displayMessages = messages.length === 0 ? [GREETING] : messages;

  return (
    <>
      {/* Tamaño y posición: 368x520 con techos por viewport, igual al mockup.
          bottom-[calc(220px+...)] en mobile: la barra de navegación inferior
          (MobileNav) ocupa 72px + safe-area, el botón/ventana quedan por
          encima de eso, no debajo (se veían tapados/mezclados) -- no tocar
          estos valores al restylear. */}
      {open && (
        // En móvil se abre a PANTALLA COMPLETA, no como tarjeta flotante.
        // Antes usaba un tamaño fijo de escritorio (368x520) metido en una
        // pantalla de 375px: quedaba encimado sobre las tarjetas del panel y
        // sobre la barra de navegación de abajo, con un área de mensajes de
        // ~110px de alto. Un chat necesita la pantalla; superponerlo a medias
        // es lo peor de los dos mundos. z-50 para quedar POR ENCIMA de la
        // barra inferior, no debajo.
        <div className="fixed inset-0 z-50 w-full h-[100dvh] rounded-none md:inset-auto md:bottom-24 md:right-4 lg:right-6 md:z-40 md:w-[368px] md:h-[520px] md:max-h-[calc(100vh-240px)] md:rounded-[22px] bg-white border border-[#eef1f6] shadow-[0_30px_70px_-14px_rgba(15,23,42,0.4)] flex flex-col overflow-hidden animate-enter">
          {/* Header */}
          <div className="relative overflow-hidden shrink-0 px-5 py-[18px] flex items-center justify-between bg-[linear-gradient(135deg,#4338ca,#6d5ef0_60%,#4f46e5)]">
            <div className="absolute -top-[30px] -right-5 w-[120px] h-[120px] rounded-full bg-white/[0.08]" />
            <div className="relative flex items-center gap-[11px]">
              <div className="relative w-[38px] h-[38px] rounded-xl bg-white/[0.18] shadow-[0_0_0_3px_rgba(255,255,255,0.12)] flex items-center justify-center shrink-0">
                <Sparkles className="w-[18px] h-[18px] text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] rounded-full bg-[#4ade80] border-2 border-[#4338ca]" />
              </div>
              <div>
                <p className="m-0 text-[14.5px] font-bold text-white tracking-tight">Asistente VentasPro</p>
                <p className="m-0 mt-0.5 text-[11.5px] text-[#dcd9fc]">● En línea · responde al instante</p>
              </div>
            </div>
            <button onClick={handleClose} className="relative text-white p-1.5 rounded-lg hover:bg-white/15 transition-colors" title="Cerrar">
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-3.5 bg-[#f6f7fb]">
            {displayMessages.map((m, i) => (
              <div key={i} className={`flex gap-[9px] ${m.role === "user" ? "justify-end" : "items-end"}`}>
                {m.role === "assistant" && (
                  <div className="w-[26px] h-[26px] shrink-0 rounded-lg bg-[#4f46e5] flex items-center justify-center">
                    <Sparkles className="w-[13px] h-[13px] text-white" />
                  </div>
                )}
                <div className={`flex flex-col gap-1 max-w-[82%] ${m.role === "user" ? "items-end" : ""}`}>
                  <div
                    className={`px-3.5 py-[11px] text-[13.5px] leading-[1.55] whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#4f46e5] text-white rounded-[16px_4px_16px_16px] shadow-[0_2px_8px_rgba(79,70,229,0.25)]"
                        : "bg-white text-[#0f172a] rounded-[4px_16px_16px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.time && <span className={`text-[10.5px] text-[#9aa3b4] ${m.role === "user" ? "pr-0.5" : "pl-0.5"}`}>{m.time}</span>}

                  {m.role === "assistant" && m.suggestedGuideId && (() => {
                    const guide = getHelpGuide(m.suggestedGuideId);
                    if (!guide) return null;
                    const hasTour = guide.steps.some(s => s.tourTarget);
                    return (
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        <button
                          onClick={() => { handleClose(); setLocation(`/ayuda?guide=${guide.id}`); }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4338ca] bg-[#eef0fe] rounded-full px-3 py-1.5 w-fit hover:bg-[#e2e5fc] transition-colors"
                        >
                          <BookOpen className="w-3 h-3 shrink-0" /> Ver guía: {guide.title}
                        </button>
                        {hasTour && guide.route && (
                          <button
                            onClick={() => { handleClose(); setLocation(`${guide.route}?tour=${guide.id}`); }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4338ca] bg-[#eef0fe] rounded-full px-3 py-1.5 w-fit hover:bg-[#e2e5fc] transition-colors"
                          >
                            <PlayCircle className="w-3 h-3 shrink-0" /> Mostrarme en la app
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {m.role === "assistant" && m.escalate && m.whatsappPhone && (
                    <a
                      href={waLink(m.whatsappPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16a34a] bg-[#eafaf0] rounded-full px-3 py-[7px] w-fit mt-0.5 hover:bg-[#dcf5e6] transition-colors"
                    >
                      <Phone className="w-3 h-3" /> Hablar por WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-[9px] items-end">
                <div className="w-[26px] h-[26px] shrink-0 rounded-lg bg-[#4f46e5] flex items-center justify-center">
                  <Sparkles className="w-[13px] h-[13px] text-white" />
                </div>
                <div className="bg-white rounded-[4px_16px_16px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.06)] px-3.5 py-[11px]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#4f46e5]" />
                </div>
              </div>
            )}
          </div>

          {/* Chips + input */}
          <div className="shrink-0 bg-white border-t border-[#eef1f6] px-4 pt-3 pb-3.5">
            {messages.length === 0 && (
              <div className="flex gap-[7px] mb-2.5 overflow-x-auto">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => sendText(s.text)}
                    className="shrink-0 text-xs font-semibold text-[#4338ca] bg-[#eef0fe] hover:bg-[#e2e5fc] transition-colors rounded-full px-3 py-1.5 whitespace-nowrap"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 bg-[#f6f7fb] border border-[#e9ecf3] rounded-full pl-4 pr-1 py-1">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Escribí tu pregunta..."
                className="flex-1 h-9 bg-transparent border-none outline-none text-[13.5px] text-[#0f172a] placeholder:text-[#9aa3b4]"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="shrink-0 w-9 h-9 rounded-full bg-[#4f46e5] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#4338ca] transition-colors"
              >
                <Send className="w-[15px] h-[15px]" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleToggle}
        className={`fixed bottom-[calc(132px+env(safe-area-inset-bottom))] md:bottom-6 right-4 sm:right-6 z-40 w-[60px] h-[60px] rounded-full bg-[linear-gradient(135deg,#4338ca,#4f46e5)] shadow-[0_14px_32px_-8px_rgba(79,70,229,0.5)] items-center justify-center hover:scale-[1.06] transition-transform ${ocultoEnMovil ? "hidden md:flex" : "flex"}`}
        title="Ayuda"
      >
        {open ? <X className="w-[25px] h-[25px] text-white" /> : <Sparkles className="w-[25px] h-[25px] text-white" />}
        {!open && !hasOpenedOnce && (
          <span className="absolute top-[-2px] right-[-2px] w-4 h-4 rounded-full bg-[#ef4444] border-2 border-white" />
        )}
      </button>
    </>
  );
}
