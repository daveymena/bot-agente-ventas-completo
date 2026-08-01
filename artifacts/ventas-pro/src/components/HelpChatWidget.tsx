import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  escalate?: boolean;
  whatsappPhone?: string | null;
}

/**
 * Asistente de ayuda flotante, disponible en todo el dashboard (y en /pricing,
 * que también usa <Layout>). Responde dudas sobre VentasPro mismo -- planes,
 * cómo funciona, facturación -- NO es el bot de ventas de cada tenant (ese
 * habla con los CLIENTES de cada negocio, este habla con quien usa/quiere
 * contratar la plataforma). Cuando el asistente no puede resolver algo,
 * ofrece un botón directo a WhatsApp en vez de dejar a la persona sin salida.
 */
export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Al cerrar (la persona ya terminó de preguntar) se limpia la conversación
  // sola, para que la próxima vez que se abra el widget arranque en blanco en
  // vez de mostrar la charla anterior ya resuelta. El delay es solo para que
  // no se vea el contenido vaciarse mientras el panel todavía está cerrando.
  const handleClose = () => {
    setOpen(false);
    setTimeout(() => setMessages([]), 300);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
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
      setMessages(prev => [...prev, { role: "assistant", content: data.reply, escalate: data.escalate, whatsappPhone: data.whatsappPhone }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Tuvimos un problema para responder. Intentá de nuevo.", escalate: true, whatsappPhone: null }]);
    } finally {
      setLoading(false);
    }
  };

  const waLink = (phone: string) => `https://wa.me/${phone}?text=${encodeURIComponent("Hola, vengo del asistente de ayuda de VentasPro y necesito hablar con alguien.")}`;

  return (
    <>
      {/* Tamaño fijo y compacto (no relativo al viewport, que en pantallas
          altas lo hacía enorme) -- 340x480, el estándar de un widget de
          chat tipo Intercom/HubSpot, no un panel que domina la pantalla.
          bottom-[152px] en mobile: la barra de navegación inferior
          (MobileNav) ocupa 72px + safe-area, el botón/ventana quedan por
          encima de eso, no debajo (se veían tapados/mezclados). */}
      {open && (
        <div className="fixed bottom-[152px] md:bottom-24 right-4 sm:right-6 z-50 w-[340px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-180px)] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden animate-enter">
          <div className="p-3.5 border-b bg-primary/5 flex items-center justify-between shrink-0">
            <div>
              <p className="font-bold text-sm">Asistente VentasPro</p>
              <p className="text-[11px] text-muted-foreground">Planes, funciones o facturación</p>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted" title="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                ¿En qué te puedo ayudar? Preguntame sobre planes, precios o cómo funciona VentasPro.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.content}
                  {m.role === "assistant" && m.escalate && m.whatsappPhone && (
                    <a
                      href={waLink(m.whatsappPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1.5 text-xs font-bold text-green-600 hover:text-green-700"
                    >
                      Hablar por WhatsApp <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t flex gap-2 shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Escribí tu pregunta..."
              className="flex-1 h-10 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
            <Button size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={send} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={() => (open ? handleClose() : setOpen(true))}
        className="fixed bottom-[88px] md:bottom-6 right-4 sm:right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform"
        title="Ayuda"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
