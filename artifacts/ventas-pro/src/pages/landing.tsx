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
  { icon: Bot, title: "Agentes IA multi-personalidad", desc: "Configurá el tono, el nombre y hasta 8 agentes especializados según el plan." },
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

// ─── Demo de WhatsApp animada -- el "producto en acción" del hero, en vez
// de una captura estática o una ilustración genérica (lo que mejor convierte
// en 2026 según la investigación: demos interactivas, no screenshots fijos).
function WhatsAppDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let step = 0;

    async function run() {
      while (!cancelled) {
        if (step >= DEMO_SCRIPT.length) {
          await new Promise(r => setTimeout(r, 1800));
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
          await new Promise(r => setTimeout(r, 900));
          if (cancelled) return;
          setTyping(false);
        } else {
          await new Promise(r => setTimeout(r, 700));
        }
        if (cancelled) return;
        step += 1;
        setVisibleCount(step);
        await new Promise(r => setTimeout(r, 550));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="w-full max-w-sm rounded-3xl border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
      <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
        <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Sofía · Agente IA</p>
          <p className="text-[11px] text-white/70 leading-tight">en línea</p>
        </div>
      </div>
      <div className="h-80 sm:h-96 bg-[#e5ddd5] dark:bg-[#0b141a] p-3 flex flex-col gap-2 overflow-hidden">
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
            <Link href="/auth"><Button variant="ghost">Iniciar sesión</Button></Link>
            <Link href="/auth?tab=register"><Button className="gap-1.5">Comenzar gratis <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
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
                <Link href="/auth"><Button variant="outline" className="w-full mt-1">Iniciar sesión</Button></Link>
                <Link href="/auth?tab=register"><Button className="w-full">Comenzar gratis</Button></Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Hero ── */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-96 -left-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        </div>
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
            className="flex justify-center lg:justify-end"
          >
            <WhatsAppDemo />
          </motion.div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <StatCounter value={8} label="Agentes IA especializados" />
          <StatCounter value={15000} suffix="+" label="Mensajes/mes en el plan Pro" />
          <StatCounter value={3} label="Canales integrados en uno" />
          <StatCounter value={7} label="Días de prueba gratis" />
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
                <div className="relative z-10 h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
                  <step.icon className="h-7 w-7" />
                </div>
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
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
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
