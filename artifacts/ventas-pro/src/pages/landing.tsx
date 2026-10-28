import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Bot,
  MessageCircle,
  LayoutDashboard,
  ShieldCheck,
  Zap,
  Check,
  ArrowRight,
  Mail,
  Menu,
  X,
  Globe,
  Megaphone,
  Receipt,
} from "lucide-react";

// ─── Datos ──────────────────────────────────────────────────────────────
// Solo afirmaciones que el producto realmente cumple hoy (verificadas en el
// código) -- nada de cifras de clientes o testimonios inventados. La prueba
// social acá es "esto es lo que la plataforma hace", no "esto dice fulano".
// El CÓMO en cinco pasos. Una línea cada uno: el detalle de cada pieza está
// en los pilares y no se repite (30-09-2026: la página decía lo mismo 5 veces).
const ECOSYSTEM_STEPS = [
  { icon: Megaphone, title: "Atlas trae clientes", desc: "Publica el anuncio y la página de venta." },
  { icon: MessageCircle, title: "El cliente escribe", desc: "Desde el anuncio, la página o tu tienda." },
  { icon: Bot, title: "Sofía lo atiende", desc: "Responde, resuelve dudas y lo lleva a comprar." },
  { icon: Receipt, title: "Cobras y entregas", desc: "Pago en línea, transferencia o contraentrega." },
  { icon: LayoutDashboard, title: "Tú diriges", desc: "Todo queda en el panel, con el siguiente paso sugerido." },
];

/**
 * Los cuatro pilares de la plataforma. Cada punto existe en el código
 * (rutas y herramientas de Atlas verificadas el 2026-09-18); nada aspiracional.
 * `img` son las escenas de scripts/portada-fotos.mjs: fotos reales (Pexels)
 * con las capturas reales del producto puestas en la pantalla. Cada sección
 * muestra una pantalla distinta.
 */
const PILARES = [
  {
    icon: MessageCircle,
    tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    eyebrow: "Sofía, tu vendedora",
    title: "Vender por chat",
    desc: "Atiende WhatsApp, Messenger y comentarios de Facebook con tu catálogo, y aprende lo que le enseñas.",
    items: [
      "Presenta, cotiza y cierra con el flujo de un vendedor humano",
      "Lee comprobantes de pago con visión y los deja listos para aprobar",
      "Cupones reales, seguimientos automáticos y campañas por WhatsApp o correo",
      "Hasta 8 vendedoras con distinta personalidad por negocio",
      "Se protege de bloqueos: escribe y graba audios como humano, y baja el ritmo sola si detecta riesgo",
    ],
    img: { src: "/screens/gen/sofia.webp", alt: "Celular con Sofía pasando el precio y el Nequi, y recibiendo el comprobante de pago", w: 1200, h: 1400 },
  },
  {
    icon: Globe,
    tint: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    eyebrow: "Landing Studio y tu Tienda",
    title: "Vender por la web",
    desc: "Tienda online propia y páginas de venta armadas con las fotos reales de tus productos.",
    items: [
      "Tienda con catálogo, categorías y checkout MercadoPago / PayPal",
      "Landing pages pensadas para el celular, con fotos reales, editables por chat y con URL lista para el anuncio",
      "Dropshipping: importas de Dropi en lote, cotizas el envío y el pedido sale contraentrega",
      "Fichas de producto escritas solas desde una foto o un Excel",
    ],
    img: { src: "/screens/gen/tienda.webp", alt: "Mujer mostrando en su celular la página de venta del curso de piano", w: 1200, h: 1400 },
  },
  {
    icon: LayoutDashboard,
    tint: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    eyebrow: "El panel",
    title: "Dirigir el negocio",
    desc: "Responde «¿qué está pasando?» y «¿qué hago ahora?», con Atlas revisando tu negocio y proponiendo el siguiente paso.",
    items: [
      "Bandeja de conversaciones en vivo con control manual cuando quieras",
      "Prospectos, embudo, tiempo de respuesta y valor generado",
      "Diagnóstico de qué le falta a tu negocio y ruta guiada paso a paso",
    ],
    img: { src: "/screens/gen/inbox-web.webp", alt: "Laptop con la bandeja de entrada de VentasPro y las conversaciones en vivo", w: 1600, h: 1000 },
  },
];

