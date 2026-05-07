import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Zap, Crown, Building2, AlertCircle, RefreshCw, ExternalLink, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Plan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  maxAgents: number;
  maxProducts: number;
  monthlyMessages: number;
  maxConversations: number;
  trialDays: number;
};

type Subscription = {
  id: number;
  plan: string;
  status: string;
  billingCycle: string;
  paymentMethod: string;
  amount: string;
  expiresAt: string | null;
  activationToken: string | null;
  createdAt: string;
};

const planIcons: Record<string, React.ElementType> = {
  starter: Zap,
  pro: Crown,
  enterprise: Building2,
};

const planColors: Record<string, string> = {
  starter: "from-blue-500 to-cyan-500",
  pro: "from-primary to-orange-500",
  enterprise: "from-purple-500 to-pink-500",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/30",
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/30",
  expired: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const statusLabels: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente pago",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const methodLabels: Record<string, string> = {
  mercadopago: "MercadoPago",
  paypal: "PayPal",
  transfer: "Transferencia",
};

export default function Billing() {
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [payModal, setPayModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "paypal" | "transfer">("mercadopago");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState(false);
  const [transferInfo, setTransferInfo] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/plans");
      if (!r.ok) throw new Error("Error cargando planes");
      return r.json();
    },
  });

  const { data: subData, isLoading: subLoading } = useQuery<{ current: Subscription | null; planDetails: Plan | null; history: Subscription[] }>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions");
      if (!r.ok) throw new Error("Error cargando suscripción");
      return r.json();
    },
  });

  const createSub = useMutation({
    mutationFn: async (data: { plan: string; paymentMethod: string; billingCycle: string }) => {
      const r = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Error al procesar pago");
      }
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      setPayModal(false);
      if (data.paymentUrl && paymentMethod !== "transfer") {
        setPaymentUrl(data.paymentUrl);
        setResultModal(true);
      } else if (paymentMethod === "transfer") {
        setTransferInfo(data.message);
        setResultModal(true);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const cancelSub = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/subscriptions/cancel", { method: "POST" });
      if (!r.ok) throw new Error("Error al cancelar");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Suscripción cancelada");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: () => toast.error("Error al cancelar suscripción"),
  });

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    setPayModal(true);
  };

  const handlePay = () => {
    if (!selectedPlan) return;
    createSub.mutate({ plan: selectedPlan, paymentMethod, billingCycle });
  };

  const selectedPlanDetails = plans.find(p => p.id === selectedPlan);
  const annualPrice = selectedPlanDetails ? Math.round(selectedPlanDetails.price * 12 * 0.8) : 0;

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planes y Facturación</h1>
          <p className="text-muted-foreground mt-1">Gestiona tu suscripción y métodos de pago</p>
        </div>

        {/* Current subscription */}
        {!subLoading && subData?.current && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Tu plan actual</CardTitle>
                <Badge className={`border ${statusColors[subData.current.status] || statusColors.pending}`}>
                  {statusLabels[subData.current.status] || subData.current.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Plan</p>
                  <p className="font-semibold capitalize">{subData.current.plan}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Método de pago</p>
                  <p className="font-semibold">{methodLabels[subData.current.paymentMethod] || subData.current.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ciclo</p>
                  <p className="font-semibold capitalize">{subData.current.billingCycle === "annual" ? "Anual" : "Mensual"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Monto</p>
                  <p className="font-semibold">${subData.current.amount} {subData.planDetails?.currency || "USD"}</p>
                </div>
              </div>
              {subData.current.expiresAt && (
                <p className="text-xs text-muted-foreground mt-3">
                  Vence el {new Date(subData.current.expiresAt).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
            </CardContent>
            {subData.current.status === "active" && (
              <CardFooter>
                <Button variant="destructive" size="sm" onClick={() => cancelSub.mutate()} disabled={cancelSub.isPending}>
                  {cancelSub.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                  Cancelar suscripción
                </Button>
              </CardFooter>
            )}
          </Card>
        )}

        {!subLoading && !subData?.current && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
              <p className="text-sm">No tienes un plan activo. Elige un plan para desbloquear todas las funciones.</p>
            </CardContent>
          </Card>
        )}

        {/* Billing cycle toggle */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground"}`}>Mensual</span>
          <button
            onClick={() => setBillingCycle(c => c === "monthly" ? "annual" : "monthly")}
            className={`relative w-12 h-6 rounded-full transition-colors ${billingCycle === "annual" ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${billingCycle === "annual" ? "left-7" : "left-1"}`} />
          </button>
          <span className={`text-sm font-medium ${billingCycle === "annual" ? "text-foreground" : "text-muted-foreground"}`}>
            Anual <Badge className="ml-1 bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">–20%</Badge>
          </span>
        </div>

        {/* Plans grid */}
        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <div key={i} className="h-96 rounded-2xl bg-muted/30 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = planIcons[plan.id] || Zap;
              const gradient = planColors[plan.id] || planColors.starter;
              const isPro = plan.id === "pro";
              const price = billingCycle === "annual" ? Math.round(plan.price * 0.8) : plan.price;
              const isCurrent = subData?.current?.plan === plan.id && subData?.current?.status === "active";

              return (
                <Card key={plan.id} className={`relative flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${isPro ? "border-primary/50 shadow-lg shadow-primary/10" : "border-white/10"}`}>
                  {isPro && (
                    <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary to-orange-500" />
                  )}
                  {isPro && (
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold uppercase tracking-wider">Popular</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">${price}</span>
                      <span className="text-muted-foreground"> USD/{billingCycle === "annual" ? "mes" : "mes"}</span>
                      {billingCycle === "annual" && (
                        <span className="block text-xs text-muted-foreground mt-0.5">Facturado ${Math.round(plan.price * 12 * 0.8)} USD/año</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrent ? (
                      <Button className="w-full" disabled variant="outline">
                        Plan actual ✓
                      </Button>
                    ) : (
                      <Button
                        className={`w-full ${isPro ? "bg-gradient-to-r from-primary to-orange-500 text-white hover:opacity-90" : ""}`}
                        variant={isPro ? "default" : "outline"}
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {subData?.current?.status === "active" ? "Cambiar a " + plan.name : "Comenzar con " + plan.name}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* History */}
        {subData?.history && subData.history.length > 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Historial de suscripciones</h2>
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {subData.history.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge className={`border text-xs ${statusColors[s.status] || statusColors.pending}`}>{statusLabels[s.status] || s.status}</Badge>
                        <span className="capitalize font-medium">{s.plan}</span>
                        <span className="text-muted-foreground">{methodLabels[s.paymentMethod]}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${s.amount} USD</p>
                        <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("es-CO")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Payment modal */}
      <Dialog open={payModal} onOpenChange={setPayModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar suscripción</DialogTitle>
          </DialogHeader>
          {selectedPlanDetails && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold capitalize">{selectedPlanDetails.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ciclo</span>
                  <span className="font-semibold">{billingCycle === "annual" ? "Anual" : "Mensual"}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>
                    ${billingCycle === "annual" ? annualPrice : selectedPlanDetails.price} USD
                    {billingCycle === "annual" && <span className="text-xs text-green-500 ml-1">(–20%)</span>}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Método de pago</label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mercadopago">🟡 MercadoPago (COP / tarjeta)</SelectItem>
                    <SelectItem value="paypal">🔵 PayPal (USD)</SelectItem>
                    <SelectItem value="transfer">🏦 Transferencia (Nequi / Daviplata)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "transfer" && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-400">
                  Envía el comprobante al WhatsApp del negocio. Tu plan se activará en minutos.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModal(false)}>Cancelar</Button>
            <Button onClick={handlePay} disabled={createSub.isPending}>
              {createSub.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {paymentMethod === "transfer" ? "Confirmar transferencia" : "Ir al pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result modal */}
      <Dialog open={resultModal} onOpenChange={setResultModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{transferInfo ? "Instrucciones de pago" : "Redirigiendo al pago"}</DialogTitle>
          </DialogHeader>
          {transferInfo ? (
            <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground">{transferInfo}</div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Tu orden fue creada. Haz clic en el botón para completar el pago.</p>
              {paymentUrl && (
                <Button className="w-full" asChild>
                  <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Completar pago
                  </a>
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultModal(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
