import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, BarChart3, Bot, Check, ChevronDown, Compass, CreditCard,
  Facebook, Globe, LayoutDashboard, Menu, MessageCircle, Package, Receipt,
  Search, ShieldCheck, Sparkles, Store, Ticket, Truck, Wand2, X, Zap,
} from "lucide-react";

const SHOWCASE = [
  { id: "inbox", label: "Sofía", eyebrow: "VENTAS POR CHAT", title: "Conversaciones que avanzan hacia la compra.", image: "/screens/m-inbox.jpg", icon: MessageCircle },
  { id: "atlas", label: "Atlas", eyebrow: "OPERACIÓN CON IA", title: "Convierte una instrucción en trabajo comercial.", image: "/screens/m-atlas.jpg", icon: Compass },
  { id: "landing", label: "Landing Studio", eyebrow: "PÁGINAS DE VENTA", title: "Páginas listas para mostrar tu oferta.", image: "/screens/m-landing.jpg", icon: Wand2 },
  { id: "store", label: "Tienda", eyebrow: "ECOMMERCE", title: "Catálogo, checkout y operación en el mismo sistema.", image: "/screens/m-tienda.jpg", icon: Store },
  { id: "ads", label: "Meta Ads", eyebrow: "ADQUISICIÓN", title: "Campañas conectadas a tu operación comercial.", image: "/screens/facebook.jpg", icon: Facebook },
  { id: "analytics", label: "Panel", eyebrow: "CONTROL", title: "Una vista para saber qué ocurre y qué hacer después.", image: "/screens/panel.jpg", icon: LayoutDashboard },
] as const;

const PILLARS = [
  {
    number: "01", icon: MessageCircle, title: "Vende por conversación",
    description: "Sofía atiende tus canales con el contexto de tu negocio, tus productos y tus reglas.",
    points: ["WhatsApp, Messenger y comentarios de Facebook", "Catálogo y precios conectados", "Seguimientos y cupones", "Escalamiento al equipo humano"], screen: "inbox",
  },
  {
    number: "02", icon: Compass, title: "Opera marketing con IA",
    description: "Atlas convierte instrucciones en tareas: investigar, preparar, revisar y ejecutar.",
    points: ["Investigación de competencia", "Preparación de anuncios y páginas", "Acciones sensibles con revisión previa", "Explicaciones en lenguaje de negocio"], screen: "atlas",
  },
  {
    number: "03", icon: Globe, title: "Vende también por la web",
    description: "Conecta páginas, catálogo, pagos y operación sin repartir el proceso entre varias herramientas.",
    points: ["Tienda online y categorías", "Landing pages editables", "MercadoPago y PayPal", "Dropshipping y contraentrega"], screen: "landing",
  },
  {
    number: "04", icon: BarChart3, title: "Dirige con datos",
    description: "Centraliza conversaciones, prospectos, campañas y métricas para entender tu operación.",
    points: ["Bandeja y control manual", "Prospectos y embudo", "Métricas y atribución", "Datos aislados por negocio"], screen: "analytics",
  },
] as const;

const USE_CASES = [
  { icon: Store, title: "Ecommerce", text: "Catálogo, atención, cobros, seguimiento y campañas en un mismo flujo." },
  { icon: Package, title: "Productos digitales", text: "Presenta la oferta, responde dudas y lleva al cliente al pago." },
  { icon: Truck, title: "Dropshipping", text: "Conecta productos, páginas, contraentrega y operación del pedido." },
  { icon: CreditCard, title: "Servicios", text: "Convierte conversaciones en oportunidades y organiza el seguimiento." },
];

