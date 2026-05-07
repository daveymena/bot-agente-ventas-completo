import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, CreditCard, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
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
      toast({
        title: "Plan Gratuito",
        description: "Ya tienes acceso al plan gratuito",
      });
      return;
    }

    // Mostrar diálogo para solicitar email
    setSelectedPlan(planId);
    setShowEmailDialog(true);
  };

  const handleEmailSubmit = async () => {
    // Validar email
    if (!email || !validateEmail(email)) {
      setEmailError("Por favor ingresa un email válido");
      return;
    }

    setEmailError("");
    setShowEmailDialog(false);
    setProcessingPayment(true);

    try {
      setProcessingPayment(true);

      // Flujo de pago real SIN autenticación
      const response = await fetch("/api/pricing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          newPlan: selectedPlan,
          billingCycle,
          paymentMethod,
          email, // Enviar email en el body
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al procesar el pago");
      }

      if (data.paymentUrl) {
        toast({
          title: "Redirigiendo al pago",
          description: `Serás redirigido a ${paymentMethod === "mercadopago" ? "MercadoPago" : "PayPal"}. Después del pago recibirás un token de activación por email.`,
          duration: 5000,
        });
        
        // Redirigir al enlace de pago
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 2000);
      }
    } catch (error: any) {
      console.error("Error upgrading plan:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar el pago. Intenta nuevamente.",
        variant: "destructive",
      });
      setProcessingPayment(false);
      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando planes...</p>
        </div>
      </div>
    );
  }

  const currentPlanId = saasStatus?.plan;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Planes de Sofía AI Sales</h1>
          <p className="text-xl text-gray-600 mb-6">
            Elige el plan perfecto para tu negocio
          </p>

          {/* Billing Cycle Toggle */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button
              variant={billingCycle === "monthly" ? "default" : "outline"}
              onClick={() => setBillingCycle("monthly")}
            >
              Mensual
            </Button>
            <Button
              variant={billingCycle === "annual" ? "default" : "outline"}
              onClick={() => setBillingCycle("annual")}
            >
              Anual <Badge className="ml-2 bg-green-500">-20%</Badge>
            </Button>
          </div>

          {/* Payment Method Selection */}
          <div className="flex items-center justify-center gap-4">
            <span className="text-sm text-gray-600">Método de pago:</span>
            <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mercadopago">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    MercadoPago
                  </div>
                </SelectItem>
                <SelectItem value="paypal">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    PayPal
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col transition-all ${
                plan.id === currentPlanId ? "ring-2 ring-primary shadow-lg" : ""
              }`}
            >
              {plan.id === currentPlanId && (
                <Badge className="absolute -top-3 right-4 bg-primary text-white">
                  Plan Actual
                </Badge>
              )}
              {plan.trialDays && plan.id !== currentPlanId && (
                <Badge className="absolute -top-3 left-4 bg-green-500">
                  {plan.trialDays} días gratis
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    ${billingCycle === "annual" ? (plan.price * 12 * 0.8 / 12).toFixed(0) : plan.price}
                  </span>
                  <span className="text-gray-600">/mes</span>
                  {billingCycle === "annual" && (
                    <div className="text-sm text-green-600 mt-1">
                      ${(plan.price * 12 * 0.8).toFixed(0)}/año (ahorras ${(plan.price * 12 * 0.2).toFixed(0)})
                    </div>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>{plan.monthlyMessages.toLocaleString()} mensajes/mes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>{plan.maxConversations.toLocaleString()} conversaciones</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>{plan.maxProducts.toLocaleString()} productos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>{plan.maxAgents} agente(s) IA</span>
                  </li>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-semibold mb-2">Características:</p>
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm mb-1">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={processingPayment || selectedPlan === plan.id}
                >
                  {processingPayment && selectedPlan === plan.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Procesando...
                    </>
                  ) : plan.price === 0 ? (
                    "Comenzar Gratis"
                  ) : (
                    `Actualizar con ${paymentMethod === "mercadopago" ? "MercadoPago" : "PayPal"}`
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Preguntas Frecuentes</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">¿Puedo cambiar de plan en cualquier momento?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Sí, puedes cambiar de plan en cualquier momento. Los cambios se aplicarán en tu próximo ciclo de facturación.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">¿Hay contrato a largo plazo?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  No, todos nuestros planes son mes a mes. Puedes cancelar en cualquier momento sin penalización.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">¿Qué incluye el período de prueba?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  El período de prueba incluye acceso completo al plan Starter durante 7 días. Sin necesidad de tarjeta de crédito.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Diálogo para solicitar email */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingresa tu email</DialogTitle>
            <DialogDescription>
              Necesitamos tu email para enviarte el token de activación después del pago.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                className={emailError ? "border-red-500" : ""}
              />
              {emailError && (
                <p className="text-sm text-red-500">{emailError}</p>
              )}
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
              <p className="text-sm text-blue-700">
                📧 Después de completar el pago, recibirás un <strong>token de activación</strong> en este email.
                Usa ese token para activar tu cuenta y acceder a tu plan.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEmailDialog(false);
                setSelectedPlan(null);
                setEmail("");
                setEmailError("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleEmailSubmit} disabled={!email}>
              Continuar al Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
