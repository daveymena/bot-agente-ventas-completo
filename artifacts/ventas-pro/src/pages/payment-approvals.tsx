import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Wallet, Phone, Package, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface PagoPendiente {
  id: number;
  conversationId: number | null;
  productId: number | null;
  amount: number;
  currency: string | null;
  method: string | null;
  payerName: string | null;
  payerPhone: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdAt: string;
  contactName: string | null;
  productName: string | null;
}

function mensajeDeError(e: any, porDefecto: string): string {
  const d = e?.response?.data ?? e?.data ?? e;
  return d?.message || d?.error || e?.message || porDefecto;
}

async function fetchPendientes(): Promise<PagoPendiente[]> {
  const res = await fetch("/api/payment-approvals/pending");
  if (!res.ok) throw new Error("No se pudo cargar los comprobantes pendientes");
  const data = await res.json();
  return data.pagos || [];
}

export default function PaymentApprovals() {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data: pagos, isLoading } = useQuery({
    queryKey: ["payment-approvals-pending"],
    queryFn: fetchPendientes,
    refetchInterval: 5000,
  });

  const handleDecision = async (id: number, accion: "aprobar" | "rechazar") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/payment-approvals/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        toast.error(data?.mensaje || "No se pudo aplicar la decisión.");
        return;
      }
      if (accion === "aprobar") {
        toast.success(
          data?.entregaSinEnlace
            ? "Pago aprobado. El producto no tiene enlace de entrega configurado."
            : "Pago aprobado y entrega enviada al cliente por WhatsApp."
        );
      } else {
        toast.success("Pago rechazado.");
      }
      queryClient.invalidateQueries({ queryKey: ["payment-approvals-pending"] });
    } catch (e: any) {
      toast.error(mensajeDeError(e, "No se pudo procesar la decisión. Intentá de nuevo."));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">
            Pagos Pendientes de Aprobación
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Comprobantes que los clientes enviaron por WhatsApp y esperan tu confirmación para recibir el acceso.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
          </div>
        ) : !pagos || pagos.length === 0 ? (
          <div className="text-center py-20 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-primary opacity-80" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Todo al día</h3>
            <p className="max-w-md mx-auto text-sm text-slate-500">
              No hay comprobantes pendientes de aprobación en este momento.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pagos.map((pago) => (
              <Card key={pago.id} className="flex flex-col relative overflow-hidden bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-shadow border-l-[6px] border-amber-400">
                <CardHeader className="pb-3 pt-5">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base text-slate-900">
                      {pago.contactName || pago.payerName || "Cliente sin nombre"}
                    </CardTitle>
                    <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 font-medium">
                      Pendiente
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 text-sm space-y-2.5 pb-2">
                  <div className="flex items-center text-slate-500">
                    <Wallet className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                    <span className="font-bold text-slate-900">
                      {pago.amount?.toLocaleString()} {pago.currency || "COP"}
                    </span>
                    {pago.method && <span className="ml-2 text-xs text-slate-500">({pago.method})</span>}
                  </div>
                  {pago.payerPhone && (
                    <div className="flex items-center text-slate-500">
                      <Phone className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                      <span className="truncate text-xs text-slate-600">{pago.payerPhone}</span>
                    </div>
                  )}
                  {pago.productName && (
                    <div className="flex items-center text-slate-500">
                      <Package className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                      <span className="truncate text-xs text-slate-600">{pago.productName}</span>
                    </div>
                  )}
                  {pago.proofUrl && (
                    <a href={pago.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-indigo-600 hover:underline">
                      Ver comprobante
                    </a>
                  )}
                  {pago.notes && (
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-500 line-clamp-2 italic">
                      "{pago.notes}"
                    </div>
                  )}
                </CardContent>
                <CardFooter className="py-3 border-t border-slate-100 bg-slate-50/50 gap-2 flex flex-col">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 w-full mb-1">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(pago.createdAt), "d MMM, HH:mm", { locale: es })}
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button
                      variant="outline"
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={processingId === pago.id}
                      onClick={() => handleDecision(pago.id, "rechazar")}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" /> Rechazar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={processingId === pago.id}
                      onClick={() => handleDecision(pago.id, "aprobar")}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Aprobar
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
