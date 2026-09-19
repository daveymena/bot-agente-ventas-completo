import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
  CreditCard,
  Menu,
  X,
  Wand2,
  Globe,
  Megaphone,
  Receipt,
  Search,
  Ticket,
  Truck,
  Compass,
} from "lucide-react";

// ─── Datos ──────────────────────────────────────────────────────────────
// Solo afirmaciones que el producto realmente cumple hoy (verificadas en el
// código) -- nada de cifras de clientes o testimonios inventados. La prueba
// social acá es "esto es lo que la plataforma hace", no "esto dice fulano".
const ECOSYSTEM_STEPS = [
  {
    icon: Megaphone,
    title: "Atlas trae clientes",
    desc: "Investiga la competencia, arma la página de venta, escribe el anuncio y lo sube a Meta en pausa. Vos aprobás; él ejecuta.",
  },
  {
    icon: MessageCircle,
    title: "El cliente escribe",
    desc: "Por WhatsApp, Messenger o un comentario en Facebook. Sofía responde en segundos con tu catálogo y el tono de tu negocio.",
  },
  {
    icon: Bot,
    title: "Sofía vende de verdad",
    desc: "Presenta el producto, da el precio cuando lo piden, resuelve objeciones y pasa a los medios de pago en el momento justo.",
  },
  {
    icon: Receipt,
    title: "Cobra y entrega",
    desc: "Link de MercadoPago o PayPal, transferencia con comprobante leído solo, o contraentrega con pedido en Dropi o WooCommerce.",
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
 * `img` son las escenas generadas con scripts/generar-imagenes-portada.mjs a
 * partir de las capturas reales del producto.
 */
const PILARES = [
  {
    icon: MessageCircle,
    tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    eyebrow: "Sofía, tu vendedora",
    title: "Vender por chat",
    desc: "Atiende WhatsApp, Messenger y comentarios de Facebook con tu catálogo, y aprende lo que le enseñás.",
    items: [
      "Presenta, cotiza y cierra con el flujo de un vendedor humano",
      "Lee comprobantes de pago con visión y los deja listos para aprobar",
      "Cupones reales, seguimientos automáticos y campañas por WhatsApp o correo",
      "Hasta 8 vendedoras con distinta personalidad por negocio",
    ],
    img: { src: "/screens/gen/sofia.webp", alt: "Sofía vendiendo el curso de piano por WhatsApp", w: 1200, h: 1400 },
  },
  {
    icon: Megaphone,
    tint: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    eyebrow: "Atlas, tu agencia en un chat",
    title: "Atraer clientes",
    desc: "De «quiero anunciar esto» a una campaña en Meta, en pausa, lista para activar.",
    items: [
      "Investiga la competencia en la Biblioteca de Anuncios de Meta",
      "Escribe el anuncio con los datos reales del producto y lo sube a Facebook e Instagram",
      "Píxel, atribución y radiografía de cada campaña en lenguaje de dueño",
      "Plan de contenido orgánico y publicación en tu página",
    ],
    img: { src: "/screens/gen/atlas-web.webp", alt: "Atlas ejecutando la ruta de marketing", w: 1600, h: 1000 },
  },
  {
    icon: Globe,
    tint: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    eyebrow: "Landing Studio y tu Tienda",
    title: "Vender por la web",
    desc: "Tienda online propia y páginas de venta armadas con las fotos reales de tus productos.",
    items: [
      "Tienda con catálogo, categorías y checkout MercadoPago / PayPal",
      "Landing pages con estructura AIDA, editables por chat y con URL pública lista para el anuncio",
      "Dropshipping: importás de Dropi, sincronizás con WooCommerce, pedido contraentrega",
      "Fichas de producto escritas solas desde una foto o un Excel",
    ],
    img: { src: "/screens/gen/tienda.webp", alt: "Tu tienda online con el catálogo en vivo", w: 1200, h: 1400 },
  },
  {
    icon: LayoutDashboard,
    tint: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    eyebrow: "El panel",
    title: "Dirigir el negocio",
    desc: "Responde «¿qué está pasando?» y «¿qué hago ahora?», con Atlas revisando tu negocio y proponiendo el siguiente paso.",
    items: [
      "Bandeja de conversaciones en vivo con control manual cuando querés",
      "Prospectos, embudo, tiempo de respuesta y valor generado",
      "Diagnóstico de qué le falta a tu negocio y ruta guiada paso a paso",
      "Cada negocio con su WhatsApp, sus datos y su catálogo, aislados",
    ],
    img: { src: "/screens/gen/inbox-web.webp", alt: "Bandeja de entrada con control manual", w: 1600, h: 1000 },
  },
];

const TOOLS = [
  { icon: Bot, title: "Sofía, tu vendedora", desc: "WhatsApp, Messenger y comentarios de Facebook con el mismo cerebro y tu catálogo." },
  { icon: Compass, title: "Atlas, tu operador", desc: "Le hablás en tu idioma y él configura, investiga, crea y publica. Pide confirmación antes de gastar." },
  { icon: Wand2, title: "Landing Studio", desc: "Páginas de venta con fotos reales, formulario contraentrega o pago, y edición por chat." },
  { icon: Facebook, title: "Facebook e Instagram Ads", desc: "Borrador, campaña en pausa, activación, presupuesto, métricas y por qué no entrega." },
  { icon: Store, title: "Tienda online propia", desc: "Catálogo, categorías, importación por Excel y checkout integrado." },
  { icon: Truck, title: "Dropshipping", desc: "Importación desde Dropi, pedidos contraentrega y sincronización con WooCommerce." },
  { icon: Receipt, title: "Comprobantes leídos solos", desc: "Sofía lee la captura de Nequi o Daviplata y vos aprobás con un clic." },
  { icon: Ticket, title: "Cupones y seguimientos", desc: "Descuentos reales, follow-ups automáticos y envíos masivos por WhatsApp o correo." },
  { icon: Search, title: "Investigación real", desc: "Biblioteca de Anuncios de Meta y búsqueda web para decidir con datos, no de memoria." },
  { icon: CreditCard, title: "MercadoPago y PayPal", desc: "Cobrá ventas y suscripciones con los métodos que tus clientes ya usan." },
  { icon: BarChart3, title: "Analíticas y atribución", desc: "Embudo, tiempo de respuesta, valor generado y qué campaña trajo cada venta." },
  { icon: ShieldCheck, title: "Multi-negocio aislado", desc: "Cada cuenta con su propia sesión de WhatsApp, datos y catálogo, sin mezclas." },
];

// ─── Fondo del hero: un solo resplandor índigo arriba + trama de puntos que
// se desvanece. Reemplaza las manchas de color en movimiento y los iconos
// flotantes: el fondo acompaña al texto, no compite con él.
function FondoHero() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.26),transparent_70%)]" />
      <div
        className="absolute inset-0 opacity-50 dark:opacity-20 [mask-image:linear-gradient(180deg,black,transparent_85%)]"
        style={{
          backgroundImage: "radial-gradient(hsl(var(--primary)/0.45) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
    </div>
  );
}

