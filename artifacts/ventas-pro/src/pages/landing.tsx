import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare, Bot, Zap, Star, Check,
  ChevronDown, ArrowRight, Menu, X, Phone,
  CreditCard, Package, BarChart3, Sparkles,
  Clock, DollarSign, CheckCircle2, Brain, Store, Rocket
} from "lucide-react";

/* ─── Data ─────────────────────────────────────────── */
const TICKER = [
  "🤖 Agente IA que vende 24/7","💬 WhatsApp automatizado","💳 Pagos MercadoPago y PayPal",
  "📊 Dashboard en tiempo real","🛍️ Catálogo de productos","🎯 Embudo de ventas",
  "🧠 10 motores de IA","📦 WooCommerce integrado","🔔 Alertas instantáneas","📱 100% mobile-friendly",
];

const FEATURES = [
  { icon: Bot, grad: "from-orange-500 to-amber-400", stat: "24/7 activo",
    title: "Agente Sofía — IA de Ventas",
    desc: "Tu vendedora virtual trabaja las 24 horas. Atiende clientes, responde preguntas, maneja objeciones y cierra ventas automáticamente por WhatsApp." },
  { icon: MessageSquare, grad: "from-green-500 to-emerald-400", stat: "+300% más ventas",
    title: "WhatsApp Integrado",
    desc: "Conecta tu número en segundos. El agente responde automáticamente, envía catálogos, imágenes y links de pago directamente en el chat." },
  { icon: CreditCard, grad: "from-blue-500 to-cyan-400", stat: "3 pasarelas",
    title: "Pagos Sin Fricción",
    desc: "MercadoPago, PayPal y transferencia bancaria integrados. El agente genera links de pago por producto y los envía al cliente en el chat." },
  { icon: Brain, grad: "from-purple-500 to-violet-400", stat: "10 proveedores",
    title: "10 Motores de IA",
    desc: "Elige entre GPT-4o, Claude, Gemini, Groq, DeepSeek y más. Define un proveedor principal y fallbacks automáticos para máxima disponibilidad." },
  { icon: BarChart3, grad: "from-pink-500 to-rose-400", stat: "Métricas en vivo",
    title: "Dashboard Completo",
    desc: "Conversaciones activas, tasa de conversión, ingresos del mes, embudo de ventas y actividad reciente. Todo en tiempo real." },
  { icon: Store, grad: "from-teal-500 to-cyan-400", stat: "Catálogo ilimitado",
    title: "Tienda Virtual + WooCommerce",
    desc: "Catálogo con fotos y precios. Importa desde WooCommerce o crea el tuyo. El agente presenta los productos automáticamente." },
];

const PLANS = [
  { name: "Básico", price: 29, popular: false, cta: "Iniciar prueba gratis",
    features: ["1 agente IA","500 mensajes/mes","WhatsApp incluido","MercadoPago + PayPal","Dashboard básico","Soporte por email"] },
  { name: "Profesional", price: 79, popular: true, cta: "Iniciar prueba gratis",
    features: ["3 agentes IA","Mensajes ilimitados","Multi-número WhatsApp","Todas las pasarelas","Analytics avanzado","Tienda virtual","WooCommerce sync","10 motores de IA","Soporte 24/7"] },
  { name: "Empresarial", price: 199, popular: false, cta: "Hablar con ventas",
    features: ["Agentes ilimitados","Mensajes ilimitados","Multi-tenant","API access completo","Integraciones custom","Onboarding dedicado","SLA 99.9% uptime","Manager de cuenta"] },
];

const TESTIMONIALS = [
  { name: "Carlos Medina", biz: "Tienda tech — Bogotá", av: "CM", color: "#f97316",
    text: "Antes me perdía ventas de noche. Ahora Sofía atiende sola y vendí más de $8M el mes pasado solo con WhatsApp." },
  { name: "Laura Torres", biz: "Boutique de ropa — Medellín", av: "LT", color: "#a855f7",
    text: "En la primera semana de prueba ya recuperé la inversión del año. El agente responde mejor que yo en muchos casos." },
  { name: "Miguel Ángel Ríos", biz: "Distribuidora — Cali", av: "MR", color: "#22c55e",
    text: "Manejamos 200+ pedidos diarios por WhatsApp. El dashboard me dice exactamente qué está pasando en tiempo real." },
];

