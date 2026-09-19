import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  MessageCircle,
  Store,
  LayoutDashboard,
  Facebook,
  BarChart3,
  ShieldCheck,
  Zap,
  Check,
  ArrowRight,
  Users,
  RefreshCw,
  CreditCard,
  Sparkles,
  Menu,
  X,
  ShoppingCart,
  TrendingUp,
  Bell,
  Heart,
  Wand2,
  ImagePlus,
  Globe,
  Megaphone,
  Package,
  Receipt,
  Search,
  Ticket,
  Truck,
  Compass,
} from "lucide-react";

// ─── Datos ──────────────────────────────────────────────────────────────
// Solo afirmaciones que el producto realmente cumple hoy (verificadas en el
// código esta misma sesión) -- nada de cifras de clientes o testimonios
// inventados. La prueba social acá es "esto es lo que la plataforma hace",
// no "esto dice fulano que nunca existió".
const ECOSYSTEM_STEPS = [
  {
    icon: Megaphone,
    title: "Atlas trae clientes",
    desc: "Investiga la competencia, arma la página de venta, escribe el anuncio y lo sube a Meta en pausa. Vos aprobás; él ejecuta.",
  },
  {
    icon: MessageCircle,
    title: "El cliente escribe",
    desc: "Por WhatsApp, Messenger o un comentario en Facebook. Tu agente IA responde en segundos con el catálogo y el tono de tu negocio.",
  },
  {
    icon: Bot,
    title: "La IA vende de verdad",
    desc: "Presenta el producto, da el precio cuando lo piden, resuelve objeciones y pasa a los medios de pago en el momento justo.",
  },
  {
    icon: Receipt,
    title: "Cobra y entrega",
    desc: "Link de MercadoPago o PayPal, transferencia con comprobante leído por IA, o contraentrega con pedido en Dropi o WooCommerce.",
  },
  {
    icon: LayoutDashboard,
    title: "Vos dirigís desde el panel",
    desc: "Conversaciones en vivo, prospectos, campañas y métricas. Tomás el control cuando querés y Atlas te dice qué hacer después.",
  },
];

/**
 * Los cuatro pilares de la plataforma. Cada punto existe en el código
 * (rutas y herramientas de Atlas verificadas el 2026-09-18); nada aspiracional.
 */
const PILARES = [
  {
    icon: MessageCircle,
    color: "bg-emerald-500/10 text-emerald-600",
    screen: "whatsapp" as const,
    title: "Vender por chat",
    desc: "Un vendedor IA que atiende WhatsApp, Messenger y comentarios de Facebook con tu catálogo, y aprende lo que le enseñás.",
    items: [
      "Presenta, cotiza y cierra con el flujo de un vendedor humano",
      "Lee comprobantes de pago con visión y los deja listos para aprobar",
      "Cupones reales, seguimientos automáticos y campañas por WhatsApp o correo",
      "Hasta 8 agentes con distinta personalidad por negocio",
    ],
  },
  {
    icon: Megaphone,
    color: "bg-blue-500/10 text-blue-600",
    screen: "atlas" as const,
    title: "Atraer clientes",
    desc: "Atlas, tu agencia de marketing en un chat: de 'quiero anunciar esto' a una campaña en Meta, en pausa, lista para activar.",
    items: [
      "Investiga la competencia en la Biblioteca de Anuncios de Meta",
      "Escribe el anuncio con los datos reales del producto y lo sube a Facebook e Instagram",
      "Píxel, atribución y radiografía de cada campaña en lenguaje de dueño",
      "Plan de contenido orgánico y publicación en tu página",
    ],
  },
  {
    icon: Globe,
    color: "bg-amber-500/10 text-amber-600",
    screen: "landing" as const,
    title: "Vender por la web",
    desc: "Tienda online propia y páginas de venta generadas por IA con las fotos reales de tus productos.",
    items: [
      "Tienda con catálogo, categorías y checkout MercadoPago / PayPal",
      "Landing pages con estructura AIDA, editables por chat y con URL pública lista para el anuncio",
      "Dropshipping: importás de Dropi, sincronizás con WooCommerce, pedido contraentrega",
      "Fichas de producto escritas por IA desde una foto o un Excel",
    ],
  },
  {
    icon: LayoutDashboard,
    color: "bg-violet-500/10 text-violet-600",
    screen: "panel" as const,
    title: "Dirigir el negocio",
    desc: "Un panel que responde '¿qué está pasando?' y '¿qué hago ahora?', con Atlas revisando tu negocio y proponiendo el siguiente paso.",
    items: [
      "Bandeja de conversaciones en vivo con control manual cuando querés",
      "Prospectos, embudo, tiempo de respuesta y valor generado",
      "Diagnóstico de qué le falta a tu negocio y ruta guiada paso a paso",
      "Cada negocio con su WhatsApp, sus datos y su catálogo, aislados",
    ],
  },
];

