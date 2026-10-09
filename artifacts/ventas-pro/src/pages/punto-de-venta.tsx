import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Minus, Plus, ReceiptText, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

/**
 * Punto de venta de la tienda física: cobrar en mostrador, inventario con
 * entradas y ajustes, caja con arqueo, y reportes con devoluciones.
 * Habla con /api/pos (ver routes/pos.ts). Solo para negocios con formato
 * "tienda_fisica": si no lo es, ofrece activarlo acá mismo.
 */

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const METODOS = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"];

interface ItemInv {
  id: number; nombre: string; sku: string | null; precio: number;
  stock: number | null; conControl: boolean; stockBajo: boolean; valorizado: number | null;
}

interface LineaCarro { id: number; nombre: string; precio: number; stock: number | null; cantidad: number; descuentoPct: number }

async function api(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || "Falló la operación");
  return d;
}

export default function PuntoDeVentaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("cobrar");
  const [busqueda, setBusqueda] = useState("");
  const [carro, setCarro] = useState<LineaCarro[]>([]);
  const [metodo, setMetodo] = useState("efectivo");
  const [cliente, setCliente] = useState("");
  const [documento, setDocumento] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [entradaDe, setEntradaDe] = useState<ItemInv | null>(null);
  const [entradaCant, setEntradaCant] = useState("");
  const [ajusteDe, setAjusteDe] = useState<ItemInv | null>(null);
  const [ajusteSaldo, setAjusteSaldo] = useState("");
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");
  const [devAbierta, setDevAbierta] = useState(false);
  const [devPago, setDevPago] = useState("");
  const [devProd, setDevProd] = useState("");
  const [devCant, setDevCant] = useState("1");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const invQ = useQuery({
    queryKey: ["pos-inventario"],
    queryFn: () => api("/api/pos/inventario"),
    retry: false,
  });
  const cajaQ = useQuery({ queryKey: ["pos-caja"], queryFn: () => api("/api/pos/caja"), retry: false, refetchInterval: 15000 });
  const repQ = useQuery({
    queryKey: ["pos-reporte", desde, hasta],
    queryFn: () => api(`/api/pos/reporte?desde=${desde}&hasta=${hasta}`),
    retry: false,
  });

  const noEsTienda = !!invQ.error && String((invQ.error as Error).message).includes("tienda física");
  const items: ItemInv[] = invQ.data?.items ?? [];
  const caja = cajaQ.data?.caja ?? null;

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["pos-inventario"] });
    qc.invalidateQueries({ queryKey: ["pos-caja"] });
    qc.invalidateQueries({ queryKey: ["pos-reporte"] });
  };

  const activar = async () => {
    try {
      await api("/api/pos/activar", { method: "POST", body: "{}" });
      toast.success("Tienda física activada");
      refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => (!q || i.nombre.toLowerCase().includes(q)) && i.conControl && (i.stock ?? 0) > 0);
  }, [items, busqueda]);

  const agregar = (p: ItemInv) => {
    setCarro((c) => {
      const e = c.find((l) => l.id === p.id);
      const disp = p.stock ?? 0;
      if (e) {
        if (e.cantidad + 1 > disp) { toast.error(`Solo hay ${disp}`); return c; }
        return c.map((l) => (l.id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...c, { id: p.id, nombre: p.nombre, precio: p.precio, stock: disp, cantidad: 1, descuentoPct: 0 }];
    });
  };

  const totalCarro = carro.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuentoPct / 100), 0);

  const cobrar = async () => {
    if (!carro.length) return;
    setCobrando(true);
    try {
      const r = await api("/api/pos/vender", {
        method: "POST",
        body: JSON.stringify({
          items: carro.map((l) => ({ productId: l.id, cantidad: l.cantidad, descuentoPct: l.descuentoPct })),
          metodoPago: metodo,
          cliente: { nombre: cliente || undefined, documento: documento || undefined },
        }),
      });
      setTicket(r);
      setCarro([]); setCliente(""); setDocumento("");
      toast.success(`Venta #${r.pagoId} por ${pesos(r.total)}`);
      refrescar();
    } catch (e: any) { toast.error(e.message); }
    finally { setCobrando(false); }
  };

  const guardarEntrada = async () => {
    if (!entradaDe) return;
    try {
      const r = await api("/api/pos/entrada", { method: "POST", body: JSON.stringify({ productId: entradaDe.id, cantidad: Number(entradaCant), motivo: "Entrada desde el panel" }) });
      toast.success(`Stock ahora en ${r.stock}`);
      setEntradaDe(null); setEntradaCant("");
      refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  const guardarAjuste = async () => {
    if (!ajusteDe) return;
    try {
      const r = await api("/api/pos/ajustar", { method: "POST", body: JSON.stringify({ productId: ajusteDe.id, nuevoSaldo: Number(ajusteSaldo), motivo: "Conteo físico desde el panel" }) });
      toast.success(`Saldo ahora en ${r.stock}`);
      setAjusteDe(null); setAjusteSaldo("");
      refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  const abrirCaja = async () => {
    try {
      await api("/api/pos/caja/abrir", { method: "POST", body: JSON.stringify({ fondoInicial: Number(fondo) || 0 }) });
      toast.success("Caja abierta"); setFondo(""); refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  const cerrarCaja = async () => {
    try {
      const r = await api("/api/pos/caja/cerrar", { method: "POST", body: JSON.stringify({ contado: Number(contado) }) });
      const dif = Number(r.caja.diferencia) || 0;
      toast.success(dif === 0 ? "Caja cuadrada ✅" : `Diferencia: ${pesos(dif)}`);
      setContado(""); refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  const devolver = async () => {
    try {
      const r = await api("/api/pos/devolver", {
        method: "POST",
        body: JSON.stringify({ pagoId: Number(devPago), items: [{ productId: Number(devProd), cantidad: Number(devCant) }], motivo: "Devolución desde el panel" }),
      });
      toast.success(`Devolución por ${pesos(r.total)}`);
      setDevAbierta(false); setDevPago(""); setDevProd(""); setDevCant("1");
      refrescar();
    } catch (e: any) { toast.error(e.message); }
  };

  if (invQ.isLoading) {
    return <Layout><div className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div></Layout>;
  }

  if (noEsTienda) {
    return (
      <Layout>
        <Card className="max-w-lg mx-auto mt-10">
          <CardHeader><CardTitle>Punto de venta</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">Este negocio todavía no está marcado como tienda física. Al activarlo se habilitan inventario, caja y cobro en mostrador (la tienda online y el dropshipping no se tocan).</p>
            <Button onClick={activar}>Activar tienda física</Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (invQ.error) {
    return <Layout><p className="text-sm text-red-700">{String((invQ.error as Error).message)}</p></Layout>;
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Punto de venta</h1>
            <p className="text-sm text-slate-500 mt-1">Cobra en mostrador, lleva inventario y cuadra la caja. Cada venta factura sola si hay sistema conectado.</p>
          </div>
          {caja
            ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><Wallet className="w-3 h-3 mr-1" />Caja #{caja.id} abierta</Badge>
            : <Badge variant="outline"><AlertTriangle className="w-3 h-3 mr-1" />Sin caja abierta</Badge>}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full md:w-auto">
            <TabsTrigger value="cobrar">Cobrar</TabsTrigger>
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="caja">Caja</TabsTrigger>
            <TabsTrigger value="reportes">Reportes</TabsTrigger>
          </TabsList>

          <TabsContent value="cobrar" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Productos</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Input placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                  <div className="flex flex-col gap-2 max-h-[420px] overflow-auto">
                    {visibles.slice(0, 60).map((p) => (
                      <button key={p.id} onClick={() => agregar(p)} className="flex items-center justify-between text-left border rounded-lg px-3 py-2 hover:bg-slate-50">
                        <span className="min-w-0"><span className="block font-medium text-sm truncate">{p.nombre}</span><span className="text-xs text-slate-500">{pesos(p.precio)} · {p.stock} disp.</span></span>
                        <Plus className="w-4 h-4 shrink-0 text-slate-400" />
                      </button>
                    ))}
                    {!visibles.length && <p className="text-sm text-slate-500">Sin productos con stock. Carga entradas en Inventario.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Cuenta</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {carro.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 border rounded-lg px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{l.nombre}</div>
                        <div className="text-xs text-slate-500">{pesos(l.precio)} c/u</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setCarro((c) => c.map((x) => (x.id === l.id ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x)))}><Minus className="w-3 h-3" /></Button>
                        <span className="text-sm w-6 text-center">{l.cantidad}</span>
                        <Button size="icon" variant="ghost" onClick={() => setCarro((c) => c.map((x) => (x.id === l.id && x.cantidad + 1 <= (x.stock ?? 0) ? { ...x, cantidad: x.cantidad + 1 } : x)))}><Plus className="w-3 h-3" /></Button>
                      </div>
                      <Input className="w-16 h-8 text-xs" type="number" min={0} max={100} value={l.descuentoPct} onChange={(e) => setCarro((c) => c.map((x) => (x.id === l.id ? { ...x, descuentoPct: Number(e.target.value) || 0 } : x)))} title="Descuento %" />
                      <Button size="icon" variant="ghost" onClick={() => setCarro((c) => c.filter((x) => x.id !== l.id))}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </div>
                  ))}
                  {!carro.length && <p className="text-sm text-slate-500">Toca un producto para sumarlo.</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Cliente (opcional)</Label><Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre" /></div>
                    <div><Label className="text-xs">Documento</Label><Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Cédula/NIT" /></div>
                  </div>
                  <div>
                    <Label className="text-xs">Medio de pago</Label>
                    <Select value={metodo} onValueChange={setMetodo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{METODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total</span><span>{pesos(totalCarro)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={!carro.length || cobrando} onClick={cobrar}>
                      <ReceiptText className="w-4 h-4 mr-2" />{cobrando ? "Cobrando…" : "Cobrar"}
                    </Button>
                    <Button variant="outline" onClick={() => setDevAbierta(true)}>Devolver</Button>
                  </div>
                  {ticket && (
                    <div className="text-sm border rounded-lg p-3 bg-emerald-50/60">
                      ✅ Venta #{ticket.pagoId} por {pesos(ticket.total)}
                      {ticket.factura ? <> 🧾 Factura {ticket.factura.numero || ""} ({ticket.factura.proveedor})</> : <> · Recibo (sin factura: {String(ticket.facturaError || "").slice(0, 120)})</>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventario" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Inventario · {invQ.data.totalUnidades} und · {pesos(invQ.data.valorizado)}</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Valorizado</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <span className="font-medium text-sm">{i.nombre}</span>
                          <span className="block text-xs text-slate-500">{i.sku || "sin SKU"}</span>
                          {!i.conControl && <Badge variant="outline" className="mt-1">sin control</Badge>}
                          {i.stockBajo && <Badge className="mt-1 ml-1 bg-amber-100 text-amber-800 hover:bg-amber-100">bajo: {i.stock}</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{pesos(i.precio)}</TableCell>
                        <TableCell className="text-right text-sm">{i.conControl ? i.stock : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{i.valorizado == null ? "—" : pesos(i.valorizado)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" className="mr-1" onClick={() => { setEntradaDe(i); setEntradaCant(""); }}>Entrada</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAjusteDe(i); setAjusteSaldo(String(i.stock ?? 0)); }}>Ajustar</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="caja" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Turno</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {caja ? (
                    <>
                      <p className="text-sm">Caja #{caja.id} abierta · fondo {pesos(Number(caja.fondoInicial) || 0)}</p>
                      <div><Label className="text-xs">Contado en cajón</Label><Input type="number" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" /></div>
                      <Button onClick={cerrarCaja}>Cerrar y cuadrar</Button>
                    </>
                  ) : (
                    <>
                      <div><Label className="text-xs">Fondo inicial</Label><Input type="number" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="0" /></div>
                      <Button onClick={abrirCaja}>Abrir caja</Button>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Arqueo</CardTitle></CardHeader>
                <CardContent className="text-sm text-slate-600">
                  Al cerrar, el sistema suma fondo + efectivo del turno y lo compara con lo contado: la diferencia (sobrante o faltante) queda guardada en el cierre.
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reportes" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Ventas</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                  <Input type="date" className="w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
                  <Input type="date" className="w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                  <Button variant="outline" asChild><a href={`/api/pos/exportar?formato=csv&desde=${desde}&hasta=${hasta}`}>Exportar CSV</a></Button>
                </div>
                {repQ.data ? (
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Ventas</div><div className="text-xl font-semibold">{repQ.data.ventas} · {pesos(repQ.data.total)}</div></div>
                    <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Por medio de pago</div>{Object.entries(repQ.data.porMetodo || {}).map(([k, v]) => <div key={k} className="text-sm">{k}: {pesos(Number(v))}</div>)}</div>
                    <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Más vendidos</div>{(repQ.data.porProducto || []).slice(0, 5).map((p: any) => <div key={String(p.productId)} className="text-sm">{p.nombre} × {p.cantidad}</div>)}<div className="text-xs text-slate-500 mt-2">Devoluciones: {repQ.data.devoluciones} ({pesos(repQ.data.totalDevuelto)})</div></div>
                  </div>
                ) : <Skeleton className="h-20 w-full" />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!entradaDe} onOpenChange={(o) => !o && setEntradaDe(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entrada · {entradaDe?.nombre}</DialogTitle></DialogHeader>
          <Label className="text-xs">Cantidad que entra</Label>
          <Input type="number" min={1} value={entradaCant} onChange={(e) => setEntradaCant(e.target.value)} />
          <DialogFooter><Button onClick={guardarEntrada}>Guardar entrada</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ajusteDe} onOpenChange={(o) => !o && setAjusteDe(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuste · {ajusteDe?.nombre}</DialogTitle></DialogHeader>
          <Label className="text-xs">Saldo real del conteo físico</Label>
          <Input type="number" min={0} value={ajusteSaldo} onChange={(e) => setAjusteSaldo(e.target.value)} />
          <p className="text-xs text-slate-500">La diferencia con el sistema queda auditada como ajuste.</p>
          <DialogFooter><Button onClick={guardarAjuste}>Fijar saldo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={devAbierta} onOpenChange={setDevAbierta}>
        <DialogContent>
          <DialogHeader><DialogTitle>Devolución</DialogTitle></DialogHeader>
          <Label className="text-xs"># de venta</Label>
          <Input type="number" value={devPago} onChange={(e) => setDevPago(e.target.value)} />
          <Label className="text-xs"># de producto</Label>
          <Input type="number" value={devProd} onChange={(e) => setDevProd(e.target.value)} />
          <Label className="text-xs">Cantidad</Label>
          <Input type="number" min={1} value={devCant} onChange={(e) => setDevCant(e.target.value)} />
          <DialogFooter><Button onClick={devolver}>Registrar devolución</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