// Con qué se conecta, con el logo oficial de cada servicio
// (public/integraciones/). Cada una existe en la app (07-10-2026): Integraciones
// (Shopify, Mercado Libre, AliExpress, Falabella, Facebook e Instagram),
// /woocommerce, /dropi, Telegram (avisos y Atlas) y el webhook de Meta
// (Messenger, Instagram Direct y comentarios). Lo que hace cada una sale de
// su pantalla: no se promete nada que no esté.
type Integracion = { nombre: string; que: string; logo?: string };
const INTEGRACIONES: { grupo: string; items: Integracion[] }[] = [
  {
    grupo: "Vende por chat",
    items: [
      { logo: "whatsapp.svg", nombre: "WhatsApp", que: "Sofía atiende y vende" },
      { logo: "messenger.svg", nombre: "Messenger", que: "Los mensajes de tu página" },
      { logo: "instagram.svg", nombre: "Instagram", que: "Mensajes directos" },
      { logo: "facebook.svg", nombre: "Facebook", que: "Responde los comentarios" },
    ],
  },
  {
    grupo: "Tiendas y marketplaces",
    items: [
      { logo: "shopify.svg", nombre: "Shopify", que: "Trae tus productos y pedidos" },
      { logo: "mercadolibre.png", nombre: "Mercado Libre", que: "Publica, importa y trae ventas" },
      { logo: "woocommerce.png", nombre: "WooCommerce", que: "Sincroniza tu catálogo" },
      { logo: "falabella.png", nombre: "Falabella", que: "Pedidos del Seller Center" },
      { logo: "aliexpress.png", nombre: "AliExpress", que: "Lo más vendido, con fotos y video" },
    ],
  },
  {
    grupo: "Cobros",
    items: [
      { logo: "mercadopago.png", nombre: "Mercado Pago", que: "Pago en línea" },
      { logo: "paypal.svg", nombre: "PayPal", que: "Pago en línea" },
      { logo: "nequi.png", nombre: "Nequi", que: "Lee el comprobante" },
      { logo: "daviplata.png", nombre: "Daviplata", que: "Lee el comprobante" },
    ],
  },
  {
    grupo: "Envíos, anuncios y avisos",
    items: [
      { logo: "dropi.png", nombre: "Dropi", que: "Dropshipping contraentrega" },
      { logo: "meta.svg", nombre: "Meta Ads y Píxel", que: "Campañas y qué anuncio vendió" },
      { logo: "telegram.svg", nombre: "Telegram", que: "Avisos y Atlas en tu chat" },
      { nombre: "Correo", que: "Cupones y campañas" },
    ],
  },
];
const LOGOS = INTEGRACIONES.flatMap((g) => g.items).filter((i) => i.logo);