const TOOLS = [
  { icon: Bot, title: "Vendedor IA multicanal", desc: "WhatsApp, Messenger y comentarios de Facebook con el mismo cerebro y tu catálogo." },
  { icon: Compass, title: "Atlas, tu operador", desc: "Le hablás en tu idioma y él configura, investiga, crea y publica. Pide confirmación antes de gastar." },
  { icon: Wand2, title: "Landing pages con IA", desc: "Páginas de venta con fotos reales, formulario contraentrega o pago, y edición por chat." },
  { icon: Facebook, title: "Facebook e Instagram Ads", desc: "Borrador, campaña en pausa, activación, presupuesto, métricas y por qué no entrega." },
  { icon: Store, title: "Tienda online propia", desc: "Catálogo, categorías, importación por Excel con IA y checkout integrado." },
  { icon: Truck, title: "Dropshipping", desc: "Importación desde Dropi, pedidos contraentrega y sincronización con WooCommerce." },
  { icon: Receipt, title: "Comprobantes con visión", desc: "La IA lee la captura de Nequi o Daviplata y vos aprobás con un clic." },
  { icon: Ticket, title: "Cupones y seguimientos", desc: "Descuentos reales, follow-ups automáticos y envíos masivos por WhatsApp o correo." },
  { icon: Search, title: "Investigación real", desc: "Biblioteca de Anuncios de Meta y búsqueda web para decidir con datos, no de memoria." },
  { icon: CreditCard, title: "MercadoPago y PayPal", desc: "Cobrá ventas y suscripciones con los métodos que tus clientes ya usan." },
  { icon: BarChart3, title: "Analíticas y atribución", desc: "Embudo, tiempo de respuesta, valor generado y qué campaña trajo cada venta." },
  { icon: ShieldCheck, title: "Multi-negocio aislado", desc: "Cada cuenta con su propia sesión de WhatsApp, datos y catálogo, sin mezclas." },
];

const DEMO_SCRIPT: { from: "user" | "bot"; text: string }[] = [
  { from: "user", text: "Hola, ¿tienen el curso de piano?" },
  { from: "bot", text: "🎹 *Curso de Piano Completo*\nDe cero a avanzado, 19 módulos en video HD, partituras y ejercicios. 100% digital, acceso de por vida.\n\n¿Te gustaría conocer el precio? ⚡" },
  { from: "user", text: "Sí" },
  { from: "bot", text: "💰 $60.000 COP (pago único)\n\n¿Te envío los medios de pago para iniciar?" },
  { from: "user", text: "Dale, por Nequi" },
  { from: "bot", text: "📲 Nequi: 313 617 4267\nApenas transfieras, mándame el comprobante por aquí y te paso el acceso 🙌" },
];

const STORE_PRODUCTS = [
  { emoji: "📚", name: "Pack Idiomas", price: "$20.000" },
  { emoji: "🎧", name: "Curso Audio", price: "$15.000" },
  { emoji: "💻", name: "Mentoría 1:1", price: "$45.000" },
  { emoji: "🎓", name: "Certificación", price: "$30.000" },
];

const FLOATING_ITEMS = [
  { icon: MessageCircle, color: "bg-emerald-500", top: "8%", left: "4%", duration: 5 },
  { icon: ShoppingCart, color: "bg-amber-500", top: "18%", left: "88%", duration: 6 },
  { icon: TrendingUp, color: "bg-blue-500", top: "68%", left: "2%", duration: 4.5 },
  { icon: Bell, color: "bg-rose-500", top: "78%", left: "90%", duration: 5.5 },
  { icon: Heart, color: "bg-pink-500", top: "40%", left: "94%", duration: 4 },
  { icon: Sparkles, color: "bg-violet-500", top: "4%", left: "45%", duration: 6.5 },
];