// Imagen generada dentro de una tarjeta con borde y sombra. width/height
// reservan el espacio antes de cargar, así la página no salta.
// `movil` es una versión vertical de la misma escena para pantallas chicas,
// donde una imagen apaisada de 1600px queda ilegible.
function Escena({ src, alt, w, h, className = "", eager = false, movil }: { src: string; alt: string; w: number; h: number; className?: string; eager?: boolean; movil?: { src: string; w: number; h: number } }) {
  const img = <img src={src} alt={alt} width={w} height={h} className="block h-auto w-full" loading={eager ? "eager" : "lazy"} decoding="async" />;
  return (
    <div className={`overflow-hidden rounded-3xl ring-1 ring-slate-900/10 dark:ring-white/10 shadow-2xl shadow-slate-900/10 dark:shadow-black/40 ${className}`}>
      {movil ? (
        <picture>
          <source media="(min-width: 640px)" srcSet={src} width={w} height={h} />
          <img src={movil.src} alt={alt} width={movil.w} height={movil.h} className="block h-auto w-full" loading={eager ? "eager" : "lazy"} decoding="async" />
        </picture>
      ) : img}
    </div>
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
    <div ref={ref} className="text-center sm:text-left">
      <p className="text-4xl font-black tracking-tight text-primary tabular-nums">{count.toLocaleString("es")}{suffix}</p>
      <p className="mt-1.5 text-base text-slate-600 dark:text-slate-300">{label}</p>
    </div>
  );
}

