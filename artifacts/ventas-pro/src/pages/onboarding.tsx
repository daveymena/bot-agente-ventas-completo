import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Bot, Zap, Shield, Star, Check, ArrowRight, ArrowLeft,
  Store, Mail, Lock, User, ChevronRight, Sparkles, Globe,
  MessageSquare, TrendingUp, Headphones, Award
} from "lucide-react";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    color: "from-blue-500 to-cyan-500",
    border: "border-blue-500/30",
    badge: null,
    features: ["1,000 mensajes/mes", "50 productos", "1 Agente IA", "WhatsApp Bot", "Analytics básico", "Soporte por email"],
    limits: { messages: 1000, products: 50, agents: 1 }
  },
  {
    id: "professional",
    name: "Professional",
    price: 99,
    color: "from-violet-500 to-purple-600",
    border: "border-violet-500/40",
    badge: "MÁS POPULAR",
    features: ["10,000 mensajes/mes", "500 productos", "3 Agentes IA", "WhatsApp Bot", "Analytics avanzado", "Marca personalizada", "API Access", "Soporte prioritario"],
    limits: { messages: 10000, products: 500, agents: 3 }
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 299,
    color: "from-amber-500 to-orange-500",
    border: "border-amber-500/30",
    badge: "MÁXIMO PODER",
    features: ["100,000 mensajes/mes", "5,000 productos", "10 Agentes IA", "WhatsApp Bot", "Analytics en tiempo real", "Marca personalizada", "API Access", "Cuenta dedicada", "Integraciones custom", "Soporte 24/7"],
    limits: { messages: 100000, products: 5000, agents: 10 }
  }
];

