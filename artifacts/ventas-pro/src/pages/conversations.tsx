import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { format, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { 
  useListConversations, getListConversationsQueryKey,
  useGetConversation, getGetConversationQueryKey,
  useListMessages, getListMessagesQueryKey,
  useSendMessage,
  useHandoffConversation,
  useUpdateConversation,
  useListProducts, getListProductsQueryKey
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCajaQueCrece } from "@/hooks/use-caja-que-crece";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, User, Bot, Search, Phone, ArrowLeft, MessageSquare, Check, X, Tag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("conversations")!;

export default function Conversations() {
  useAutoTour(HELP_GUIDE);
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const selectedId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState("");
  // La caja de respuesta crece con lo que se escribe. Tope mas bajo que el de
  // Atlas (max-h-40): aca el historial del cliente es lo que hay que tener a la
  // vista para poder contestarle.
  const cajaDeRespuesta = useCajaQueCrece(messageText, 160);

  const { data: conversations, isLoading: loadingConversations } = useListConversations(
    { search: search || undefined },
    { query: { refetchInterval: 3000, queryKey: getListConversationsQueryKey({ search: search || undefined }) } }
  );

  const { data: activeConv, isLoading: loadingActiveConv } = useGetConversation(
    selectedId!,
    { query: { enabled: !!selectedId, refetchInterval: 3000, queryKey: getGetConversationQueryKey(selectedId!) } }
  );

  const { data: messages, isLoading: loadingMessages } = useListMessages(
    selectedId!,
    { query: { enabled: !!selectedId, refetchInterval: 3000, queryKey: getListMessagesQueryKey(selectedId!) } }
  );

  const { data: products } = useListProducts({
    query: { queryKey: getListProductsQueryKey(), staleTime: 1000 * 60 * 5 }
  });

  const sendMessage = useSendMessage();
  const handoff = useHandoffConversation();
  const updateConv = useUpdateConversation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!messageText.trim() || !selectedId) return;
    const text = messageText;
    setMessageText("");
    
    sendMessage.mutate({ id: selectedId, data: { content: text, asHuman: true } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(selectedId) });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      },
      onError: () => {
        toast.error("Error al enviar mensaje");
        setMessageText(text); // restore
      }
    });
  };

  const handleHandoff = (target: "human" | "ai") => {
    if (!selectedId) return;
    handoff.mutate({ id: selectedId, data: { target } }, {
      onSuccess: () => {
        toast.success(`Control asignado a ${target === "human" ? "Operador humano" : "Agente IA"}`);
        queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(selectedId) });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      },
      onError: () => toast.error("Error al cambiar control")
    });
  };

  const closeConversation = () => {
    if (!selectedId) return;
    updateConv.mutate({ id: selectedId, data: { status: "closed" } }, {
      onSuccess: () => {
        toast.success("Conversación cerrada");
        setLocation("/conversations");
      }
    });
  };

  const renderMessageContent = (content: string) => {
    // Detect all [CARD: <id>] markers in the content (may be mixed with text)
    const cardRegex = /\[CARD:\s*(\d+)\]/gi;
    const hasCard = cardRegex.test(content);

    if (hasCard && products) {
      // Split content into parts: text and cards
      const parts: Array<{ type: 'text'; value: string } | { type: 'card'; productId: number }> = [];
      let lastIndex = 0;
      const re = /\[CARD:\s*(\d+)\]/gi;
      let m: RegExpExecArray | null;

      while ((m = re.exec(content)) !== null) {
        if (m.index > lastIndex) {
          const text = content.slice(lastIndex, m.index).trim();
          if (text) parts.push({ type: 'text', value: text });
        }
        parts.push({ type: 'card', productId: parseInt(m[1], 10) });
        lastIndex = m.index + m[0].length;
      }
      const remaining = content.slice(lastIndex).trim();
      if (remaining) parts.push({ type: 'text', value: remaining });

      return (
        <div className="flex flex-col gap-3">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              return <p key={i} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{part.value}</p>;
            }
            const product = products.find(p => p.id === part.productId);
            if (!product) return null;

            let meta: Record<string, string> = {};
            try { meta = JSON.parse((product as any).metadata || "{}"); } catch {}

            const features: string[] = (product as any).features ?? [];
            const imageUrl = product.imageUrl || getProductImageFallback(product.name);

            return (
              <div key={i} className="rounded-2xl overflow-hidden border border-border/60 shadow-md bg-card w-full max-w-full sm:max-w-[320px]">
                {/* Product Image */}
                <div className="relative w-full h-36 sm:h-44 bg-muted overflow-hidden">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tag className="h-10 w-10 text-muted-foreground opacity-30" />
                    </div>
                  )}
                  {/* Kind badge */}
                  {(product as any).kind === 'digital' && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">⚡ Digital</div>
                  )}
                  {(product as any).kind === 'physical' && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">📦 Físico</div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                  {/* Title */}
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-primary uppercase tracking-widest leading-none mb-1">
                      {product.highlight || "Curso Online"}
                    </p>
                    <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight break-words">{product.name}</h3>
                    {product.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{product.description}</p>
                    )}
                  </div>

                  {/* Features */}
                  {features.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">✨ Incluye:</p>
                      {features.slice(0, 4).map((f, fi) => (
                        <div key={fi} className="flex items-start gap-1.5 text-xs text-foreground/80">
                          <span className="text-green-500 mt-0.5 shrink-0">✅</span>
                          <span className="break-words">{f}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Content stats */}
                  {(meta.sections || meta.classes || meta.duration) && (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-muted/50 rounded-xl p-2 sm:p-2.5">
                      {meta.sections && (
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground">📖 {meta.sections}</p>
                          <p className="text-[8px] sm:text-[9px] text-muted-foreground uppercase tracking-wide">secciones</p>
                        </div>
                      )}
                      {meta.classes && (
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground">🎬 {meta.classes}</p>
                          <p className="text-[8px] sm:text-[9px] text-muted-foreground uppercase tracking-wide">clases</p>
                        </div>
                      )}
                      {meta.duration && (
                        <div className="text-center">
                          <p className="text-xs sm:text-sm font-bold text-foreground">⏱️ {meta.duration.split(' ')[0]}</p>
                          <p className="text-[8px] sm:text-[9px] text-muted-foreground uppercase tracking-wide">duración</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Price */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">💰 Precio</p>
                      <p className="text-base sm:text-lg font-extrabold text-foreground break-words">
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: product.currency || 'COP', maximumFractionDigits: 0 }).format(Number(product.price))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">⚡ Acceso</p>
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400">Inmediato</p>
                    </div>
                  </div>

                  {/* CTA */}
                  <p className="text-xs text-center text-muted-foreground pt-1">👉 ¿Te gustaría adquirirlo? 😊</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</p>;
  };

  /**
   * Imagen de respaldo para un producto sin foto cargada.
   *
   * Antes esto era un mapa fijo de fotos de Unsplash (una por palabra clave:
   * piano, guitarra, trading...). Dos problemas: son fotos de terceros
   * incrustadas desde su servidor -- material ajeno dentro de un producto que
   * se vende -- y encima ni siquiera correspondían al producto real del
   * cliente, solo al tema. Ahora se dibuja una tarjeta propia, con la inicial
   * y el nombre del producto sobre un color derivado de su propio nombre
   * (mismo nombre = siempre el mismo color, no parpadea entre recargas).
   *
   * Para una imagen REAL del producto está la generación con IA del formulario
   * de Productos (ver handleGenerateImage en products.tsx), que la crea a
   * partir del nombre y la descripción y la guarda como imagen propia.
   */
  function getProductImageFallback(name: string): string {
    const limpio = (name || "Producto").trim() || "Producto";
    // Hash estable del nombre -> tono fijo. Sin Math.random(): con una
    // aleatoria, la misma tarjeta cambiaba de color en cada render.
    let hash = 0;
    for (let i = 0; i < limpio.length; i++) hash = (hash * 31 + limpio.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const inicial = limpio[0].toUpperCase();
    const corto = limpio.length > 22 ? `${limpio.slice(0, 21)}…` : limpio;
    const escapar = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 70% 55%)"/><stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 70% 40%)"/>
</linearGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>
<text x="400" y="380" font-family="system-ui,-apple-system,sans-serif" font-size="260" font-weight="700" fill="rgba(255,255,255,.92)" text-anchor="middle">${escapar(inicial)}</text>
<text x="400" y="510" font-family="system-ui,-apple-system,sans-serif" font-size="44" fill="rgba(255,255,255,.85)" text-anchor="middle">${escapar(corto)}</text>
</svg>`;
    // encodeURIComponent (no btoa): btoa rompe con acentos y eñes, comunes acá.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const getStageGradient = (stage?: string | null) => {
    switch(stage?.toLowerCase()) {
      case 'saludo': return 'from-blue-500/20 to-cyan-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case 'calificación': return 'from-purple-500/20 to-pink-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30';
      case 'presentación': return 'from-orange-500/20 to-amber-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30';
      case 'cierre': return 'from-green-500/20 to-emerald-500/20 text-green-700 dark:text-green-300 border-green-500/30';
      case 'seguimiento': return 'from-teal-500/20 to-emerald-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30';
      default: return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  // La lista de burbujas, memorizada. Lo que se escribe en la caja vive en
  // el estado de esta pantalla: sin esto, cada letra volvía a formatear la
  // fecha de CADA mensaje (parseISO + format con locale) y a rearmar las
  // fichas de producto. En el celular eso se sentía como teclado lento
  // (reporte del dueño 24-09-2026; mismo arreglo que el chat de Atlas).
  const burbujas = useMemo(() => (Array.isArray(messages) ? messages : []).map((msg, idx) => {
      const prevMsg = messages[idx - 1];
      const showDate = !prevMsg || !isSameDay(parseISO(msg.createdAt), parseISO(prevMsg.createdAt));
      
      const isCustomer = msg.role === 'customer';
      const isAgent = msg.role === 'agent';
      const isHuman = msg.role === 'human';

      return (
        <div key={msg.id}>
          {showDate && (
            <div className="flex justify-center my-8">
              <span className="text-xs font-semibold bg-background/60 backdrop-blur-sm px-4 py-1.5 rounded-full text-muted-foreground border shadow-sm">
                {format(parseISO(msg.createdAt), "EEEE d 'de' MMMM", { locale: es })}
              </span>
            </div>
          )}
          
          <div className={`flex flex-col mb-2 ${isCustomer ? 'items-end' : 'items-start'}`}>
            <div className={`flex items-end gap-2 min-w-0 max-w-[95%] sm:max-w-[85%] md:max-w-[75%] ${isCustomer ? 'flex-row-reverse' : 'flex-row'}`}>
              
              {/* Avatar */}
              {!isCustomer && (
                <div className="shrink-0 mb-1 hidden sm:block">
                  {isAgent ? (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md ring-2 ring-background">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shadow-md ring-2 ring-background">
                      <User className="h-4 w-4 text-accent-foreground" />
                    </div>
                  )}
                </div>
              )}
              
              {/* Bubble */}
              <div className={`
                px-3 sm:px-5 py-2.5 sm:py-3 relative shadow-sm text-sm sm:text-[15px] leading-relaxed break-words overflow-hidden
                ${isCustomer 
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm' 
                  : isAgent
                    ? 'bg-card text-card-foreground border border-primary/20 rounded-2xl rounded-bl-sm ring-1 ring-primary/5'
                    : 'bg-accent/10 text-foreground border border-accent/20 rounded-2xl rounded-bl-sm'
                }
              `}>
                {!isCustomer && (
                  <div className="flex items-center gap-1.5 mb-1 opacity-70">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{isAgent ? 'Bot IA' : 'Operador'}</span>
                    {msg.stage && <span className="text-[9px] bg-background/50 px-1.5 rounded-sm border">{msg.stage}</span>}
                  </div>
                )}
                
                <div className="[&>p]:mb-2 [&>p:last-child]:mb-0">
                  {renderMessageContent(msg.content)}
                </div>
                
                <div className={`flex items-center justify-end mt-1.5 gap-1 ${isCustomer ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  <span className="text-[10px] font-medium">{format(parseISO(msg.createdAt), "HH:mm")}</span>
                  {isCustomer && <Check className="h-3 w-3" />}
                </div>
              </div>

            </div>
          </div>
        </div>
      );
  }), [messages, products]);

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-0 animate-enter gap-4">
        {/* En móvil, dentro de una conversación el encabezado se oculta: son
            ~90px de alto que le robaba a los mensajes en una pantalla donde
            cada píxel cuenta, y el título "Bandeja de Entrada" no aporta nada
            cuando ya estás leyendo un chat puntual. */}
        <div className={selectedId ? "hidden md:block" : ""}>
          <div className="flex items-start gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Bandeja de Entrada</h1>
            <HelpTourButton guide={HELP_GUIDE} />
          </div>
          <p className="text-muted-foreground">Monitorea a tus agentes y toma el control cuando sea necesario.</p>
        </div>

        {/* Altura ACOTADA también en móvil.
            Antes era `h-auto ... overflow-hidden` bajo el breakpoint md: sin
            techo de altura, el contenedor crecía a la altura natural de todos
            los mensajes (medido: 1854px de contenido dentro de 498px visibles)
            y, con overflow-hidden, recortaba el resto SIN dar scroll. El campo
            para escribir quedaba en y:1963px — o sea, en el celular no se
            podía ni leer el historial ni responder.
            100dvh y no 100vh: en móvil la barra del navegador aparece y
            desaparece, y vh no la contempla — el input terminaba tapado.
            min-h-0 es imprescindible: sin él, un hijo flex nunca se encoge por
            debajo de su contenido y el overflow-y-auto de adentro no llega a
            activarse nunca. */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 h-[calc(100dvh-11rem)] md:h-[calc(100vh-12rem)] md:min-h-[500px] glass-panel rounded-2xl border overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20 relative">
          
          {/* Left Pane - List */}
          <div className={`w-full md:w-[340px] min-h-0 flex-col border-r bg-card/50 ${selectedId ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b space-y-4 bg-background/50 backdrop-blur-md sticky top-0 z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-tour="conversations-search"
                  placeholder="Buscar conversaciones..."
                  className="pl-9 bg-background border-muted-foreground/20 rounded-full h-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1 max-h-[400px] md:max-h-none">
              {loadingConversations ? (
                <div className="p-4 space-y-4">
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : conversations?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 opacity-40" />
                  </div>
                  <p className="font-medium">Bandeja vacía</p>
                  <p className="text-xs mt-1">No hay mensajes recientes.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {(Array.isArray(conversations) ? conversations : []).map((conv) => (
                    <div 
                      key={conv.id} 
                      className={`p-4 cursor-pointer transition-all duration-200 border-l-4 ${selectedId === conv.id ? 'bg-primary/5 border-primary shadow-inner' : 'border-transparent hover:bg-muted/50'}`}
                      onClick={() => setLocation(`/conversations?id=${conv.id}`)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border shadow-sm" style={{ backgroundColor: conv.avatarColor }}>
                            <AvatarFallback className="text-white bg-transparent font-medium">
                              {conv.contactName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm leading-none truncate">{conv.contactName}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 min-w-0">
                              <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{conv.contactPhone}</span>
                            </p>
                          </div>
                        </div>
                        {conv.lastMessageAt && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {format(parseISO(conv.lastMessageAt), "HH:mm")}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center pl-13">
                        <p className={`text-sm line-clamp-1 flex-1 ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {conv.lastMessage || "Nueva conversación"}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge className="ml-2 h-5 min-w-5 justify-center rounded-full px-1.5 py-0 text-[10px] bg-primary text-primary-foreground shadow-sm">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 pl-13 items-center">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase tracking-wider bg-background gap-1">
                          {conv.status === 'ai' ? <><Bot className="h-3 w-3 text-primary"/> IA</> : conv.status === 'human' ? <><User className="h-3 w-3 text-accent"/> Humano</> : conv.status}
                        </Badge>
                        {conv.currentStage && (
                          <Badge variant="outline" className={`text-[10px] px-2 py-0 border bg-gradient-to-r ${getStageGradient(conv.currentStage)}`}>
                            {conv.currentStage}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Pane - Chat */}
          <div className={`flex-1 min-h-0 flex-col bg-background/50 relative ${!selectedId ? 'hidden md:flex' : 'flex'}`}>
            {/* Background Pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-5 dark:opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

            {!selectedId ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground relative z-10">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 shadow-sm border">
                  <MessageSquare className="h-10 w-10 opacity-30" />
                </div>
                <p className="text-lg font-medium text-foreground mb-2">Selecciona un chat</p>
                <p className="text-sm text-center max-w-xs">Elige una conversación del panel lateral para ver los mensajes o tomar el control.</p>
              </div>
            ) : loadingActiveConv || !activeConv ? (
              <div className="p-6 relative z-10"><Skeleton className="h-10 w-1/3 mb-6" /><Skeleton className="h-full w-full rounded-xl" /></div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="h-auto md:h-16 border-b flex flex-col md:flex-row items-start md:items-center justify-between p-3 md:px-4 gap-3 md:gap-0 bg-background/80 backdrop-blur-xl sticky top-0 z-20">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button variant="ghost" size="icon" className="md:hidden -ml-2 hover:bg-muted shrink-0" onClick={() => setLocation("/conversations")}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Avatar className="h-10 w-10 border shadow-sm ring-2 ring-background shrink-0" style={{ backgroundColor: activeConv.avatarColor }}>
                      <AvatarFallback className="text-white bg-transparent font-medium">
                        {activeConv.contactName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold leading-none text-foreground truncate">{activeConv.contactName}</h3>
                      <p className="text-xs text-muted-foreground mt-1 font-medium truncate">{activeConv.contactPhone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {activeConv.status === "ai" ? (
                      <Button data-tour="conversations-take-control" variant="default" size="sm" className="rounded-full shadow-md shadow-primary/20 transition-all hover:scale-105 text-xs md:text-sm flex-1 md:flex-none" onClick={() => handleHandoff("human")} disabled={handoff.isPending}>
                        <User className="h-4 w-4 mr-2" /> Tomar Control
                      </Button>
                    ) : activeConv.status === "human" ? (
                      <Button variant="secondary" size="sm" className="rounded-full transition-all hover:scale-105 text-xs md:text-sm flex-1 md:flex-none" onClick={() => handleHandoff("ai")} disabled={handoff.isPending}>
                        <Bot className="h-4 w-4 mr-2 text-primary" /> Devolver a IA
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0" onClick={closeConversation}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 relative z-10 scroll-smooth" ref={scrollRef}>
                  {loadingMessages ? (
                    <div className="space-y-6">
                      <Skeleton className="h-16 w-2/3 ml-auto rounded-2xl rounded-tr-sm" />
                      <Skeleton className="h-20 w-1/2 rounded-2xl rounded-tl-sm" />
                      <Skeleton className="h-12 w-2/3 rounded-2xl rounded-tl-sm" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {burbujas}
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="p-3 sm:p-4 bg-background/80 backdrop-blur-xl border-t relative z-20">
                  {activeConv.status === "closed" ? (
                    <div className="text-center p-4 text-sm font-medium text-muted-foreground bg-muted/50 rounded-xl border border-dashed">
                      Esta conversación ha sido cerrada.
                    </div>
                  ) : (
                    <div className="relative max-w-4xl mx-auto">
                      {activeConv.status === "ai" && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full cursor-pointer group" onClick={() => handleHandoff("human")}>
                          <Button variant="default" size="sm" className="rounded-full shadow-lg shadow-primary/20 transition-transform group-hover:scale-105 pointer-events-none">
                            <User className="h-4 w-4 mr-2" /> Tomar Control del Chat
                          </Button>
                        </div>
                      )}
                      <form 
                        className="flex gap-2 sm:gap-3 relative items-end"
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                      >
                        <div className="flex-1 relative min-w-0">
                          {/* Acá había un <Input> de UNA línea, y es el peor
                              lugar de la app para tenerlo: es donde una persona
                              le escribe a un cliente de verdad. Una respuesta
                              de tres renglones se iba de costado y no se podía
                              releer antes de mandarla.

                              Ahora crece con el texto (hasta ~5 renglones y
                              después scrollea). El radio pasa de `rounded-full`
                              a `rounded-3xl`: una cápsula perfecta solo se ve
                              bien con una línea; con tres, las esquinas se
                              comen el texto.

                              Enter manda, Shift+Enter hace salto de línea:
                              antes no había forma de escribir dos párrafos. */}
                          <Textarea
                            ref={cajaDeRespuesta}
                            placeholder="Escribe un mensaje..."
                            rows={1}
                            className="w-full resize-none overflow-y-auto rounded-3xl bg-card border-border/50 shadow-sm pl-4 sm:pl-6 pr-4 py-3 sm:py-4 min-h-[48px] sm:min-h-[56px] max-h-40 text-sm sm:text-base leading-relaxed focus-visible:ring-primary/30"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (messageText.trim() && activeConv.status !== "ai" && !sendMessage.isPending) handleSend();
                              }
                            }}
                            disabled={activeConv.status === "ai" || sendMessage.isPending}
                          />
                        </div>
                        <Button 
                          type="submit" 
                          disabled={!messageText.trim() || activeConv.status === "ai" || sendMessage.isPending}
                          size="icon"
                          className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-tr from-primary to-primary/80 hover:from-primary hover:to-primary shadow-lg shadow-primary/20 transition-transform active:scale-95"
                        >
                          <Send className="h-4 w-4 sm:h-5 sm:w-5 ml-0.5" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}