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
} from "lucide-react";

// ─── Datos ──────────────────────────────────────────────────────────────
// Solo afirmaciones que el producto realmente cumple hoy (verificadas en el
// código esta misma sesión) -- nada de cifras de clientes o testimonios
// inventados. La prueba social acá es "esto es lo que la plataforma hace",
// no "esto dice fulano que nunca existió".
const ECOSYSTEM_STEPS = [
  {
    icon: MessageCircle,
    title: "El cliente escribe por WhatsApp",
    desc: "A cualquier hora. Sofía (tu agente IA) responde en segundos, con la personalidad y el catálogo de tu negocio.",
  },
  {
    icon: Bot,
    title: "La IA vende de verdad",
    desc: "Resuelve dudas, recomienda productos, maneja objeciones y agenda el follow-up si el cliente se queda pensando.",
  },
  {
    icon: Store,
    title: "Cierra en tu tienda online",
    desc: "Catálogo propio, carrito y checkout con MercadoPago o PayPal -- sin que el cliente salga de la conversación.",
  },
  {
    icon: LayoutDashboard,
    title: "Vos ves todo en un panel",
    desc: "Conversaciones en vivo, prospectos, embudo de ventas y métricas reales -- y podés tomar el control cuando quieras.",
  },
  {
    icon: Facebook,
    title: "Facebook Ads alimenta el ciclo",
    desc: "Generá anuncios y borradores de campaña desde la misma IA para traer más clientes a WhatsApp.",
  },
];

const TOOLS = [
  { icon: Bot, title: "Agentes IA multi-personalidad", desc: "Configurá el tono, el nombre y hasta 8 agentes especializados en el plan Pro (2 en Starter, 5 en Growth)." },
  { icon: Store, title: "Tienda online propia", desc: "Catálogo, categorías, importación por Excel con IA y checkout integrado." },
  { icon: MessageCircle, title: "Bandeja de conversaciones", desc: "Mirá cada charla en vivo y tomá el control manual en cualquier momento." },
  { icon: Facebook, title: "Facebook Ads con IA", desc: "Borradores de campaña, segmentación sugerida y publicación desde el panel." },
  { icon: RefreshCw, title: "Recuperación de seguimientos", desc: "La IA programa follow-ups automáticos para no perder prospectos tibios." },
  { icon: ShieldCheck, title: "Multi-negocio aislado de verdad", desc: "Cada cuenta tiene su propia sesión de WhatsApp, datos y catálogo -- sin mezclas." },
  { icon: CreditCard, title: "Pagos con MercadoPago y PayPal", desc: "Cobrá suscripciones y ventas con los métodos que tus clientes ya usan." },
  { icon: BarChart3, title: "Analíticas y embudo de ventas", desc: "Tasa de conversión, tiempo de respuesta y valor generado, en tiempo real." },
];

const DEMO_SCRIPT: { from: "user" | "bot"; text: string }[] = [
  { from: "user", text: "Hola, ¿tienen el combo de cursos de inglés?" },
  { from: "bot", text: "¡Hola! 👋 Sí, tenemos el Pack Idiomas completo. Incluye inglés, francés y alemán por $20.000 COP." },
  { from: "user", text: "¿Y si solo quiero inglés?" },
  { from: "bot", text: "Puedo armarte ese combo individual. ¿Querés que te pase el link de pago para cerrarlo ahora?" },
  { from: "user", text: "Dale, cerremos" },
  { from: "bot", text: "Listo ✅ Te dejo el link de MercadoPago. En cuanto pagues te llega el acceso al instante." },
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
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
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

const SHOWCASE_SCREENS = [
  { id: "whatsapp", label: "WhatsApp", sub: "Sofía · en línea", img: "/whatsapp_app.png", bar: "bg-[#075E54]", icon: Bot },
  { id: "tienda", label: "Tu Tienda", sub: "Catálogo en vivo", img: "/store_app.png", bar: "bg-slate-900 dark:bg-slate-800", icon: Store },
  { id: "panel", label: "Panel de Ventas", sub: "Métricas en tiempo real", img: "/dashboard_app.png", bar: "bg-slate-900 dark:bg-slate-800", icon: LayoutDashboard },
  { id: "ads", label: "Marketing IA", sub: "Facebook Ads automático", Component: ScreenAds, bar: "bg-blue-600", icon: Wand2 },
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
                Un agente de IA que vende por WhatsApp <span className="text-primary">mientras vos dormís</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                VentasPro conecta tu WhatsApp, tu tienda online y tus anuncios de Facebook en un solo ecosistema.
                Sofía responde, recomienda y cierra ventas -- vos solo mirás el panel.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/auth?tab=register">
                  <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-7">
                    Comenzar gratis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-7" onClick={() => scrollTo("ecosistema")}>
                  Ver cómo funciona
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
          <StatCounter value={3} label="Canales: WhatsApp, Messenger y tienda" />
          <StatCounter value={7} label="Días de prueba gratis" />
        </div>
      </section>

      {/* ── Marketing IA ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <Badge variant="outline" className="mb-4 gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Marketing automático</Badge>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Un agente de marketing digital trabajando solo, 24/7
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Mientras Sofía cierra ventas por WhatsApp, la misma IA arma borradores de campañas de Facebook Ads:
              copy, imagen y segmentación sugerida -- vos solo revisás y publicás.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Genera el copy y la imagen del anuncio automáticamente",
                "Sugiere la segmentación según tu catálogo",
                "Publica directo desde el panel cuando lo aprobás",
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
            <div className="w-full max-w-sm rounded-3xl border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
              <div className="h-72"><ScreenAds /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Ecosistema ── */}
      <section id="ecosistema" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">El ecosistema completo</Badge>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">De un mensaje de WhatsApp a una venta cerrada</h2>
          <p className="mt-4 text-muted-foreground text-lg">Cada herramienta se conecta con las demás -- no son módulos sueltos.</p>
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
      <section id="herramientas" className="bg-muted/30 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4">Todo en un solo panel</Badge>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Las herramientas que tu negocio necesita</h2>
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