// Encabezado de sección: etiqueta, título y bajada, con el mismo ritmo en
// toda la página para que el ojo sepa dónde empieza cada bloque.
function Encabezado({ etiqueta, titulo, bajada, alineado = "center", claro = false }: { etiqueta: string; titulo: string; bajada?: string; alineado?: "center" | "left"; claro?: boolean }) {
  const centrado = alineado === "center";
  return (
    <Reveal className={`${centrado ? "text-center mx-auto" : ""} max-w-3xl`}>
      <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${claro ? "text-indigo-300" : "text-primary"}`}>{etiqueta}</p>
      <h2 className={`mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1] ${claro ? "text-white" : "text-slate-900 dark:text-white"}`}>{titulo}</h2>
      {bajada && <p className={`mt-5 text-lg sm:text-xl leading-relaxed ${claro ? "text-slate-300" : "text-slate-600 dark:text-slate-300"}`}>{bajada}</p>}
    </Reveal>
  );
}

function ListaCheck({ items, claro = false }: { items: string[]; claro?: boolean }) {
  return (
    <ul className="mt-8 space-y-4">
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-3 text-base sm:text-lg leading-snug ${claro ? "text-slate-200" : "text-slate-700 dark:text-slate-200"}`}>
          <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${claro ? "bg-white/15 text-white" : "bg-primary/10 text-primary"}`}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
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

  const NAV = [
    ["pilares", "Qué hace"],
    ["ecosistema", "Cómo funciona"],
    ["herramientas", "Herramientas"],
    ["precios", "Precios"],
  ] as const;

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white overflow-x-hidden antialiased">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-8 w-8" />
            <span className="font-bold text-lg tracking-tight">VentasPro</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-8 text-[15px] font-medium text-slate-600 dark:text-slate-300">
            {NAV.map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="hover:text-slate-900 dark:hover:text-white transition-colors">{label}</button>
            ))}
          </nav>
          <div className="hidden lg:flex items-center gap-2">
            <Button asChild variant="ghost"><Link href="/auth">Iniciar sesión</Link></Button>
            <Button asChild className="gap-1.5 rounded-full px-5"><Link href="/auth?tab=register">Comenzar gratis <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
          </div>
          <button className="lg:hidden p-2" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Menú">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-slate-200 dark:border-white/10 overflow-hidden"
            >
              <div className="px-4 py-4 flex flex-col gap-1">
                {NAV.map(([id, label]) => (
                  <button key={id} onClick={() => scrollTo(id)} className="text-left text-base font-medium py-2.5">{label}</button>
                ))}
                <Button asChild variant="outline" className="w-full mt-2"><Link href="/auth">Iniciar sesión</Link></Button>
                <Button asChild className="w-full"><Link href="/auth?tab=register">Comenzar gratis</Link></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Hero ── */}
      <section className="relative">
        <FondoHero />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10 text-center">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Zap className="h-3.5 w-3.5" /> 7 días gratis · sin tarjeta
            </span>
            <h1 className="mx-auto mt-7 max-w-4xl text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02]">
              Tu negocio vendiendo solo: <span className="text-primary">ventas, marketing y tienda</span> en un solo lugar
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg sm:text-xl leading-relaxed text-slate-600 dark:text-slate-300">
              Sofía atiende y vende por WhatsApp, Messenger y Facebook. Atlas investiga, arma tu página de venta y publica tus anuncios.
              Tienda, landings, dropshipping y cobros, todo en el mismo panel.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
              <Button asChild size="lg" className="rounded-full gap-2 text-base px-8 h-12">
                <Link href="/auth?tab=register">Comenzar gratis <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full text-base px-8 h-12" onClick={() => scrollTo("pilares")}>
                Ver todo lo que hace
              </Button>
            </div>
            <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4" /> Cada negocio con su propia sesión aislada: sin mezclas de datos entre clientes.
            </p>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24"
        >
          {/* La escena de portada: Atlas armando la campaña, Sofía vendiendo y
              la página de venta que salió. Generada de capturas reales. */}
          <Escena src="/screens/gen/hero.webp" alt="Atlas, Sofía y la página de venta, con capturas reales del producto" w={1600} h={1100} eager movil={{ src: "/screens/gen/hero-m.webp", w: 1000, h: 1250 }} className="max-w-md mx-auto sm:max-w-none" />
        </motion.div>
      </section>

      {/* ── Cifras ── */}
      <section className="border-y border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Cada numero sale de SAAS_PLANS (middleware/saasValidation.ts), que
              es el codigo que cobra de verdad. Verificado uno por uno el
              2026-08-22: Pro = 8 agentes, 15.000 mensajes/mes; prueba gratis =
              7 dias, 30 mensajes; canales donde el cliente puede comprar:
              WhatsApp, Messenger, Facebook y la tienda web. */}
          <StatCounter value={8} label="Vendedoras en el plan Pro" />
          <StatCounter value={15000} label="Mensajes al mes en el plan Pro" />
          <StatCounter value={4} label="Canales: WhatsApp, Messenger, Facebook y tienda" />
          <StatCounter value={7} label="Días de prueba gratis" />
        </div>
      </section>

      {/* ── Pilares ── */}
      <section id="pilares" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
        <Encabezado
          etiqueta="Mucho más que un bot de WhatsApp"
          titulo="Cuatro cosas que hace por tu negocio"
          bajada="Vender, atraer, vender por la web y dirigir. Cada una funciona sola y todas juntas hacen el ciclo completo."
        />
        <div className="mt-16 sm:mt-20 space-y-20 sm:space-y-28">
          {PILARES.map((p, i) => {
            const invertido = i % 2 === 1;
            return (
              <div key={p.title} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <Reveal className={invertido ? "lg:order-2" : ""}>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${p.tint}`}>
                    <p.icon className="h-4 w-4" /> {p.eyebrow}
                  </span>
                  <h3 className="mt-5 text-3xl sm:text-4xl font-black tracking-tight leading-tight">{p.title}</h3>
                  <p className="mt-4 text-lg sm:text-xl leading-relaxed text-slate-600 dark:text-slate-300">{p.desc}</p>
                  <ListaCheck items={p.items} />
                </Reveal>
                <Reveal delay={0.1} className={`${invertido ? "lg:order-1" : ""} ${p.img.h > p.img.w ? "max-w-md mx-auto w-full lg:max-w-none" : ""}`}>
                  <Escena {...p.img} />
                </Reveal>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Atlas (banda oscura) ── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_20%_10%,hsl(var(--primary)/0.35),transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(45%_50%_at_90%_90%,rgba(124,58,237,0.28),transparent_65%)]" />
          <div
            className="absolute inset-0 opacity-20 [mask-image:linear-gradient(180deg,black,transparent)]"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "26px 26px" }}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Encabezado
              claro
              alineado="left"
              etiqueta="Atlas · tu agencia en un chat"
              titulo="Decile «quiero anunciar este curso» y Atlas hace el resto"
              bajada="No es un generador de textos: es un operador que investiga la competencia, arma la página de venta, escribe el anuncio con los datos reales de tu producto y lo sube a Meta en pausa. Vos aprobás cada paso."
            />
            <Reveal delay={0.1}>
              <ListaCheck
                claro
                items={[
                  "Investiga qué anuncia la competencia en la Biblioteca de Anuncios de Meta",
                  "Crea la landing page con tus fotos y la publica con URL lista para el anuncio",
                  "Sube la campaña a Facebook e Instagram en pausa: no gasta hasta que digas",
                  "Te explica en 3 líneas qué está pasando con cada campaña y qué hacer",
                  "Configura y entrena a Sofía desde la misma conversación",
                ]}
              />
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            {/* El chat de Atlas y la página que salió de él, lado a lado. */}
            <Escena src="/screens/gen/atlas-duo.webp" alt="Atlas paso a paso y la página de venta que armó" w={1600} h={1150} className="ring-white/15" />
          </Reveal>
        </div>
      </section>

      {/* ── Ecosistema ── */}
      <section id="ecosistema" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
        <Encabezado
          etiqueta="El ecosistema completo"
          titulo="Del anuncio a la venta cerrada, sin que se te escape un cliente"
          bajada="Cada pieza se conecta con las demás: lo que Atlas anuncia lo vende Sofía, y lo que Sofía vende lo cobrás y lo entregás desde el mismo panel."
        />
        <ol className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {ECOSYSTEM_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.07}>
              <li className="relative h-full rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-400">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold leading-snug">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{step.desc}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Herramientas ── */}
      <section id="herramientas" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28 dark:border-white/10 dark:bg-white/[0.03] scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Encabezado
            etiqueta="Todo en un solo panel"
            titulo="Las herramientas, una por una"
            bajada="Sin integraciones que armar: ya vienen conectadas entre sí."
          />
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TOOLS.map((tool, i) => (
              <Reveal key={tool.title} delay={(i % 3) * 0.06}>
                <div className="h-full rounded-3xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <tool.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{tool.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{tool.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
        <Encabezado
          etiqueta="Planes simples"
          titulo="Empezá gratis, crecé cuando lo necesites"
          bajada="7 días de prueba con 30 mensajes. Sin tarjeta."
        />
        {plans.length > 0 && (
          <div className="mt-14 grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            {plans.map((plan, i) => {
              const destacado = i === 1;
              return (
                <Reveal key={plan.id} delay={i * 0.1}>
                  <div className={`relative h-full rounded-3xl border p-7 flex flex-col ${destacado ? "border-primary bg-primary text-white shadow-2xl shadow-primary/30" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"}`}>
                    {destacado && <span className="absolute -top-3 left-7 rounded-full bg-white px-3 py-1 text-xs font-bold text-primary shadow">Más elegido</span>}
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="mt-3 mb-6">
                      <span className="text-4xl font-black tracking-tight">${plan.price}</span>
                      <span className={`text-base ${destacado ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}> USD/mes</span>
                    </p>
                    <ul className={`space-y-3 text-base flex-1 ${destacado ? "text-white/90" : "text-slate-700 dark:text-slate-200"}`}>
                      <li className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {plan.monthlyMessages.toLocaleString("es")} mensajes al mes</li>
                      <li className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {plan.maxAgents} vendedora{plan.maxAgents > 1 ? "s" : ""}</li>
                      {(plan.features || []).slice(0, 2).map(f => (
                        <li key={f} className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {f}</li>
                      ))}
                    </ul>
                    <Button asChild size="lg" variant={destacado ? "secondary" : "outline"} className="mt-8 w-full rounded-full">
                      <Link href="/auth?tab=register">Comenzar gratis</Link>
                    </Button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
        <div className="text-center mt-10">
          <Button asChild variant="ghost" size="lg" className="gap-2 text-base">
            <Link href="/pricing">Ver todos los planes y comparar <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="px-4 sm:px-6 pb-20 sm:pb-28">
        <Reveal className="relative max-w-6xl mx-auto overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-indigo-600 to-violet-700 px-6 py-16 sm:px-12 sm:py-20 text-center text-white">
          <div
            aria-hidden
            className="absolute inset-0 opacity-25 [mask-image:radial-gradient(60%_60%_at_50%_50%,black,transparent)]"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.1]">Tu próximo cliente ya te está escribiendo</h2>
            <p className="mt-5 text-lg sm:text-xl text-white/85 max-w-xl mx-auto leading-relaxed">
              Conectá tu WhatsApp en minutos y dejá que Sofía se encargue del resto.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-9 rounded-full gap-2 text-base px-9 h-12">
              <Link href="/auth?tab=register"><Zap className="h-4 w-4" /> Comenzar gratis ahora</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-6 w-6" />
            <span className="font-bold text-sm">VentasPro</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-300">
            <Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Precios</Link>
            <Link href="/privacidad" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacidad</Link>
            <Link href="/auth" className="hover:text-slate-900 dark:hover:text-white transition-colors">Iniciar sesión</Link>
          </nav>
          <p className="text-sm text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} VentasPro</p>
        </div>
      </footer>
    </div>
  );
}