// ─── Fondo de manchas de color en movimiento -- reemplaza los dos círculos
// estáticos de blur por 4 masas de color (violeta, rosa, cian, ámbar) que
// se desplazan solas en loop. Es lo que da la sensación de "vivo" en vez de
// una página estática, sin depender de video real.
function GradientMesh() {
  const blobs = [
    { className: "bg-primary/30", size: 420, x: ["-10%", "10%", "-10%"], y: ["0%", "15%", "0%"], top: "-10%", left: "0%", duration: 14 },
    { className: "bg-rose-400/25 dark:bg-rose-500/20", size: 380, x: ["0%", "-15%", "0%"], y: ["0%", "10%", "0%"], top: "5%", left: "60%", duration: 17 },
    { className: "bg-cyan-400/25 dark:bg-cyan-500/20", size: 360, x: ["0%", "12%", "0%"], y: ["-10%", "5%", "-10%"], top: "55%", left: "-5%", duration: 15 },
    { className: "bg-amber-300/25 dark:bg-amber-400/15", size: 320, x: ["-8%", "8%", "-8%"], y: ["0%", "-12%", "0%"], top: "60%", left: "70%", duration: 19 },
  ];
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${b.className}`}
          style={{ width: b.size, height: b.size, top: b.top, left: b.left }}
          animate={{ x: b.x, y: b.y }}
          transition={{ duration: b.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Iconos flotantes -- pequeños chips que derivan suavemente alrededor
// del hero, para dar sensación de actividad ("bastantes cosas flotantes").
function FloatingIcons() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none hidden sm:block">
      {FLOATING_ITEMS.map((item, i) => (
        <motion.div
          key={i}
          className={`absolute h-11 w-11 rounded-2xl ${item.color} text-white shadow-lg flex items-center justify-center opacity-90`}
          style={{ top: item.top, left: item.left }}
          animate={{ y: [0, -16, 0], rotate: [0, 6, -6, 0] }}
          transition={{ duration: item.duration, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
        >
          <item.icon className="h-5 w-5" />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Mascota ilustrada -- un personaje simple y abstracto (no una foto real
// de nadie) sosteniendo el teléfono, para el pedido de "animaciones
// personas". Bob suave + brillo pulsante en el teléfono simulando que le
// está por llegar un mensaje.
function PersonWithPhone({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 200 220"
      className={className}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="100" cy="205" rx="55" ry="10" className="fill-primary/10" />
      {/* cuerpo */}
      <rect x="55" y="95" width="90" height="100" rx="38" className="fill-primary" />
      {/* cabeza */}
      <circle cx="100" cy="60" r="42" className="fill-[#ffd8b8] dark:fill-[#e8b98e]" />
      {/* pelo */}
      <path d="M60 55 Q60 15 100 15 Q140 15 140 55 Q140 35 100 32 Q60 35 60 55 Z" className="fill-slate-800 dark:fill-slate-200" />
      {/* cara */}
      <circle cx="84" cy="62" r="4.5" className="fill-slate-800 dark:fill-slate-900" />
      <circle cx="116" cy="62" r="4.5" className="fill-slate-800 dark:fill-slate-900" />
      <path d="M85 78 Q100 90 115 78" strokeWidth="4" strokeLinecap="round" fill="none" className="stroke-slate-800 dark:stroke-slate-900" />
      {/* brazo sosteniendo el telefono */}
      <rect x="118" y="110" width="20" height="55" rx="10" className="fill-primary" transform="rotate(18 118 110)" />
      {/* telefono */}
      <motion.g
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="132" y="150" width="34" height="54" rx="7" className="fill-slate-900 dark:fill-slate-100" />
        <rect x="136" y="156" width="26" height="38" rx="2" className="fill-emerald-400" />
        <circle cx="149" cy="199" r="2.5" className="fill-slate-600 dark:fill-slate-400" />
      </motion.g>
      {/* corazon de notificacion */}
      <motion.g
        animate={{ opacity: [0, 1, 0], y: [0, -14, -22] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
      >
        <path d="M178 140 c-4 -6 -13 -3 -13 4 c0 6 13 14 13 14 s13 -8 13 -14 c0 -7 -9 -10 -13 -4Z" className="fill-rose-500" />
      </motion.g>
    </motion.svg>
  );
}

function useCountUp(target: number, inView: boolean, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);
  return value;
}

// ─── Pantalla 1: WhatsApp -- conversación animada en loop.
function ScreenWhatsApp() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let step = 0;
    async function run() {
      while (!cancelled) {
        if (step >= DEMO_SCRIPT.length) {
          await new Promise(r => setTimeout(r, 1600));
          if (cancelled) return;
          step = 0;
          setVisibleCount(0);
          setTyping(false);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        const msg = DEMO_SCRIPT[step];
        if (msg.from === "bot") {
          setTyping(true);
          await new Promise(r => setTimeout(r, 800));
          if (cancelled) return;
          setTyping(false);
        } else {
          await new Promise(r => setTimeout(r, 650));
        }
        if (cancelled) return;
        step += 1;
        setVisibleCount(step);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full bg-[#e5ddd5] dark:bg-[#0b141a] p-3 flex flex-col gap-2 overflow-hidden">
      <AnimatePresence initial={false}>
        {DEMO_SCRIPT.slice(0, visibleCount).map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12px] leading-snug shadow-sm whitespace-pre-line ${
              msg.from === "user"
                ? "self-end bg-[#dcf8c6] dark:bg-emerald-900 text-black dark:text-white rounded-br-sm"
                : "self-start bg-white dark:bg-slate-800 text-black dark:text-white rounded-bl-sm"
            }`}
          >
            {msg.text}
          </motion.div>
        ))}
        {typing && (
          <motion.div
            key="typing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="self-start bg-white dark:bg-slate-800 rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1 shadow-sm"
          >
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Pantalla 2: Tienda -- catálogo con un producto "agregándose" al carrito.
function ScreenStore() {
  const [cartCount, setCartCount] = useState(0);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    async function run() {
      while (!cancelled) {
        setAddingIndex(i % STORE_PRODUCTS.length);
        await new Promise(r => setTimeout(r, 900));
        if (cancelled) return;
        setCartCount(c => c + 1);
        setAddingIndex(null);
        i += 1;
        await new Promise(r => setTimeout(r, 1100));
        if (i % STORE_PRODUCTS.length === 0) {
          await new Promise(r => setTimeout(r, 900));
          if (cancelled) return;
          setCartCount(0);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 p-3 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">Tu Tienda</p>
        <div className="relative">
          <ShoppingCart className="h-4 w-4" />
          <AnimatePresence>
            {cartCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold"
              >
                {cartCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STORE_PRODUCTS.map((p, i) => (
          <motion.div
            key={p.name}
            animate={addingIndex === i ? { scale: [1, 1.08, 1], boxShadow: "0 0 0 2px hsl(var(--primary))" } : { scale: 1, boxShadow: "0 0 0 0px transparent" }}
            transition={{ duration: 0.4 }}
            className="rounded-xl bg-white dark:bg-slate-800 p-2.5 shadow-sm"
          >
            <div className="text-2xl mb-1">{p.emoji}</div>
            <p className="text-[10px] font-semibold leading-tight">{p.name}</p>
            <p className="text-[10px] text-primary font-bold">{p.price}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Pantalla 3: Panel -- métricas que suben solas + una notificación de
// conversación nueva apareciendo.
function ScreenDashboard() {
  const inView = true;
  const revenue = useCountUp(2450000, inView, 2200);
  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 p-3 flex flex-col gap-3 overflow-hidden">
      <p className="text-xs font-bold">Panel de Ventas</p>
      <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm">
        <p className="text-[10px] text-muted-foreground">Ingresos del mes</p>
        <p className="text-lg font-black text-primary tabular-nums">${revenue.toLocaleString("es-CO")}</p>
      </div>
      <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm flex-1 flex items-end gap-1.5">
        {[40, 65, 45, 80, 60, 95, 70].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.8, delay: i * 0.08, ease: "easeOut" }}
            className="flex-1 rounded-t-md bg-gradient-to-t from-primary/60 to-primary"
          />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 p-2 flex items-center gap-2"
      >
        <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
          <Bell className="h-3 w-3 text-white" />
        </div>
        <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">Nueva conversación cerrada 🎉</p>
      </motion.div>
    </div>
  );
}

// ─── Pantalla 4: Facebook Ads -- "la IA generando la campaña", el pedido
// explícito de mostrar un agente de marketing digital trabajando solo.
function ScreenAds() {
  const [stage, setStage] = useState<"generating" | "ready">("generating");
  useEffect(() => {
    let cancelled = false;
    async function run() {
      while (!cancelled) {
        setStage("generating");
        await new Promise(r => setTimeout(r, 1800));
        if (cancelled) return;
        setStage("ready");
        await new Promise(r => setTimeout(r, 2400));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 p-3 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <Facebook className="h-4 w-4 text-blue-600" />
        <p className="text-xs font-bold">Facebook Ads con IA</p>
      </div>
      <AnimatePresence mode="wait">
        {stage === "generating" ? (
          <motion.div
            key="gen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 rounded-xl bg-white dark:bg-slate-800 p-4 flex flex-col items-center justify-center gap-3 shadow-sm"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="h-9 w-9 rounded-full border-2 border-primary/20 border-t-primary"
            />
            <p className="text-[11px] text-muted-foreground text-center">Generando copy, segmentación<br />e imagen del anuncio...</p>
          </motion.div>
        ) : (
          <motion.div
            key="ready"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 rounded-xl bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col"
          >
            <div className="h-16 bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <ImagePlus className="h-6 w-6 text-white/80" />
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1.5">
              <p className="text-[10px] font-bold leading-tight">Aprendé inglés en 30 días 🚀</p>
              <p className="text-[9px] text-muted-foreground leading-tight">Pack completo con certificación. Cupos limitados.</p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-auto flex items-center gap-1 text-[9px] font-bold text-emerald-600"
              >
                <Check className="h-3 w-3" /> Publicado en Facebook
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Atlas ejecutando la ruta de marketing: es la ruta guiada REAL del
// producto (producto → competencia → landing → anuncio → Meta en pausa), tal
// como la corre el servidor. Cada paso aparece como lo ve el dueño en el chat.
const ATLAS_SCRIPT: { from: "admin" | "atlas"; text: string; paso?: string }[] = [
  { from: "admin", text: "Quiero anunciar el curso de piano" },
  { from: "atlas", paso: "Paso 1 de 5 · Producto", text: "🎹 Curso de Piano Completo · $60.000. ¿Arrancamos con este?" },
  { from: "admin", text: "Sí" },
  { from: "atlas", paso: "Paso 2 de 5 · Competencia", text: "🔎 Miré la Biblioteca de Anuncios: 3 anuncios activos, todos venden 'aprendé rápido'. Ángulo recomendado: tocá tu primera canción en 7 días." },
  { from: "atlas", paso: "Paso 3 de 5 · Página de venta", text: "🖥️ Landing creada con tus fotos y pago por MercadoPago. Vista previa lista." },
  { from: "atlas", paso: "Paso 4 de 5 · Anuncio", text: "📣 Anuncio escrito con los datos reales del curso. ¿Lo subo a Meta con $10.000/día? Queda en pausa: no gasta hasta que lo actives." },
  { from: "admin", text: "Dale" },
  { from: "atlas", paso: "Paso 5 de 5 · Listo", text: "✅ Campaña creada en tu cuenta, EN PAUSA. Cuando la actives te cuento en 3 días cuánta gente escribió y cuánto costó cada mensaje." },
];

function ScreenAtlas() {
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let step = 0;
    async function run() {
      while (!cancelled) {
        if (step >= ATLAS_SCRIPT.length) {
          await new Promise(r => setTimeout(r, 2200));
          if (cancelled) return;
          step = 0; setVisible(0); setTyping(false);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        const msg = ATLAS_SCRIPT[step];
        if (msg.from === "atlas") {
          setTyping(true);
          await new Promise(r => setTimeout(r, 900));
          if (cancelled) return;
          setTyping(false);
        } else {
          await new Promise(r => setTimeout(r, 600));
        }
        if (cancelled) return;
        step += 1; setVisible(step);
        await new Promise(r => setTimeout(r, 700));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [visible, typing]);

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 p-3 flex flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {ATLAS_SCRIPT.slice(0, visible).map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={`max-w-[88%] rounded-2xl px-3 py-2 text-[11.5px] leading-snug shadow-sm ${
                msg.from === "admin"
                  ? "self-end bg-primary text-primary-foreground rounded-br-sm"
                  : "self-start bg-white dark:bg-slate-800 rounded-bl-sm"
              }`}
            >
              {msg.paso && <p className="text-[9.5px] font-bold text-primary mb-0.5 uppercase tracking-wide">{msg.paso}</p>}
              {msg.text}
            </motion.div>
          ))}
          {typing && (
            <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="self-start bg-white dark:bg-slate-800 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2 shadow-sm">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-3 w-3 rounded-full border-2 border-primary/20 border-t-primary" />
              <span className="text-[10px] text-muted-foreground">Atlas trabajando…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── La landing "construyéndose": las secciones que genera de verdad el
// Landing Studio (hero con foto real, beneficios, oferta, pedido) aparecen
// una por una, como cuando Atlas la arma.
const LANDING_BLOQUES = ["hero", "beneficios", "oferta", "cta"] as const;
function ScreenLanding() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      while (!cancelled) {
        setN(0);
        for (let k = 1; k <= LANDING_BLOQUES.length; k++) {
          await new Promise(r => setTimeout(r, k === 1 ? 700 : 650));
          if (cancelled) return;
          setN(k);
        }
        await new Promise(r => setTimeout(r, 2600));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);
  const show = (b: typeof LANDING_BLOQUES[number]) => n >= LANDING_BLOQUES.indexOf(b) + 1;
  return (
    <div className="h-full bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-slate-50 dark:bg-slate-800">
        <span className="h-2 w-2 rounded-full bg-rose-400" /><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="ml-2 text-[9px] text-muted-foreground truncate">ventasproia.com/l/curso-de-piano</span>
      </div>
      <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
        <AnimatePresence>
          {show("hero") && (
            <motion.div key="hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl overflow-hidden border">
              <div className="h-14 bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl">🎹</div>
              <div className="p-2">
                <p className="text-[11px] font-black leading-tight">Tocá tu primera canción en 7 días</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">De cero a avanzado, a tu ritmo, con partituras y 19 módulos en video.</p>
              </div>
            </motion.div>
          )}
          {show("beneficios") && (
            <motion.div key="ben" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-1.5">
              {["🎬 Video HD", "🎼 Partituras", "♾️ De por vida"].map(b => (
                <div key={b} className="rounded-lg border p-1.5 text-[9px] font-semibold text-center">{b}</div>
              ))}
            </motion.div>
          )}
          {show("oferta") && (
            <motion.div key="of" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border p-2 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-muted-foreground">Pago único</p>
                <p className="text-[13px] font-black">$60.000 <span className="text-[9px] font-normal text-muted-foreground">COP</span></p>
              </div>
              <span className="text-[9px] rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 font-bold">Acceso inmediato</span>
            </motion.div>
          )}
          {show("cta") && (
            <motion.div key="cta" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="mt-auto rounded-xl bg-primary text-primary-foreground text-center py-2 text-[11px] font-bold">
              Quiero mi acceso ahora
            </motion.div>
          )}
        </AnimatePresence>
        {n < LANDING_BLOQUES.length && (
          <p className="mt-auto text-[9px] text-muted-foreground text-center">Atlas está armando la página… {n}/{LANDING_BLOQUES.length}</p>
        )}
      </div>
    </div>
  );
}

const SHOWCASE_SCREENS = [
  { id: "whatsapp", label: "Vendedor IA", sub: "WhatsApp · respondiendo", Component: ScreenWhatsApp, bar: "bg-[#075E54]", icon: Bot },
  { id: "atlas", label: "Atlas", sub: "Tu agencia en un chat", Component: ScreenAtlas, bar: "bg-slate-900 dark:bg-slate-800", icon: Compass },
  { id: "landing", label: "Landing page", sub: "Generada con IA", Component: ScreenLanding, bar: "bg-amber-600", icon: Wand2 },
  { id: "tienda", label: "Tu Tienda", sub: "Catálogo en vivo", img: "/store_app.png", bar: "bg-slate-900 dark:bg-slate-800", icon: Store },
  { id: "ads", label: "Facebook Ads", sub: "Campaña en pausa, lista", Component: ScreenAds, bar: "bg-blue-600", icon: Facebook },
  { id: "panel", label: "Panel", sub: "Métricas en tiempo real", img: "/dashboard_app.png", bar: "bg-slate-900 dark:bg-slate-800", icon: LayoutDashboard },
];

// ─── El "video interactivo" del hero: un mockup de teléfono que va rotando
// solo entre las 4 pantallas del producto (WhatsApp, tienda, panel, ads) --
// en vez de una sola captura fija, muestra el ecosistema completo en acción con imágenes fotorealistas.
function ProductShowcase() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % SHOWCASE_SCREENS.length), 5200);
    return () => clearInterval(id);
  }, []);
  const screen = SHOWCASE_SCREENS[active];

  return (
    <div className="relative">
      <div className="w-full max-w-sm rounded-3xl border bg-card shadow-2xl shadow-primary/20 overflow-hidden">
        <div className={`flex items-center gap-3 px-4 py-3 text-white transition-colors duration-500 ${screen.bar}`}>
          <motion.div
            key={screen.id}
            initial={{ scale: 0.6, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center"
          >
            <screen.icon className="h-5 w-5" />
          </motion.div>
          <div>
            <p className="text-sm font-semibold leading-tight">{screen.label}</p>
            <p className="text-[11px] text-white/70 leading-tight">{screen.sub}</p>
          </div>
        </div>
        <div className="h-80 sm:h-96 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35 }}
              className="h-full w-full absolute inset-0"
            >
              {screen.img ? (
                <img src={screen.img} alt={screen.label} className="w-full h-full object-cover" />
              ) : (
                screen.Component && <screen.Component />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {/* indicadores de pantalla, como un carrusel de "video" */}
      <div className="flex justify-center gap-2 mt-4">
        {SHOWCASE_SCREENS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            aria-label={s.label}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-7 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
          />
        ))}
      </div>
    </div>
  );
}

function PantallaDePilar({ id }: { id: "whatsapp" | "atlas" | "landing" | "panel" }) {
  const screen = SHOWCASE_SCREENS.find((x) => x.id === id) || SHOWCASE_SCREENS[0];
  return (
    <div className="h-full w-full">
      {screen.img
        ? <img src={screen.img} alt={screen.label} className="w-full h-full object-cover object-top" />
        : (screen.Component && <screen.Component />)}
    </div>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatCounter({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const count = useCountUp(value, inView);
  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl sm:text-4xl font-black text-primary tabular-nums">{count}{suffix}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

interface Plan {
  id: string;
  name: string;
  price: number;
  monthlyMessages: number;
  maxAgents: number;
  features: string[];
}

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/pricing")
      .then(r => r.json())
      .then(d => setPlans((d.plans || []).filter((p: Plan) => p.id !== "basic").slice(0, 3)))
      .catch(() => {});
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-8 w-8" />
            <span className="font-bold text-lg">VentasPro</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <button onClick={() => scrollTo("pilares")} className="hover:text-foreground transition-colors">Qué hace</button>
            <button onClick={() => scrollTo("ecosistema")} className="hover:text-foreground transition-colors">Cómo funciona</button>
            <button onClick={() => scrollTo("herramientas")} className="hover:text-foreground transition-colors">Herramientas</button>
            <button onClick={() => scrollTo("precios")} className="hover:text-foreground transition-colors">Precios</button>
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Button asChild variant="ghost"><Link href="/auth">Iniciar sesión</Link></Button>
            <Button asChild className="gap-1.5"><Link href="/auth?tab=register">Comenzar gratis <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
          </div>
          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Menú">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t overflow-hidden"
            >
              <div className="px-4 py-4 flex flex-col gap-3">
                <button onClick={() => scrollTo("pilares")} className="text-left text-sm font-medium py-1.5">Qué hace</button>
                <button onClick={() => scrollTo("ecosistema")} className="text-left text-sm font-medium py-1.5">Cómo funciona</button>
                <button onClick={() => scrollTo("herramientas")} className="text-left text-sm font-medium py-1.5">Herramientas</button>
                <button onClick={() => scrollTo("precios")} className="text-left text-sm font-medium py-1.5">Precios</button>
                <Button asChild variant="outline" className="w-full mt-1"><Link href="/auth">Iniciar sesión</Link></Button>
                <Button asChild className="w-full"><Link href="/auth?tab=register">Comenzar gratis</Link></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Hero ── */}
      <section className="relative">
        <GradientMesh />
        <FloatingIcons />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Badge variant="outline" className="mb-5 gap-1.5 border-primary/30 text-primary bg-primary/5 py-1.5 px-3">
                <Sparkles className="h-3.5 w-3.5" /> 7 días gratis · sin tarjeta
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
                Tu negocio vendiendo solo: <span className="text-primary">ventas, marketing y tienda</span> con IA en un solo lugar
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                Un vendedor IA que atiende WhatsApp, Messenger y Facebook. Atlas, una agencia de marketing en un chat que
                investiga, crea tu página de venta y publica tus anuncios. Tienda, landings, dropshipping y cobros, todo en el mismo panel.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/auth?tab=register">
                  <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-7">
                    Comenzar gratis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-7" onClick={() => scrollTo("pilares")}>
                  Ver todo lo que hace
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Cada negocio tiene su propia sesión aislada -- sin mezclas de datos entre clientes.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="flex items-center justify-center lg:justify-end gap-2 w-full"
          >
            <div className="w-full max-w-md">
              <ProductShowcase />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y bg-muted/30 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Cada numero sale de SAAS_PLANS (middleware/saasValidation.ts), que
              es el codigo que cobra de verdad. Verificado uno por uno el
              2026-08-22:
                Pro = 8 agentes, 15.000 mensajes/mes
                Prueba gratis = 7 dias, 30 mensajes
                Canales donde el cliente puede comprar: WhatsApp, Messenger y
                la tienda web (los dos primeros los atiende el agente, ver
                lib/channel-manager.ts).
              El "+" salio de 15.000 porque el plan da 15.000 EXACTOS: un mas
              sobre una cifra exacta es inventarse lo que no hay, y es
              justamente lo que el cliente puede contar y desmentir. */}
          <StatCounter value={8} label="Agentes IA en el plan Pro" />
          <StatCounter value={15000} label="Mensajes/mes en el plan Pro" />
          <StatCounter value={4} label="Canales: WhatsApp, Messenger, Facebook y tienda" />
          <StatCounter value={7} label="Días de prueba gratis" />
        </div>
      </section>

      {/* ── Marketing IA ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <Badge variant="outline" className="mb-4 gap-1.5"><Compass className="h-3.5 w-3.5" /> Atlas · tu agencia en un chat</Badge>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Decile "quiero anunciar este curso" y Atlas hace el resto
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              No es un generador de textos: es un operador que investiga la competencia, arma la página de venta,
              escribe el anuncio con los datos reales de tu producto y lo sube a Meta en pausa. Vos aprobás cada paso.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Investiga qué anuncia la competencia en la Biblioteca de Anuncios de Meta",
                "Crea la landing page con tus fotos y la publica con URL lista para el anuncio",
                "Sube la campaña a Facebook e Instagram en pausa: no gasta hasta que digas",
                "Te explica en 3 líneas qué está pasando con cada campaña y qué hacer",
                "Configura y entrena a tu vendedor IA desde la misma conversación",
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-3 w-3" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.15} className="flex justify-center">
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              <div className="rounded-3xl border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
                <div className="px-3 py-2 bg-slate-900 text-white text-[11px] font-semibold flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> Atlas</div>
                <div className="h-80"><ScreenAtlas /></div>
              </div>
              <div className="rounded-3xl border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
                <div className="px-3 py-2 bg-amber-600 text-white text-[11px] font-semibold flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Lo que sale</div>
                <div className="h-80"><ScreenLanding /></div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Ecosistema ── */}
      <section id="ecosistema" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">El ecosistema completo</Badge>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Del anuncio a la venta cerrada, sin que se te escape un cliente</h2>
          <p className="mt-4 text-muted-foreground text-lg">Cada pieza se conecta con las demás: lo que Atlas anuncia lo vende el agente, y lo que el agente vende lo cobrás y lo entregás desde el mismo panel.</p>
        </Reveal>
        <div className="relative">
          <div className="hidden lg:block absolute top-8 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10" />
          <div className="grid lg:grid-cols-5 gap-8 lg:gap-4">
            {ECOSYSTEM_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08} className="relative flex flex-col items-center text-center">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 3 }}
                  className="relative z-10 h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 mb-4"
                >
                  <step.icon className="h-7 w-7" />
                </motion.div>
                <h3 className="font-bold text-sm mb-1.5">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Herramientas ── */}
      {/* ── Pilares ── */}
      <section id="pilares" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <Badge variant="outline" className="mb-4">Mucho más que un bot de WhatsApp</Badge>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Cuatro cosas que hace por tu negocio</h2>
          <p className="mt-4 text-muted-foreground text-lg">Vender, atraer, vender por la web y dirigir. Cada una funciona sola y todas juntas hacen el ciclo completo.</p>
        </Reveal>
        <div className="grid md:grid-cols-2 gap-5">
          {PILARES.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <motion.div whileHover={{ y: -4 }} className="h-full rounded-3xl border bg-card shadow-sm hover:shadow-lg hover:border-primary/30 transition-shadow overflow-hidden flex flex-col sm:flex-row">
                <div className="p-6 sm:p-7 flex-1">
                  <div className={`h-11 w-11 rounded-2xl flex items-center justify-center mb-4 ${p.color}`}>
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-black text-xl tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                  <ul className="mt-5 space-y-2.5">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="h-3 w-3" />
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* La pantalla de ese pilar, en vivo: que se VEA lo que hace, no solo leerlo. */}
                <div className="sm:w-56 shrink-0 border-t sm:border-t-0 sm:border-l bg-muted/30 h-64 sm:h-auto">
                  <PantallaDePilar id={p.screen} />
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="herramientas" className="bg-muted/30 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4">Todo en un solo panel</Badge>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Las herramientas, una por una</h2>
            <p className="mt-4 text-muted-foreground text-lg">Sin integraciones que armar: ya vienen conectadas entre sí.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TOOLS.map((tool, i) => (
              <Reveal key={tool.title} delay={(i % 4) * 0.06}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="h-full rounded-2xl border bg-card p-5 shadow-sm hover:shadow-lg hover:border-primary/30 transition-shadow"
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <tool.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-sm mb-1.5">{tool.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tool.desc}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <Badge variant="outline" className="mb-4">Planes simples</Badge>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Empezá gratis, crecé cuando lo necesites</h2>
          <p className="mt-4 text-muted-foreground text-lg">7 días de prueba con 30 mensajes. Sin tarjeta.</p>
        </Reveal>
        {plans.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {plans.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 0.1}>
                <div className={`h-full rounded-2xl border p-6 flex flex-col ${i === 1 ? "border-primary shadow-lg shadow-primary/10 scale-[1.03]" : ""}`}>
                  {i === 1 && <Badge className="w-fit mb-3">Más elegido</Badge>}
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="mt-2 mb-4">
                    <span className="text-3xl font-black">${plan.price}</span>
                    <span className="text-muted-foreground text-sm"> USD/mes</span>
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                    <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {plan.monthlyMessages.toLocaleString()} mensajes/mes</li>
                    <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {plan.maxAgents} agente{plan.maxAgents > 1 ? "s" : ""} IA</li>
                    {(plan.features || []).slice(0, 2).map(f => (
                      <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {f}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        )}
        <div className="text-center mt-10">
          <Link href="/pricing">
            <Button variant="outline" size="lg" className="gap-2">
              Ver todos los planes y comparar <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
          <Reveal className="relative rounded-3xl bg-primary text-primary-foreground px-8 py-14 sm:py-16 text-center overflow-hidden">
            <motion.div
              className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
              animate={{ x: [0, 20, 0], y: [0, 15, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl"
              animate={{ x: [0, -15, 0], y: [0, -10, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <Users className="h-10 w-10 mx-auto mb-5 opacity-80" />
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Tu próximo cliente ya te está escribiendo</h2>
            <p className="mt-4 text-primary-foreground/80 max-w-lg mx-auto">
              Conectá tu WhatsApp en minutos y dejá que Sofía se encargue del resto.
            </p>
            <Link href="/auth?tab=register">
              <Button size="lg" variant="secondary" className="mt-8 gap-2 text-base px-8">
                <Zap className="h-4 w-4" /> Comenzar gratis ahora
              </Button>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-6 w-6" />
            <span className="font-bold text-sm">VentasPro</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Precios</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link href="/auth" className="hover:text-foreground transition-colors">Iniciar sesión</Link>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} VentasPro</p>
        </div>
      </footer>
    </div>
  );
}