const FAQS = [
  ["¿VentasPro es solamente un bot de WhatsApp?", "No. WhatsApp es una parte del sistema. VentasPro reúne agentes IA, conversaciones, catálogo, tienda, páginas de venta, campañas, pagos y analítica."],
  ["¿Puedo mantener el control sobre lo que hace la IA?", "Sí. Las automatizaciones pueden dejar acciones sensibles preparadas para revisión antes de ejecutarlas."],
  ["¿Puedo usarlo con productos físicos y digitales?", "Sí. El ecosistema contempla productos digitales, físicos, ecommerce y flujos de dropshipping y contraentrega."],
  ["¿Cómo empiezo?", "Creas tu cuenta, configuras tu negocio y conectas los canales y herramientas que quieras utilizar."],
] as const;

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useInView(ref, { once: true, margin: "-70px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 26 }} animate={visible ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

function BrowserFrame({ image, alt }: { image: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,.30)] dark:border-white/10 dark:bg-slate-950">
      <div className="flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 dark:border-white/10 dark:bg-slate-900">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="mx-auto h-5 w-2/3 rounded-md border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" />
      </div>
      <img src={image} alt={alt} className="block h-auto w-full bg-slate-100 dark:bg-slate-900" loading="lazy" />
    </div>
  );
}

