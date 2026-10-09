import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Pedidos que tomó el bot. Hasta el 07-10 no había esta pantalla: un pedido
 * que el proveedor rechazaba solo se veía preguntándole a Atlas, y una venta
 * real quedó un día sin despachar sin que nadie se enterara. Los que no
 * llegaron al proveedor van arriba, en rojo, con su botón de reintentar
 * (además el servidor los reintenta solo cada 20 minutos).
 */

interface Pedido {
  id: number;
  conversacionId: number | null;
  producto: string | null;
  cantidad: number;
  total: number;
  cliente: string | null;
  telefono: string | null;
  destino: string;
  direccion: string | null;
  pago: string | null;
  estado: string;
  enProveedor: boolean;
  ordenProveedor: string | null;
  error: string | null;
  transportadora: string | null;
  creado: string;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

async function traerPedidos(): Promise<Pedido[]> {
  const r = await fetch("/api/pedidos", { credentials: "include" });
  if (!r.ok) throw new Error("No se pudieron cargar los pedidos");
  return (await r.json()).pedidos ?? [];
}

/** Atascado = el cliente ya dio el sí y el pedido no llegó al proveedor. */
function atascado(p: Pedido): boolean {
  return !p.enProveedor && !!p.error && !["cancelado", "entregado", "devuelto"].includes(p.estado);
}

export default function PedidosPage() {
  const qc = useQueryClient();
  const [reintentando, setReintentando] = useState<number | null>(null);
  const { data: pedidos, isLoading } = useQuery({ queryKey: ["pedidos-bot"], queryFn: traerPedidos, refetchInterval: 15000 });

  const lista = pedidos ?? [];
  const caidos = lista.filter(atascado);
  const resto = lista.filter((p) => !atascado(p));

  const reintentar = async (id: number) => {
    setReintentando(id);
    try {
      const r = await fetch(`/api/pedidos/${id}/reintentar`, { method: "POST", credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (d.ok) toast.success(d.mensaje || "Pedido registrado en el proveedor");
      else toast.error(d.mensaje || d.error || "No entró");
      await qc.invalidateQueries({ queryKey: ["pedidos-bot"] });
    } catch {
      toast.error("No se pudo reintentar");
    } finally {
      setReintentando(null);
    }
  };

  const fila = (p: Pedido) => (
    <Card key={p.id} className={atascado(p) ? "border-red-300 bg-red-50/40" : ""}>
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">#{p.id} · {p.producto || "Producto"}</span>
            {p.cantidad > 1 && <Badge variant="secondary">× {p.cantidad}</Badge>}
            {p.enProveedor ? (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" />En el proveedor{p.ordenProveedor ? ` · #${p.ordenProveedor}` : ""}</Badge>
            ) : atascado(p) ? (
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><AlertTriangle className="w-3 h-3 mr-1" />No llegó al proveedor</Badge>
            ) : (
              <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{p.estado}</Badge>
            )}
          </div>
          <div className="text-sm text-slate-600 mt-1">
            {p.cliente || "Cliente"}{p.telefono ? ` · ${p.telefono}` : ""} · {p.destino || "sin ciudad"} · <b>{pesos(p.total)}</b>
            {p.pago === "contraentrega" ? " contraentrega" : p.pago ? ` · ${p.pago}` : ""}
          </div>
          {p.transportadora && <div className="text-xs text-slate-500 mt-0.5"><Truck className="w-3 h-3 inline mr-1" />{p.transportadora}</div>}
          {atascado(p) && p.error && <div className="text-xs text-red-700 mt-1">{p.error.slice(0, 220)}</div>}
          <div className="text-xs text-slate-400 mt-1">{format(parseISO(p.creado), "d MMM, HH:mm", { locale: es })}</div>
        </div>
        {atascado(p) && (
          <Button onClick={() => reintentar(p.id)} disabled={reintentando === p.id} className="shrink-0">
            <RotateCcw className="w-4 h-4 mr-2" />{reintentando === p.id ? "Enviando…" : "Reintentar"}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Pedidos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Los pedidos que cerró el vendedor. Si alguno no llega al proveedor, aparece arriba en rojo: el sistema lo reintenta solo cada 20 minutos y le avisa al cliente cuando entra.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : lista.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-slate-500">Todavía no hay pedidos.</CardContent></Card>
        ) : (
          <>
            {caidos.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-red-700">Necesitan atención ({caidos.length})</h2>
                {caidos.map(fila)}
              </section>
            )}
            <section className="flex flex-col gap-3">
              {caidos.length > 0 && <h2 className="text-sm font-semibold text-slate-700">Todos</h2>}
              {resto.map(fila)}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
