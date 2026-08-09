import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, DollarSign, ArrowRight, Star, Zap, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("pricing")!;
import { useSaasStatus } from "@/hooks/useSaasStatus";

interface Plan {
  id: string;
  name: string;
  price: number;
  quarterlyPrice?: number;
  annualPrice?: number;
  monthlyMessages: number;
  maxConversations: number;
  maxProducts: number;
  maxAgents: number;
  features: string[];
  trialDays?: number;
}

// Un motivo corto por plan -- por qué elegir ESE tier en particular, no una
// sección aparte de "por qué elegirnos" (no existía en el código; lo que se
// pedía era esto: contexto directo en cada tarjeta de plan).
const PLAN_TAGLINES: Record<string, string> = {
  basic: "Para probar la plataforma sin compromiso",
  starter: "Ideal si estás arrancando y necesitas lo esencial",
  premium: "El más elegido: equilibrio entre precio y capacidad",
  professional: "Para negocios en crecimiento que necesitan más volumen",
};

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function PricingPage() {
  useAutoTour(HELP_GUIDE);
  const [, setLocation] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "paypal">("mercadopago");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [usdToCop, setUsdToCop] = useState<number | null>(null);
  const { saasStatus } = useSaasStatus();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/pricing");
      const data = await response.json();
      setPlans(data.plans);
      if (typeof data.usdToCop === "number") setUsdToCop(data.usdToCop);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  // Antes esto abría un diálogo pidiendo el email y POSTeaba a /pricing/upgrade
  // con ese email -- el backend buscaba o CREABA un tenant nuevo con ese
  // email, sin relación con la cuenta logueada. Como ya estás autenticado (la
  // ruta exige sesión), no hace falta volver a pedir el email: se manda
  // directo con la cookie de sesión y el backend actualiza TU cuenta.
  const handleUpgrade = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan?.price === 0) {
      setProcessingPayment(true);
      try {
        const response = await fetch("/api/pricing/upgrade", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPlan: planId, billingCycle, paymentMethod }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error);
        toast.success("Plan gratuito activado");
        setTimeout(() => window.location.reload(), 1000);
      } catch (error: any) {
        toast.error(error.message || "No se pudo activar el plan");
      } finally {
        setProcessingPayment(false);
      }
      return;
    }

    setSelectedPlan(planId);
    setProcessingPayment(true);

    try {
      const response = await fetch("/api/pricing/upgrade", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlan: planId, billingCycle, paymentMethod }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al procesar el pago");
      }

      if (data.paymentUrl) {
        const gateway = paymentMethod === "mercadopago" ? "MercadoPago" : "PayPal";
        const chargeNote =
          data.chargedCurrency === "COP"
            ? ` Se cobrarán ${copFormatter.format(data.chargedAmount)}.`
            : typeof data.copEquivalent === "number"
              ? ` Se cobrarán $${data.chargedAmount} USD (≈ ${copFormatter.format(data.copEquivalent)}).`
              : "";
        toast.success(`Redirigiendo a ${gateway}...${chargeNote}`);
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 1500);
      }
    } catch (error: any) {
      toast.error(error.message || "No se pudo procesar el pago");
      setProcessingPayment(false);
      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Zap className="h-12 w-12 text-primary animate-pulse relative z-10" />
          </div>
          <p className="text-muted-foreground font-medium animate-pulse">Cargando planes de élite...</p>
        </div>
      </div>
    );
  }

  const currentPlanId = saasStatus?.plan;

  return (
    <Layout>
      <div className="relative">
        {/* Background Pattern -- cada círculo se recorta a sí mismo
            (overflow-hidden) en vez de ponerlo en el contenedor raíz de toda
            la página: eso último cortaba también el scroll del <main> que
            envuelve esta página (era la única con overflow-hidden acá; el
            resto del dashboard no lo tiene, por eso ahí sí scrolleaba bien). */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none overflow-hidden" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] rounded-full bg-accent/5 blur-[100px] pointer-events-none overflow-hidden" />

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Header */}
          <div className="text-center mb-16 animate-enter">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-widest mb-6">
              <Star className="h-3 w-3 fill-primary" /> Membresías Elite
            </div>
            <div className="flex items-center justify-center gap-1.5 mb-6">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                Escala tu Negocio con IA
              </h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Elige la potencia de fuego que tu departamento de ventas necesita. Sin contratos, cancela cuando quieras.
            </p>

            {/* Una sola fila compacta: ciclo de facturación + método de pago.
                Antes esto eran 3 bloques apilados (toggle, selector, y una
                barra de confianza que repetía MercadoPago/PayPal otra vez) --
                ocupaba toda la pantalla antes de llegar a ver un solo plan, y
                el nombre del método quedaba dicho 3 veces. */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div data-tour="pricing-billing-cycle" className="flex p-1 bg-muted/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${billingCycle === "monthly" ? "bg-white text-black shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Mensual
                </button>
                <button
                  onClick={() => setBillingCycle("quarterly")}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-1.5 ${billingCycle === "quarterly" ? "bg-white text-black shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Trimestral <Badge className="bg-blue-500 text-white border-none text-[9px] font-black px-1.5 py-0">-10%</Badge>
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-1.5 ${billingCycle === "annual" ? "bg-white text-black shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Anual <Badge className="bg-green-500 text-white border-none text-[9px] font-black px-1.5 py-0">-20%</Badge>
                </button>
              </div>

              <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <SelectTrigger className="w-[170px] h-[46px] bg-background/40 backdrop-blur-md border border-white/5 rounded-2xl font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/10">
                  <SelectItem value="mercadopago" className="focus:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      MercadoPago
                    </div>
                  </SelectItem>
                  <SelectItem value="paypal" className="focus:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      PayPal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground mt-4">
              <Lock className="h-3 w-3" />
              <span>Pago 100% seguro y encriptado · Cancela cuando quieras</span>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
            {plans.map((plan, idx) => {
              const isPopular = plan.id === 'starter';
              const isCurrent = plan.id === currentPlanId;
              
              return (
                <div
                  key={plan.id}
                  className={`group relative flex flex-col transition-all duration-500 hover:-translate-y-2 border-0 shadow-2xl overflow-hidden glass-panel rounded-3xl ${
                    isCurrent ? 'ring-2 ring-primary bg-primary/5' : ''
                  } ${isPopular ? 'scale-105 z-10' : ''} animate-enter`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  {isPopular && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-primary text-white text-[10px] font-black px-8 py-1 rotate-45 translate-x-6 translate-y-2 shadow-lg">
                        POPULAR
                      </div>
                    </div>
                  )}
                  
                  {isCurrent && (
                    <div className="absolute top-4 left-4" data-tour="pricing-current-plan">
                      <Badge className="bg-primary text-white border-none shadow-lg shadow-primary/20">Tu Plan Actual</Badge>
                    </div>
                  )}

                  <div className="pt-10 pb-6 text-center border-b border-white/5 px-6">
                    <h3 className="text-2xl font-black mb-2">{plan.name}</h3>
                    {PLAN_TAGLINES[plan.id] && (
                      <p className="text-xs text-muted-foreground mb-3 leading-snug min-h-[2.2em]">{PLAN_TAGLINES[plan.id]}</p>
                    )}
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-black tabular-nums">
                        ${billingCycle === "annual" ? ((plan.annualPrice ?? plan.price * 12 * 0.8) / 12).toFixed(0)
                          : billingCycle === "quarterly" ? ((plan.quarterlyPrice ?? plan.price * 3 * 0.9) / 3).toFixed(0)
                          : plan.price}
                      </span>
                      <span className="text-muted-foreground font-medium">/mes</span>
                    </div>
                    {billingCycle === "annual" && plan.price > 0 && (
                      <div className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-widest bg-green-500/10 py-1 px-3 rounded-full mx-auto w-fit">
                        Facturado anualmente (${(plan.annualPrice ?? plan.price * 12 * 0.8).toFixed(0)})
                      </div>
                    )}
                    {billingCycle === "quarterly" && plan.price > 0 && (
                      <div className="text-[10px] font-bold text-blue-500 mt-2 uppercase tracking-widest bg-blue-500/10 py-1 px-3 rounded-full mx-auto w-fit">
                        Facturado trimestralmente (${(plan.quarterlyPrice ?? plan.price * 3 * 0.9).toFixed(0)})
                      </div>
                    )}
                    {plan.price > 0 && usdToCop && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        ≈{" "}
                        {copFormatter.format(
                          (billingCycle === "annual"
                            ? plan.annualPrice ?? plan.price * 12 * 0.8
                            : billingCycle === "quarterly"
                              ? plan.quarterlyPrice ?? plan.price * 3 * 0.9
                              : plan.price) * usdToCop,
                        )}{" "}
                        {paymentMethod === "mercadopago" ? "(cobro real vía MercadoPago)" : "(referencial · se cobra en USD vía PayPal)"}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 py-8 px-6 space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-primary/10 rounded-lg text-primary shrink-0"><Zap className="h-4 w-4" /></div>
                        <span className="text-sm font-semibold">{plan.monthlyMessages.toLocaleString()} mensajes/mes</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-primary/10 rounded-lg text-primary shrink-0"><Check className="h-4 w-4" /></div>
                        <span className="text-sm font-semibold">{plan.maxConversations.toLocaleString()} conversaciones</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-primary/10 rounded-lg text-primary shrink-0"><Check className="h-4 w-4" /></div>
                        <span className="text-sm font-semibold">{plan.maxAgents} agentes IA</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/5 space-y-3">
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                          <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          <span className="leading-tight">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 pt-0 space-y-3">
                    <Button
                      className={`w-full h-14 rounded-2xl font-bold text-base transition-all duration-300 ${
                        isCurrent
                          ? 'bg-muted text-muted-foreground cursor-default'
                          : 'bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg shadow-primary/20 group-hover:scale-[1.02]'
                      }`}
                      onClick={() => !isCurrent && handleUpgrade(plan.id)}
                      disabled={processingPayment || isCurrent}
                    >
                      {processingPayment && selectedPlan === plan.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      ) : isCurrent ? (
                        "Plan Activo"
                      ) : plan.price === 0 ? (
                        "Empezar Ahora"
                      ) : (
                        <div className="flex items-center gap-2">
                          Actualizar <ArrowRight className="h-4 w-4" />
                        </div>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto animate-enter">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black mb-4">¿Tienes preguntas?</h2>
              <p className="text-muted-foreground">Todo lo que necesitas saber sobre nuestras suscripciones.</p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { q: "¿Puedo cambiar de plan?", a: "Sí, puedes subir o bajar de categoría en cualquier momento. Los cambios se prorratean automáticamente." },
                { q: "¿Hay cargos ocultos?", a: "No. Lo que ves es lo que pagas. No hay costos por configuración ni permanencia mínima." },
                { q: "¿Qué pasa si excedo los mensajes?", a: "Tus agentes dejarán de responder hasta el próximo ciclo o hasta que subas de plan. Te avisaremos al 80%." },
                { q: "¿Es seguro mi pago?", a: "Absolutamente. Usamos MercadoPago y PayPal para procesar pagos de forma segura y encriptada." }
              ].map((faq, i) => (
                <div key={i} className="glass-panel border-white/5 p-6 hover:bg-white/5 transition-colors cursor-default rounded-3xl">
                  <h3 className="font-bold mb-2 flex items-center gap-2 text-primary">
                     <Zap className="h-3.5 w-3.5" /> {faq.q}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-16 p-8 rounded-[3rem] glass-panel border-white/10 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 opacity-50 pointer-events-none" />
              <h3 className="text-2xl font-black mb-4 relative z-10">¿Necesitas un plan personalizado?</h3>
              <p className="text-muted-foreground mb-8 relative z-10">Si eres una gran empresa con necesidades masivas, nuestro equipo puede diseñar una solución a medida para ti.</p>
              <Button variant="outline" className="h-12 px-8 rounded-xl relative z-10 hover:bg-white/10 transition-all">Contactar con Ventas</Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