function HeroProduct() {
  const [active, setActive] = useState(0);
  const current = SHOWCASE[active];
  const Icon = current.icon;

  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => (value + 1) % SHOWCASE.length), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[690px]">
      <div className="absolute -inset-12 -z-10 bg-[radial-gradient(circle,rgba(99,102,241,.18),transparent_62%)] blur-2xl" />
      <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">
        <span>Producto real</span>
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Demo interactiva</span>
      </div>
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl shadow-indigo-950/10 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-4 w-4" /></div>
          <div><div className="text-sm font-semibold">{current.label}</div><div className="text-[10px] text-slate-400">{current.eyebrow}</div></div>
        </div>
        <div className="relative h-[420px] overflow-hidden bg-slate-100 sm:h-[520px] dark:bg-slate-900">
          <AnimatePresence mode="wait">
            <motion.div key={current.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: .35 }} className="absolute inset-0">
              <img src={current.image} alt={current.title} className="h-full w-full object-cover object-top" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/55 to-transparent p-5">
            <p className="max-w-lg text-sm font-semibold text-white sm:text-base">{current.title}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SHOWCASE.map((item, index) => (
          <button key={item.id} onClick={() => setActive(index)}
            className={"rounded-xl border px-2.5 py-2.5 text-left transition-all " + (
              active === index
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:hover:border-white/20 dark:hover:text-white"
            )}>
            <div className="truncate text-[9px] font-bold uppercase tracking-[.08em]">{item.label}</div>
            <div className="mt-0.5 truncate text-[8px] text-current/60">{item.eyebrow}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PillarCard({ pillar, index }: { pillar: typeof PILLARS[number]; index: number }) {
  const screen = SHOWCASE.find((item) => item.id === pillar.screen)!;
  const Icon = pillar.icon;
  return (
    <Reveal delay={index * .05}>
      <motion.article whileHover={{ y: -5 }} transition={{ duration: .2 }}
        className="group h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-xl hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950">
        <div className="grid h-full lg:grid-cols-[1.02fr_.98fr]">
          <div className="p-7 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[.22em] text-slate-400">{pillar.number}</span>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-5 w-5" /></div>
            </div>
            <h3 className="mt-7 text-2xl font-bold tracking-tight">{pillar.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{pillar.description}</p>
            <div className="mt-6 space-y-3">
              {pillar.points.map((point) => (
                <div key={point} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="h-3 w-3" /></span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-h-[320px] overflow-hidden border-t border-slate-200 bg-slate-50 lg:border-l lg:border-t-0 dark:border-white/10 dark:bg-slate-900">
            <img src={screen.image} alt={screen.title} className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.025]" loading="lazy" />
            <div className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-200">{screen.label}</div>
          </div>
        </div>
      </motion.article>
    </Reveal>
  );
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number; monthlyMessages: number; maxAgents: number; features: string[] }>>([]);

  useEffect(() => {
    fetch("/api/pricing").then((res) => res.json()).then((data) => setPlans((data.plans || []).filter((p: any) => p.id !== "basic").slice(0, 3))).catch(() => {});
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfcfe] text-slate-950 dark:bg-slate-950 dark:text-white">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-[#fbfcfe]/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-8 w-8" />
            <div><div className="text-[15px] font-bold tracking-tight">VentasPro</div><div className="hidden text-[9px] uppercase tracking-[.18em] text-slate-400 sm:block">Commercial OS</div></div>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex dark:text-slate-400">
            <button onClick={() => scrollTo("producto")} className="hover:text-slate-950 dark:hover:text-white">Producto</button>
            <button onClick={() => scrollTo("como-funciona")} className="hover:text-slate-950 dark:hover:text-white">Cómo funciona</button>
            <button onClick={() => scrollTo("soluciones")} className="hover:text-slate-950 dark:hover:text-white">Soluciones</button>
            <button onClick={() => scrollTo("precios")} className="hover:text-slate-950 dark:hover:text-white">Precios</button>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost"><Link href="/auth">Iniciar sesión</Link></Button>
            <Button asChild className="gap-2 rounded-xl px-4 shadow-lg shadow-indigo-500/20"><Link href="/auth?tab=register">Probar gratis <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
          </div>
          <button className="rounded-xl border border-slate-200 p-2.5 md:hidden dark:border-white/10" onClick={() => setMobileOpen((v) => !v)} aria-label="Menú">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-slate-200 bg-white md:hidden dark:border-white/10 dark:bg-slate-950">
              <div className="space-y-2 px-4 py-4">
                {([["producto","Producto"],["como-funciona","Cómo funciona"],["soluciones","Soluciones"],["precios","Precios"]] as const).map(([id,label]) =>
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 dark:text-slate-300">{label}</button>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2"><Button asChild variant="outline"><Link href="/auth">Iniciar sesión</Link></Button><Button asChild><Link href="/auth?tab=register">Probar gratis</Link></Button></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_10%,rgba(99,102,241,.10),transparent_28%),radial-gradient(circle_at_88%_15%,rgba(56,189,248,.08),transparent_25%)]" />
          <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:gap-16 lg:pt-24">
            <div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
                <Badge variant="outline" className="mb-6 gap-1.5 rounded-full border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  <Sparkles className="h-3.5 w-3.5" /> Plataforma comercial con IA
                </Badge>
                <h1 className="max-w-2xl text-4xl font-black leading-[.98] tracking-[-.045em] sm:text-5xl lg:text-[4.35rem]">
                  El sistema que conecta
                  <span className="block text-indigo-600 dark:text-indigo-400">tu proceso comercial.</span>
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-slate-500 sm:text-lg dark:text-slate-400">
                  VentasPro reúne conversaciones, agentes IA, catálogo, páginas de venta, campañas, pagos y métricas para que puedas operar tu negocio desde un solo lugar.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base shadow-xl shadow-indigo-500/20"><Link href="/auth?tab=register">Probar VentasPro <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
                  <Button size="lg" variant="outline" className="h-12 rounded-xl bg-white/80 px-6 text-base dark:bg-slate-950/70" onClick={() => scrollTo("como-funciona")}>Ver cómo funciona</Button>
                </div>
                <div className="mt-6 grid max-w-xl grid-cols-1 gap-2.5 text-xs text-slate-500 sm:grid-cols-2 dark:text-slate-400">
                  <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-indigo-500" /> Datos aislados por negocio</span>
                  <span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-indigo-500" /> Automatización configurable</span>
                </div>
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0, scale: .96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .65, delay: .1 }}>
              <HeroProduct />
            </motion.div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
          <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-slate-200 dark:sm:divide-white/10">
            {[
              ["8","agentes en el plan Pro"],["15.000","mensajes / mes en Pro"],["7","días de prueba"],["1","panel para dirigir la operación"]
            ].map(([value,label]) => <div key={label} className="border-b border-slate-200 px-4 py-7 text-center last:border-b-0 sm:border-b-0 dark:border-white/10"><div className="text-2xl font-black tracking-tight sm:text-3xl">{value}</div><div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{label}</div></div>)}
          </div>
        </section>

        <section id="producto" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Una sola capa operativa</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl lg:text-5xl">No necesitas más herramientas.<span className="block text-slate-400 dark:text-slate-600">Necesitas que trabajen juntas.</span></h2>
            <p className="mt-5 text-base leading-7 text-slate-500 sm:text-lg dark:text-slate-400">VentasPro conecta las piezas que normalmente están separadas y las convierte en un flujo comercial continuo.</p>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-2">{PILLARS.map((pillar,index) => <PillarCard key={pillar.number} pillar={pillar} index={index} />)}</div>
        </section>

        <section id="como-funciona" className="border-y border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 sm:py-28 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <Reveal>
              <p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Cómo funciona</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">De la primera visita a la operación diaria.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-500 dark:text-slate-400">La automatización no tiene que ser una caja negra: conectas, configuras, revisas y escalas.</p>
              <div className="mt-8 space-y-6">
                {[
                  ["01","Conecta","Integra tus canales, catálogo y métodos de pago."],
                  ["02","Configura","Define agentes, personalidad, reglas y objetivos."],
                  ["03","Automatiza","Deja que la IA ejecute tareas repetitivas y prepare acciones."],
                  ["04","Dirige","Revisa conversaciones, campañas y métricas desde el panel."],
                ].map(([num,title,text]) => <div key={num} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">{num}</span><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p></div></div>)}
              </div>
            </Reveal>
            <Reveal delay={.1}><BrowserFrame image="/screens/panel.jpg" alt="Panel de VentasPro" /></Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Operación con IA</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl lg:text-5xl">Atlas convierte instrucciones en trabajo.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg dark:text-slate-400">Investigación, páginas, campañas y configuración de tu operación comercial en un flujo guiado por IA.</p>
          </Reveal>
          <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-center">
            <Reveal><div className="rounded-[28px] border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-slate-900/20"><div className="flex items-center gap-3 border-b border-white/10 pb-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-indigo-300"><Compass className="h-4 w-4" /></div><div><div className="text-sm font-semibold text-white">Atlas</div><div className="text-[10px] text-white/50">Operación con IA</div></div><span className="ml-auto rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">Listo para revisar</span></div><div className="space-y-3 pt-5">{[["01","Investigar","Analizar mercado y competencia."],["02","Preparar","Construir página y mensaje comercial."],["03","Configurar","Dejar campaña y automatizaciones listas."],["04","Revisar","Confirmar antes de acciones sensibles."]].map(([n,t,d]) => <div key={n} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-[10px] font-bold text-indigo-300">{n}</span><div><div className="text-xs font-semibold text-white">{t}</div><div className="text-[11px] leading-5 text-white/50">{d}</div></div><Check className="ml-auto h-4 w-4 text-emerald-400" /></div>)}</div></div></Reveal>
            <Reveal delay={.1}><BrowserFrame image="/screens/m-atlas.jpg" alt="Atlas en VentasPro" /></Reveal>
          </div>
        </section>

        <section id="soluciones" className="border-y border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[.02]">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
            <Reveal className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Para distintos modelos de negocio</p><h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">Una base tecnológica. Diferentes formas de vender.</h2></Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{USE_CASES.map((item,index) => { const Icon=item.icon; return <Reveal key={item.title} delay={index*.05}><div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-5 w-5" /></div><h3 className="mt-5 font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.text}</p></div></Reveal> })}</div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="text-center"><p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Producto en detalle</p><h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">Todo lo que ocurre, visible.</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg dark:text-slate-400">Una interfaz pensada para que las funciones complejas se sientan simples.</p></Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{SHOWCASE.map((item,index) => { const Icon=item.icon; return <Reveal key={item.id} delay={(index%3)*.05}><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"><Icon className="h-4 w-4" /></div><div><div className="text-xs font-bold">{item.label}</div><div className="text-[10px] text-slate-400">{item.eyebrow}</div></div></div><div className="h-64 overflow-hidden bg-slate-100 dark:bg-slate-900"><img src={item.image} alt={item.title} className="h-full w-full object-cover object-top transition-transform duration-700 hover:scale-[1.025]" loading="lazy" /></div></div></Reveal> })}</div>
        </section>

        <section id="precios" className="border-y border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
            <Reveal className="mx-auto max-w-2xl text-center"><p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Precios</p><h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">Empieza simple. Escala cuando lo necesites.</h2><p className="mt-5 text-base leading-7 text-slate-500 dark:text-slate-400">7 días de prueba, sin tarjeta.</p></Reveal>
            {plans.length>0 && <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">{plans.map((plan,index) => <Reveal key={plan.id} delay={index*.06}><div className={"relative flex h-full flex-col rounded-[24px] border p-7 " + (index===1 ? "border-indigo-300 bg-indigo-50/70 shadow-xl shadow-indigo-500/10 dark:border-indigo-400/30 dark:bg-indigo-500/[.07]" : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950")}><h3 className="text-lg font-bold">{plan.name}</h3><div className="mt-4"><span className="text-4xl font-black tracking-tight">{"$"}{plan.price}</span><span className="text-sm text-slate-500"> USD/mes</span></div><div className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300"><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> {plan.monthlyMessages.toLocaleString()} mensajes/mes</div><div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> {plan.maxAgents} agente{plan.maxAgents>1 ? "s" : ""}</div>{(plan.features||[]).slice(0,3).map((feature)=><div key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> {feature}</div>)}</div><Button asChild variant={index===1 ? "default" : "outline"} className="mt-8 w-full rounded-xl"><Link href="/auth?tab=register">Elegir {plan.name}</Link></Button></div></Reveal>)}</div>}
            <div className="mt-7 text-center"><Button asChild variant="ghost" className="gap-2 text-slate-500"><Link href="/pricing">Ver todos los planes <ArrowRight className="h-3.5 w-3.5" /></Link></Button></div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center"><p className="text-[11px] font-bold uppercase tracking-[.22em] text-indigo-600 dark:text-indigo-300">Preguntas frecuentes</p><h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">Lo importante antes de empezar.</h2></Reveal>
          <div className="mx-auto mt-10 divide-y divide-slate-200 rounded-[24px] border border-slate-200 bg-white px-6 dark:divide-white/10 dark:border-white/10 dark:bg-slate-950">{FAQS.map(([q,a],index)=><div key={q}><button onClick={()=>setOpenFaq(openFaq===index?null:index)} className="flex w-full items-center justify-between gap-6 py-5 text-left"><span className="text-sm font-semibold sm:text-base">{q}</span><ChevronDown className={"h-4 w-4 shrink-0 text-slate-400 transition-transform " + (openFaq===index ? "rotate-180":"")} /></button><AnimatePresence initial={false}>{openFaq===index && <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><p className="pb-5 pr-8 text-sm leading-6 text-slate-500 dark:text-slate-400">{a}</p></motion.div>}</AnimatePresence></div>)}</div>
        </section>

        <section className="px-4 pb-24 sm:px-6 sm:pb-28">
          <Reveal className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-[32px] bg-slate-950 px-7 py-14 text-center shadow-2xl sm:px-12 sm:py-20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,.28),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,.18),transparent_30%)]" />
              <div className="relative"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-indigo-300"><Bot className="h-6 w-6" /></div><h2 className="mx-auto mt-6 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Convierte tu operación comercial en un sistema.</h2><p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/55 sm:text-base">Centraliza tus canales, configura tus agentes y empieza a trabajar con una plataforma construida alrededor de tus ventas.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild size="lg" className="h-12 rounded-xl bg-white px-6 text-slate-950 hover:bg-white/90"><Link href="/auth?tab=register">Probar gratis <ArrowRight className="ml-1 h-4 w-4" /></Link></Button><Button size="lg" variant="outline" className="h-12 rounded-xl border-white/15 bg-transparent px-6 text-white hover:bg-white/10" onClick={()=>scrollTo("producto")}>Explorar el producto</Button></div></div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5"><img src="/logo-mark.svg" alt="VentasPro" className="h-7 w-7" /><div><div className="text-sm font-bold">VentasPro</div><div className="text-[10px] text-slate-400">Commercial OS</div></div></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400"><Link href="/pricing">Precios</Link><Link href="/privacidad">Privacidad</Link><Link href="/auth">Iniciar sesión</Link></div>
          <div className="text-xs text-slate-400">© {new Date().getFullYear()} VentasPro</div>
        </div>
      </footer>
    </div>
  );
}