const FAQS = [
  { q: "¿Necesito saber programar?", a: "No. Conectas tu WhatsApp escaneando un QR, cargas tus productos y el agente IA empieza a atender clientes automáticamente." },
  { q: "¿Qué pasa después de los 7 días de prueba?", a: "Al terminar te pedimos un método de pago. Si decides no seguir, no se cobra nada. Sin compromisos." },
  { q: "¿Puedo cambiar de plan?", a: "Sí, en cualquier momento. Los cambios aplican inmediatamente y el cobro se prorratea." },
  { q: "¿El agente entiende español latinoamericano?", a: "Sí, optimizado para español colombiano y latinoamericano. Configuras el tono, personalidad y vocabulario." },
  { q: "¿Cuántos WhatsApp puedo conectar?", a: "Básico: 1 número. Profesional: múltiples. Empresarial: ilimitados. Cada número tiene su propio agente." },
  { q: "¿Puedo usar mis propias keys de IA?", a: "Sí. En 'Motores de IA' configuras tus propias API keys para cualquiera de los 10 proveedores." },
];

/* ─── NavBar ────────────────────────────────────────── */
function NavBar({ setLoc }: { setLoc: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const navStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
    transition: "all 0.3s",
    background: scrolled ? "rgba(10,10,20,0.92)" : "transparent",
    backdropFilter: scrolled ? "blur(20px)" : undefined,
    borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "none",
  };
  return (
    <nav style={navStyle}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#ff6b2b,#ff9f0a)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(255,107,43,0.4)" }}>
              <span style={{ color: "white", fontWeight: 900, fontSize: 18 }}>V</span>
            </div>
            <div>
              <div style={{ fontWeight: 900, color: "white", fontSize: 17, lineHeight: 1.1 }}>VentasPro</div>
              <div style={{ fontSize: 9, color: "#f97316", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>IA Sales Engine</div>
            </div>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex" style={{ gap: 32, alignItems: "center" }}>
            {["#features","#pricing","#testimonials","#faq"].map((h, i) => (
              <a key={h} href={h} style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "white")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}>
                {["Funciones","Precios","Testimonios","FAQ"][i]}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex" style={{ gap: 10, alignItems: "center" }}>
            <button onClick={() => setLoc("/auth")} style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, fontSize: 14, background: "none", border: "none", cursor: "pointer", padding: "8px 16px" }}
              onMouseEnter={e => (e.currentTarget.style.color = "white")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>
              Iniciar sesión
            </button>
            <button onClick={() => setLoc("/auth?tab=register")} className="btn-landing-primary" style={{ padding: "10px 22px", fontSize: 14, gap: 6 }}>
              Prueba gratis 7 días →
            </button>
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setOpen(!open)} style={{ color: "white", background: "none", border: "none", cursor: "pointer", padding: 8 }} className="md:hidden">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div style={{ background: "rgba(10,10,20,0.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 8px" }}>
            {["#features","#pricing","#testimonials","#faq"].map((h, i) => (
              <a key={h} href={h} onClick={() => setOpen(false)}
                style={{ display: "block", color: "rgba(255,255,255,0.7)", padding: "10px 12px", fontSize: 14, fontWeight: 500, textDecoration: "none", borderRadius: 8 }}>
                {["Funciones","Precios","Testimonios","FAQ"][i]}
              </a>
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { setLoc("/auth"); setOpen(false); }} className="btn-landing-secondary" style={{ padding: "12px 20px", fontSize: 14, width: "100%", justifyContent: "center" }}>Iniciar sesión</button>
              <button onClick={() => { setLoc("/auth?tab=register"); setOpen(false); }} className="btn-landing-primary" style={{ padding: "12px 20px", fontSize: 14, width: "100%", justifyContent: "center" }}>Prueba gratis 7 días →</button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

/* ─── Phone mockup ──────────────────────────────────── */
function PhoneMockup() {
  const msgs = [
    { from: "user", text: "Hola! ¿tienen el iPhone 15 Pro?" },
    { from: "bot", text: "¡Hola! 👋 Sí, tenemos en stock. Te lo muestro 📱" },
    { from: "bot", card: true },
    { from: "user", text: "¿Cuánto cuesta?" },
    { from: "bot", text: "💰 $4.299.000 COP\nTe genero el link ahora 🔗" },
    { from: "user", text: "Listo, lo quiero!" },
    { from: "bot", text: "¡Perfecto! 🎉 Link seguro:\n💳 pago.link/vp-iphone15\n⏰ Válido 15 min" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(48,209,88,0.25), transparent 70%)", borderRadius: "50%", transform: "scale(1.2)", zIndex: 0 }} />
      <div className="landing-float" style={{ position: "relative", zIndex: 1, width: 290, background: "#0a0a0a", borderRadius: 40, padding: 10, boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)" }}>
        <div style={{ background: "#111b21", borderRadius: 32, overflow: "hidden", height: 540, display: "flex", flexDirection: "column" }}>
          {/* WA header */}
          <div style={{ background: "#1f2c34", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#ff6b2b,#ff9f0a)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={18} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Sofía • VentasPro</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 10, color: "#22c55e" }}>en línea</span>
              </div>
            </div>
            <Phone size={16} color="rgba(255,255,255,0.3)" />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-end", overflow: "hidden", background: "#0d1418" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
                {m.card ? (
                  <div style={{ background: "#202c33", borderRadius: 12, padding: 8, width: 160, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ background: "linear-gradient(135deg,rgba(255,107,43,0.3),rgba(255,159,10,0.2))", borderRadius: 8, height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                      <Package size={28} color="#f97316" />
                    </div>
                    <div style={{ color: "white", fontSize: 10, fontWeight: 600, paddingLeft: 2 }}>iPhone 15 Pro 256GB</div>
                    <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, paddingLeft: 2 }}>$4.299.000 COP</div>
                  </div>
                ) : (
                  <div style={{
                    maxWidth: "78%", borderRadius: m.from === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                    padding: "8px 10px", fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-line",
                    background: m.from === "user" ? "#005c4b" : "#202c33",
                    color: m.from === "user" ? "white" : "rgba(255,255,255,0.9)",
                  }}>{m.text}</div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{ background: "#1f2c34", padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, background: "#2a3942", borderRadius: 20, padding: "8px 14px", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Escribe...</div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#00a884", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowRight size={14} color="white" />
            </div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="landing-float-2" style={{ position: "absolute", top: 60, left: -80, background: "rgba(34,197,94,0.9)", backdropFilter: "blur(10px)", color: "white", fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 12, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(34,197,94,0.3)", whiteSpace: "nowrap" }}>
        <CheckCircle2 size={13} /> Venta cerrada
      </div>
      <div className="landing-float" style={{ position: "absolute", top: "35%", right: -70, background: "rgba(249,115,22,0.9)", backdropFilter: "blur(10px)", color: "white", fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 12, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(249,115,22,0.3)", whiteSpace: "nowrap" }}>
        <DollarSign size={13} /> +$4.2M hoy
      </div>
      <div className="landing-float-3" style={{ position: "absolute", bottom: 80, left: -64, background: "rgba(168,85,247,0.9)", backdropFilter: "blur(10px)", color: "white", fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 12, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(168,85,247,0.3)", whiteSpace: "nowrap" }}>
        <Bot size={13} /> IA activa
      </div>
    </div>
  );
}

/* ─── Sections ──────────────────────────────────────── */
function HeroSection({ setLoc }: { setLoc: (p: string) => void }) {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "80px 1.5rem 60px", position: "relative", overflow: "hidden" }}>
      <div className="hero-glow" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div className="hero-grid">
          {/* Copy */}
          <div className="hero-copy-center">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 9999, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 24 }}>
              <Sparkles size={13} /> 🔥 El Bot de Ventas #1 para WhatsApp
            </div>

            <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.8rem)", fontWeight: 900, lineHeight: 1.1, marginBottom: 24, color: "white" }}>
              Vende más por{" "}
              <span className="landing-gradient-text">WhatsApp</span>{" "}
              con tu agente{" "}
              <span className="landing-gradient-text-purple">IA 24/7</span>
            </h1>

            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 32, maxWidth: 520, margin: "0 auto 32px" }} className="lg:mx-0">
              VentasPro automatiza tus ventas por WhatsApp con inteligencia artificial. Tu agente atiende clientes, envía catálogos, procesa pagos y cierra ventas — mientras tú duermes.
            </p>

            {/* Stats */}
            <div className="hero-stat-row" style={{ display: "flex", gap: 32, justifyContent: "center", marginBottom: 32 }}>
              {[["3x","más ventas"],["24/7","sin parar"],["$0","para empezar"]].map(([n,l]) => (
                <div key={n} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "white", lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="hero-cta-row" style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", marginBottom: 20 }}>
              <button onClick={() => setLoc("/auth?tab=register")} className="btn-landing-primary" style={{ padding: "14px 28px", fontSize: 15, gap: 8 }}>
                <Rocket size={18} /> Empieza gratis — 7 días de prueba
              </button>
              <button onClick={() => setLoc("/auth")} className="btn-landing-secondary" style={{ padding: "14px 28px", fontSize: 15, gap: 8 }}>
                <ArrowRight size={16} /> Ya tengo cuenta
              </button>
            </div>

            <div className="hero-disclaimer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.35)", justifyContent: "center" }}>
              <CheckCircle2 size={13} color="#22c55e" />
              Sin tarjeta de crédito · Sin contratos · Cancela cuando quieras
            </div>
          </div>

          {/* Phone mockup */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function TickerSection() {
  const double = [...TICKER, ...TICKER];
  return (
    <div style={{ padding: "28px 0", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
      <div style={{ display: "flex", gap: 48, width: "max-content", animation: "landing-ticker 30s linear infinite" }}>
        {double.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", opacity: 0.6 }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="features" style={{ padding: "80px 1.5rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 9999, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
            <Sparkles size={13} /> Todo lo que necesitas
          </div>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "white", lineHeight: 1.15, marginBottom: 16 }}>
            Un arsenal completo de<br /><span className="landing-gradient-text">herramientas de ventas</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 17, maxWidth: 560, margin: "0 auto" }}>
            Desde el primer mensaje hasta el pago, VentasPro automatiza todo el proceso.
          </p>
        </div>

        <div className="landing-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="landing-glass" style={{ padding: 24, transition: "all 0.3s", cursor: "default" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(255,255,255,0.2)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(255,255,255,0.08)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, var(--grad-from,#f97316), var(--grad-to,#fb923c))`, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }} className={`bg-gradient-to-br ${f.grad}`}>
                <f.icon size={22} color="white" />
              </div>
              <div style={{ display: "inline-block", padding: "4px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 8, color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>{f.stat}</div>
              <h3 style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ setLoc }: { setLoc: (p: string) => void }) {
  return (
    <section id="pricing" style={{ padding: "80px 1.5rem", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.08), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 9999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
            <DollarSign size={13} /> Planes y precios
          </div>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "white", lineHeight: 1.15, marginBottom: 16 }}>
            Comienza gratis,<br /><span className="landing-gradient-text">crece sin límites</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 17 }}>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>7 días de prueba gratis</span> en cualquier plan. Sin tarjeta.
          </p>
        </div>

        <div className="landing-plans-grid">
          {PLANS.map((plan, i) => (
            <div key={i} className={plan.popular ? "plan-popular" : "landing-glass"}
              style={{ padding: 32, position: "relative", borderRadius: 20, transition: "transform 0.2s" }}>
              {plan.popular && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "white", fontSize: 10, fontWeight: 900, padding: "6px 16px", borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.1em", boxShadow: "0 4px 20px rgba(168,85,247,0.5)", whiteSpace: "nowrap" }}>
                  ⭐ Más popular
                </div>
              )}

              <h3 style={{ color: "white", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>{plan.name}</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>USD$</span>
                <span style={{ color: "white", fontSize: 52, fontWeight: 900, lineHeight: 1 }}>{plan.price}</span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 6 }}>/mes</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#22c55e", fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
                <CheckCircle2 size={15} /> 7 días gratis para empezar
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map((feat, j) => (
                  <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    <div className="check-circle"><Check size={10} color="white" /></div>
                    {feat}
                  </li>
                ))}
              </ul>

              <button onClick={() => setLoc("/auth?tab=register")}
                className={plan.popular ? "btn-landing-primary" : "btn-landing-secondary"}
                style={{ width: "100%", padding: "14px 20px", fontSize: 14, fontWeight: 700, borderRadius: 14 }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 32 }}>
          ¿Más de 10 tiendas o necesidades especiales?{" "}
          <a href="https://wa.me/573136174267" target="_blank" rel="noreferrer" style={{ color: "#f97316", textDecoration: "none", fontWeight: 600 }}>
            Habla con nosotros →
          </a>
        </p>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" style={{ padding: "80px 1.5rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "white", lineHeight: 1.15 }}>
            Lo que dicen nuestros<br /><span className="landing-gradient-text">clientes</span>
          </h2>
        </div>
        <div className="landing-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="landing-glass" style={{ padding: 24 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={15} color="#f59e0b" fill="#f59e0b" />)}
              </div>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>"{t.text}"</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: t.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{t.av}</div>
                <div>
                  <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{t.biz}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" style={{ padding: "80px 1.5rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "white", marginBottom: 12 }}>
            Preguntas <span className="landing-gradient-text">frecuentes</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Todo lo que necesitas saber antes de empezar</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map((faq, i) => (
            <div key={i} className="landing-glass" style={{ overflow: "hidden", transition: "border-color 0.3s", border: open === i ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)" }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: 16 }}>
                <span style={{ color: "white", fontWeight: 600, fontSize: 14 }}>{faq.q}</span>
                <ChevronDown size={18} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0, transition: "transform 0.3s", transform: open === i ? "rotate(180deg)" : "none" }} />
              </button>
              {open === i && (
                <div style={{ padding: "4px 22px 18px", color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.7, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ paddingTop: 12 }}>{faq.a}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ setLoc }: { setLoc: (p: string) => void }) {
  return (
    <section style={{ padding: "80px 1.5rem" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ borderRadius: 28, padding: "64px 40px", textAlign: "center", position: "relative", overflow: "hidden", background: "linear-gradient(135deg, rgba(255,107,43,0.15), rgba(168,85,247,0.15) 50%, rgba(48,209,88,0.1))", border: "1px solid rgba(255,107,43,0.3)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(255,107,43,0.2), transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "white", marginBottom: 16, lineHeight: 1.2 }}>¿Listo para vender más?</h2>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 17, marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
              Únete a cientos de negocios que ya automatizan sus ventas por WhatsApp con VentasPro.
            </p>
            <button onClick={() => setLoc("/auth?tab=register")} className="btn-landing-primary" style={{ padding: "16px 36px", fontSize: 16, gap: 10 }}>
              <Rocket size={20} /> Empieza tu prueba gratis de 7 días
            </button>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 16 }}>Sin tarjeta · Sin contrato · Sin riesgo</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ setLoc }: { setLoc: (p: string) => void }) {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "48px 1.5rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 32, marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#ff6b2b,#ff9f0a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontWeight: 900, fontSize: 15 }}>V</span>
              </div>
              <span style={{ fontWeight: 700, color: "white" }}>VentasPro</span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>Bot de ventas IA para WhatsApp. Automatiza 24/7.</p>
          </div>
          {[
            ["Producto", ["Funciones","Precios","Integraciones","Changelog"]],
            ["Soporte", ["Documentación","WhatsApp soporte","Estado","Blog"]],
            ["Contacto", ["Colombia · COP","wa.me/573136174267","daveymena16@gmail.com"]],
          ].map(([title, links]: any) => (
            <div key={title}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>{title}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {(links as string[]).map((l: string) => (
                  <li key={l}><a href="#" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>© 2025 VentasPro. Todos los derechos reservados.</p>
          <div style={{ display: "flex", gap: 24 }}>
            {["Términos","Privacidad"].map(l => (
              <a key={l} href="#" style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── Main export ───────────────────────────────────── */
export default function LandingPage() {
  const [, setLocation] = useLocation();
  const setLoc = (p: string) => setLocation(p);

  return (
    <div style={{ minHeight: "100vh", background: "hsl(222,47%,5%)", color: "hsl(210,40%,98%)", fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" }}>
      <NavBar setLoc={setLoc} />
      <HeroSection setLoc={setLoc} />
      <TickerSection />
      <FeaturesSection />
      <PricingSection setLoc={setLoc} />
      <TestimonialsSection />
      <FAQSection />
      <CTASection setLoc={setLoc} />
      <Footer setLoc={setLoc} />
    </div>
  );
}
