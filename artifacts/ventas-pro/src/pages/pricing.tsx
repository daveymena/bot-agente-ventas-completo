import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, DollarSign, ArrowRight, Star, Zap, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaasStatus } from "@/hooks/useSaasStatus";

interface Plan {
  id: string;
  name: string;
  price: number;
  monthlyMessages: number;
  maxConversations: number;
  maxProducts: number;
  maxAgents: number;
  features: string[];
  trialDays?: number;
}

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "paypal">("mercadopago");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const { saasStatus } = useSaasStatus();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/pricing");
      const data = await response.json();
      setPlans(data.plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === "free") {
      toast.info("Ya tienes acceso al plan gratuito");
      return;
    }
    setSelectedPlan(planId);
    setShowEmailDialog(true);
  };

  const handleEmailSubmit = async () => {
    if (!email || !validateEmail(email)) {
      setEmailError("Por favor ingresa un email válido");
      return;
    }

    setEmailError("");
    setShowEmailDialog(false);
    setProcessingPayment(true);

    try {
      const response = await fetch("/api/pricing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          newPlan: selectedPlan,
          billingCycle,
          paymentMethod,
          email,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al procesar el pago");
      }

      if (data.paymentUrl) {
        toast.success(`Redirigiendo a ${paymentMethod === "mercadopago" ? "MercadoPago" : "PayPal"}...`);
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 2000);
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
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Header */}
          <div className="text-center mb-16 animate-enter">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-widest mb-6">
              <Star className="h-3 w-3 fill-primary" /> Membresías Elite
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              Escala tu Negocio con IA
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Elige la potencia de fuego que tu departamento de ventas necesita. Sin contratos, cancela cuando quieras.
            </p>

            <div className="flex flex-col items-center gap-8">
              {/* Billing Cycle Toggle */}
              <div className="flex p-1 bg-muted/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${billingCycle === "monthly" ? "bg-white text-black shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Mensual
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${billingCycle === "annual" ? "bg-white text-black shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Anual <Badge className="bg-green-500 text-white border-none text-[10px] font-black px-1.5 py-0">AHORRA 20%</Badge>
                </button>
              </div>

              {/* Payment Method Selection */}
              <div className="flex items-center gap-4 p-2 bg-background/40 backdrop-blur-md rounded-2xl border border-white/5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-4">Método:</span>
                <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                  <SelectTrigger className="w-[180px] bg-transparent border-none focus:ring-0 font-bold">
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
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-primary text-white border-none shadow-lg shadow-primary/20">Tu Plan Actual</Badge>
                    </div>
                  )}

                  <div className="pt-10 pb-6 text-center border-b border-white/5 px-6">
                    <h3 className="text-2xl font-black mb-2">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-black tabular-nums">
                        ${billingCycle === "annual" ? (plan.price * 12 * 0.8 / 12).toFixed(0) : plan.price}
                      </span>
                      <span className="text-muted-foreground font-medium">/mes</span>
                    </div>
                    {billingCycle === "annual" && plan.price > 0 && (
                      <div className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-widest bg-green-500/10 py-1 px-3 rounded-full mx-auto w-fit">
                        Facturado anualmente
                      </div>
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

                  <div className="p-6 pt-0">
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

        {/* Activation Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="glass-panel border-white/20 p-0 overflow-hidden max-w-md">
            <div className="bg-gradient-to-br from-primary/20 to-accent/20 p-8 text-center border-b border-white/10">
              <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border border-white/10">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <DialogTitle className="text-2xl font-black mb-2">Finalizar Pedido</DialogTitle>
              <DialogDescription className="text-muted-foreground font-medium">
                Ingresa tu email para recibir tu token de activación tras el pago.
              </DialogDescription>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email de Facturación</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError("");
                  }}
                  className={`h-12 bg-muted/20 border-white/10 rounded-xl px-4 ${emailError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {emailError && (
                  <p className="text-xs text-red-500 font-bold mt-1">{emailError}</p>
                )}
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex gap-4 items-start">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Importante:</strong> Se enviará un <span className="text-primary font-bold">Token de Activación</span> a este email inmediatamente después de completar el pago en {paymentMethod}.
                </p>
              </div>
            </div>
            
            <DialogFooter className="p-8 pt-0 flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={() => {
                  setShowEmailDialog(false);
                  setSelectedPlan(null);
                  setEmail("");
                  setEmailError("");
                }}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 font-bold shadow-lg shadow-primary/20"
                onClick={handleEmailSubmit}
                disabled={!email || processingPayment}
              >
                {processingPayment ? <div className="animate-spin h-4 w-4 border-b-2 border-white rounded-full" /> : "Ir al Pago"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