function LogoIntegracion({ i, tam = "md" }: { i: Integracion; tam?: "sm" | "md" }) {
  const caja = tam === "sm" ? "h-11 w-11 rounded-xl" : "h-14 w-14 rounded-2xl";
  const img = tam === "sm" ? "h-6 w-6" : "h-8 w-8";
  return (
    <span className={`flex shrink-0 items-center justify-center bg-white ring-1 ring-slate-200 shadow-sm ${caja}`}>
      {i.logo
        ? <img src={`/integraciones/${i.logo}`} alt="" className={`${img} object-contain${i.logo.endsWith(".png") ? " rounded-lg" : ""}`} loading="lazy" decoding="async" />
        : <Mail className={`${img} text-primary`} />}
    </span>
  );
}

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
  monthlyAiResponses?: number;
  maxConcurrentAi?: number;
  maxWhatsappNumbers?: number;
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
    ["herramientas", "Integraciones"],
    ["precios", "Precios"],
  ] as const;

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white overflow-x-hidden antialiased">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="VentasPro" className="h-8 w-8" />
            <span className="font-bold text-lg tracking-tight">VentasPro<sup className="ml-0.5 text-[10px] font-extrabold text-primary">IA</sup></span>
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
          {/* La escena de portada: Sofía respondiendo en un celular real.
              Foto real (Pexels) + captura real del producto. */}
          <Escena src="/screens/gen/hero.webp" alt="Mano sosteniendo un celular con Sofía respondiendo por WhatsApp la consulta por el curso de piano" w={1600} h={1100} eager movil={{ src: "/screens/gen/hero-m.webp", w: 1000, h: 1250 }} className="max-w-md mx-auto sm:max-w-none" />
        </motion.div>
      </section>

      {/* ── Se conecta con ── */}
      <section aria-label="Se conecta con" className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20 -mt-4">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Se conecta con lo que ya usas</p>
        <ul className="mt-6 flex flex-wrap justify-center gap-3 sm:gap-4">
          {LOGOS.map((i) => (
            <li key={i.nombre} title={i.nombre}><LogoIntegracion i={i} tam="sm" /><span className="sr-only">{i.nombre}</span></li>
          ))}
        </ul>
      </section>

      {/* ── Cifras ── */}
      <section className="border-y border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Cada numero sale de SAAS_PLANS (middleware/saasValidation.ts), que
              es el codigo que cobra de verdad. Reverificado el 2026-10-04 tras
              recalcular planes con margen: Pro = 8 agentes y 9.000 mensajes/mes
              (antes decia 15.000: falso); prueba gratis = 7 dias, 30 mensajes;
              canales donde el cliente puede comprar: WhatsApp, Messenger,
              Facebook y la tienda web. */}
          <StatCounter value={8} label="Vendedoras en el plan Pro" />
          <StatCounter value={9000} label="Mensajes al mes en el plan Pro" />
          <StatCounter value={4} label="Canales: WhatsApp, Messenger, Facebook y tienda" />
          <StatCounter value={7} label="Días de prueba gratis" />
        </div>
      </section>

      {/* ── Pilares ── */}
      <section id="pilares" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
        <Encabezado
          etiqueta="Mucho más que un bot de WhatsApp"
          titulo="Todo lo que hace por tu negocio"
          bajada="Vender por chat, vender por la web y dirigir el negocio. Cada pilar funciona solo y todos juntos cierran el ciclo."
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
              titulo="Dile «quiero anunciar este producto» y Atlas hace el resto"
              bajada="No es un generador de textos: es un operador que trabaja con los datos reales de tu producto. Tú apruebas cada paso."
            />
            <Reveal delay={0.1}>
              <ListaCheck
                claro
                items={[
                  "Investiga qué anuncia la competencia en la Biblioteca de Anuncios de Meta",
                  "Crea la landing page con tus fotos y la publica con URL lista para el anuncio",
                  "Sube la campaña a Facebook e Instagram en pausa: no gasta hasta que digas",
                  "Te explica en 3 líneas qué está pasando con cada campaña y qué hacer",
                  "Píxel y atribución: qué campaña trajo cada venta",
                  "Plan de contenido orgánico y publicación en tu página",
                  "Configura y entrena a Sofía desde la misma conversación",
                ]}
              />
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            {/* Atlas en una laptop real, armando la campaña paso a paso. */}
            <Escena src="/screens/gen/atlas-duo.webp" alt="Laptop con Atlas armando la página de venta y el anuncio paso a paso" w={1600} h={1150} className="ring-white/15" />
          </Reveal>
        </div>
      </section>

      {/* ── Ecosistema ── */}
      <section id="ecosistema" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
        <Encabezado
          etiqueta="El ecosistema completo"
          titulo="Del anuncio a la venta cerrada"
          bajada="Lo que Atlas anuncia lo vende Sofía, y lo que Sofía vende lo cobras y lo entregas desde el mismo panel."
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
            etiqueta="Ya viene conectado"
            titulo="Integraciones listas"
            bajada="Tus canales, tiendas, cobros y envíos en un solo panel. Las conectas desde Integraciones, sin programar."
          />
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {INTEGRACIONES.map((g, gi) => (
              <Reveal key={g.grupo} delay={gi * 0.06}>
                <div className="h-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 dark:border-white/10 dark:bg-slate-900/60">
                  <h3 className="text-lg font-bold">{g.grupo}</h3>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {g.items.map((i) => (
                      <li key={i.nombre} className="flex items-center gap-3.5">
                        <LogoIntegracion i={i} />
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight">{i.nombre}</p>
                          <p className="mt-0.5 text-[15px] leading-snug text-slate-600 dark:text-slate-300">{i.que}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
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
          titulo="Empieza gratis y crece cuando lo necesites"
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
                      <li className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {plan.monthlyMessages.toLocaleString("es")} mensajes WhatsApp/mes · hasta {Math.ceil(plan.monthlyMessages / 30)} al día</li>
                      <li className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {(plan.monthlyAiResponses ?? plan.monthlyMessages).toLocaleString("es")} respuestas IA/mes · hasta {Math.ceil((plan.monthlyAiResponses ?? plan.monthlyMessages) / 30)} al día</li>
                      {plan.maxConcurrentAi != null && <li className="flex gap-2.5"><Check className="h-5 w-5 shrink-0 mt-0.5" /> {plan.maxConcurrentAi} conversaciones IA simultáneas</li>}
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
              Conecta tu WhatsApp en minutos y deja que Sofía se encargue del resto.
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
            <span className="font-bold text-sm">VentasPro<sup className="ml-0.5 text-[9px] font-extrabold text-primary">IA</sup></span>
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