type Step = "plan" | "register" | "verify";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState("professional");
  const [isLoading, setIsLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    brandName: "",
    slug: ""
  });

  const handleBrandNameChange = (val: string) => {
    const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setFormData(f => ({ ...f, brandName: val, slug }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          brandName: formData.brandName,
          slug: formData.slug,
          plan: selectedPlan
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTenantEmail(formData.email);
        toast.success("¡Cuenta creada! Revisa tu correo para verificar.");
        setStep("verify");
      } else {
        toast.error(data.error || "Error al crear la cuenta");
      }
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tenantEmail, code: verifyCode })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("¡Cuenta verificada! Ahora inicia sesión.");
        setLocation("/auth");
      } else {
        toast.error(data.error || "Código inválido");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <div className="min-h-screen bg-[#080b14] text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">VentasPro <span className="text-violet-400">AI</span></span>
          </div>
          <button
            onClick={() => setLocation("/auth")}
            className="text-sm text-white/50 hover:text-white transition-colors flex items-center gap-1"
          >
            Ya tengo cuenta <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16">

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-3 mb-16">
          {(["plan", "register", "verify"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                step === s ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30 scale-110" :
                ["plan","register","verify"].indexOf(step) > i ? "bg-green-500 text-white" :
                "bg-white/10 text-white/40"
              }`}>
                {["plan","register","verify"].indexOf(step) > i ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs font-medium capitalize ${step === s ? "text-white" : "text-white/40"}`}>
                {s === "plan" ? "Elige tu plan" : s === "register" ? "Crea tu cuenta" : "Verifica email"}
              </span>
              {i < 2 && <div className={`w-12 h-px ${["plan","register","verify"].indexOf(step) > i ? "bg-green-500" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* STEP 1: Plan Selection */}
        {step === "plan" && (
          <div>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-bold uppercase tracking-widest mb-6">
                <Sparkles className="w-3 h-3" /> Plataforma SaaS de Ventas con IA
              </div>
              <h1 className="text-5xl font-black tracking-tight mb-4">
                Automatiza tus ventas con
                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent"> Inteligencia Artificial</span>
              </h1>
              <p className="text-white/50 text-lg max-w-2xl mx-auto">
                Tu propio bot de ventas en WhatsApp, catálogo digital, pagos automáticos y análisis en tiempo real. Todo listo en minutos.
              </p>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-3 mb-14">
              {[
                { icon: MessageSquare, text: "WhatsApp Bot IA" },
                { icon: TrendingUp, text: "Analytics en vivo" },
                { icon: Globe, text: "Pagos automáticos" },
                { icon: Headphones, text: "Soporte 24/7" },
                { icon: Shield, text: "100% seguro" },
                { icon: Zap, text: "Setup en 5 min" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
                  <Icon className="w-3.5 h-3.5 text-violet-400" /> {text}
                </div>
              ))}
            </div>

            {/* Plan Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {PLANS.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`relative rounded-2xl border cursor-pointer transition-all duration-300 overflow-hidden ${
                    selectedPlan === p.id
                      ? `${p.border} bg-white/5 shadow-2xl scale-[1.02]`
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20"
                  }`}
                >
                  {p.badge && (
                    <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${p.color}`} />
                  )}
                  {p.badge && (
                    <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r ${p.color} text-[9px] font-black tracking-widest text-white`}>
                      {p.badge}
                    </div>
                  )}
                  <div className="p-6">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-4 shadow-lg`}>
                      <Award className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-lg mb-1">{p.name}</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl font-black">${p.price}</span>
                      <span className="text-white/40 text-sm">/mes</span>
                    </div>
                    <ul className="space-y-2 mb-6">
                      {p.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-white/70">
                          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                    <div className={`w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all ${
                      selectedPlan === p.id
                        ? `bg-gradient-to-r ${p.color} text-white shadow-lg`
                        : "bg-white/10 text-white/60 hover:bg-white/15"
                    }`}>
                      {selectedPlan === p.id ? "✓ Plan seleccionado" : "Seleccionar"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setStep("register")}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold text-lg shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all duration-200"
              >
                Comenzar con {plan.name} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Registration */}
        {step === "register" && (
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setStep("plan")}
              className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Cambiar plan
            </button>

            {/* Selected plan summary */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${plan.border} bg-white/5 mb-8`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                  <Star className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-bold text-sm">{plan.name}</div>
                  <div className="text-xs text-white/50">{plan.limits.messages.toLocaleString()} mensajes/mes</div>
                </div>
              </div>
              <div className="text-lg font-black">${plan.price}<span className="text-white/40 text-xs font-normal">/mes</span></div>
            </div>

            <h2 className="text-3xl font-black mb-2">Crea tu cuenta</h2>
            <p className="text-white/50 mb-8">Configura tu espacio de trabajo en menos de 2 minutos.</p>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Tu nombre</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      required
                      placeholder="Juan García"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none text-sm placeholder:text-white/20 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Nombre de tu negocio</label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      required
                      placeholder="Mi Tienda Digital"
                      value={formData.brandName}
                      onChange={e => handleBrandNameChange(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none text-sm placeholder:text-white/20 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {formData.slug && (
                <div className="px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300">
                  🌐 Tu URL: <span className="font-mono font-bold">app.ventaspro.ai/<span className="text-white">{formData.slug}</span></span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="email"
                    required
                    placeholder="tu@empresa.com"
                    value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none text-sm placeholder:text-white/20 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCapitalize="off"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none text-sm placeholder:text-white/20 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Confirmar</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCapitalize="off"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={e => setFormData(f => ({ ...f, confirmPassword: e.target.value }))}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border focus:outline-none text-sm placeholder:text-white/20 transition-colors ${
                        formData.confirmPassword && formData.password !== formData.confirmPassword
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-white/10 focus:border-violet-500/50"
                      }`}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold text-base shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.02] disabled:opacity-60 disabled:scale-100 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Zap className="w-4 h-4" /> Crear mi cuenta gratis</>
                )}
              </button>

              <p className="text-center text-xs text-white/30">
                Al registrarte aceptas nuestros <span className="text-violet-400 cursor-pointer">Términos de Servicio</span> y <span className="text-violet-400 cursor-pointer">Política de Privacidad</span>
              </p>
            </form>
          </div>
        )}

        {/* STEP 3: Email Verification */}
        {step === "verify" && (
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-500/30">
              <Mail className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-black mb-3">Verifica tu correo</h2>
            <p className="text-white/50 mb-2">
              Enviamos un código de 6 dígitos a:
            </p>
            <p className="font-bold text-violet-300 mb-8">{tenantEmail}</p>

            <form onSubmit={handleVerify} className="space-y-4">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full text-center text-3xl font-black tracking-[0.5em] py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none placeholder:text-white/20 placeholder:tracking-normal transition-colors"
              />

              <button
                type="submit"
                disabled={isLoading || verifyCode.length < 6}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-700 text-white font-bold shadow-2xl hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Shield className="w-4 h-4" /> Verificar y acceder</>}
              </button>

              <button
                type="button"
                onClick={() => setStep("register")}
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                ← Volver al registro
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
