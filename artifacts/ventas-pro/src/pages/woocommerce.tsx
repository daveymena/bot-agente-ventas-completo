import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Store, RefreshCw, Trash2, Plus, Package, ShoppingCart, ExternalLink, CheckCircle2, Clock, XCircle, AlertTriangle, ArrowUpRight, Loader2, ShoppingBag } from "lucide-react";

interface WooStore {
  id: number;
  name: string;
  url: string;
  consumerKey: string;
  isActive: boolean;
  isCentral: boolean;
  lastSyncAt: string | null;
  syncedProductCount: number;
}

interface WooOrder {
  id: number;
  wooOrderId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  items: Array<{ name: string; qty: number; price: number }>;
  total: string;
  currency: string;
  status: string;
  paymentMethod: string | null;
  adminEscalated: boolean;
  escalationReason: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendiente", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: Clock },
  paid: { label: "Pagado", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: CheckCircle2 },
  processing: { label: "En proceso", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: RefreshCw },
  completed: { label: "Completado", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
  escalated: { label: "Escalado", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: AlertTriangle },
};

function formatCOP(amount: string | number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(Number(amount));
}

export default function WooCommercePage() {
  const { toast } = useToast();
  const [stores, setStores] = useState<WooStore[]>([]);
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [showAddStore, setShowAddStore] = useState(false);
  const [orderFilter, setOrderFilter] = useState("all");
  const [addForm, setAddForm] = useState({ name: "", url: "", consumerKey: "", consumerSecret: "", isCentral: false });
  const [addingStore, setAddingStore] = useState(false);

  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    const res = await fetch("/api/woocommerce/stores");
    if (res.ok) setStores(await res.json());
    setLoadingStores(false);
  }, []);

  const fetchOrders = useCallback(async (status?: string) => {
    setLoadingOrders(true);
    const url = status && status !== "all" ? `/api/woocommerce/orders?status=${status}` : "/api/woocommerce/orders";
    const res = await fetch(url);
    if (res.ok) setOrders(await res.json());
    setLoadingOrders(false);
  }, []);

  useEffect(() => { fetchStores(); fetchOrders(); }, [fetchStores, fetchOrders]);

  async function handleAddStore() {
    setAddingStore(true);
    const res = await fetch("/api/woocommerce/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    setAddingStore(false);
    if (!res.ok) { toast({ title: "Error al conectar", description: data.message, variant: "destructive" }); return; }
    toast({ title: "Tienda conectada", description: `${addForm.name} conectada exitosamente` });
    setShowAddStore(false);
    setAddForm({ name: "", url: "", consumerKey: "", consumerSecret: "", isCentral: false });
    fetchStores();
  }

  async function handleSync(storeId: number, storeName: string) {
    setSyncingId(storeId);
    const res = await fetch(`/api/woocommerce/stores/${storeId}/sync`, { method: "POST" });
    const data = await res.json();
    setSyncingId(null);
    if (!res.ok) { toast({ title: "Error al sincronizar", description: data.message, variant: "destructive" }); return; }
    toast({ title: "Sincronización completada", description: `${storeName}: ${data.new} productos nuevos, ${data.updated} actualizados` });
    fetchStores();
  }

  async function handleDelete(storeId: number) {
    setDeletingId(storeId);
    await fetch(`/api/woocommerce/stores/${storeId}`, { method: "DELETE" });
    setDeletingId(null);
    toast({ title: "Tienda desconectada" });
    fetchStores();
  }

  async function handleStatusChange(orderId: number, status: string) {
    const res = await fetch(`/api/woocommerce/orders/${orderId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (res.ok) { toast({ title: "Estado actualizado" }); fetchOrders(orderFilter !== "all" ? orderFilter : undefined); }
  }

  async function handlePushToWoo(orderId: number) {
    setPushingId(orderId);
    const res = await fetch(`/api/woocommerce/orders/${orderId}/push-to-woo`, { method: "POST" });
    const data = await res.json();
    setPushingId(null);
    if (!res.ok) { toast({ title: "Error", description: data.message, variant: "destructive" }); return; }
    toast({ title: "Pedido enviado a WooCommerce", description: `Order ID: ${data.wooOrderId}` });
    fetchOrders();
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WooCommerce</h1>
            <p className="text-muted-foreground mt-1">Conecta tus tiendas y gestiona pedidos automáticos desde WhatsApp</p>
          </div>
          <Button onClick={() => setShowAddStore(true)} className="gap-2 bg-gradient-to-r from-primary to-orange-500 hover:opacity-90">
            <Plus className="h-4 w-4" /> Conectar Tienda
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Tiendas conectadas", value: stores.length, icon: Store, color: "text-blue-400" },
            { label: "Pedidos totales", value: orders.length, icon: ShoppingCart, color: "text-green-400" },
            { label: "Pendientes de pago", value: orders.filter(o => o.status === "pending").length, icon: Clock, color: "text-yellow-400" },
            { label: "Escalados al admin", value: orders.filter(o => o.adminEscalated).length, icon: AlertTriangle, color: "text-orange-400" },
          ].map(stat => (
            <Card key={stat.label} className="bg-card/50 border-white/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="stores">
          <TabsList className="bg-background/50 border border-white/10">
            <TabsTrigger value="stores" className="gap-2"><Store className="h-4 w-4" />Tiendas</TabsTrigger>
            <TabsTrigger value="orders" className="gap-2"><ShoppingBag className="h-4 w-4" />Pedidos</TabsTrigger>
          </TabsList>

          {/* STORES TAB */}
          <TabsContent value="stores" className="mt-4">
            {loadingStores ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : stores.length === 0 ? (
              <Card className="bg-card/50 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                  <Store className="h-16 w-16 text-muted-foreground/30" />
                  <div className="text-center">
                    <p className="text-lg font-medium">No hay tiendas conectadas</p>
                    <p className="text-sm text-muted-foreground mt-1">Conecta tu primera tienda WooCommerce para sincronizar productos y gestionar pedidos automáticamente.</p>
                  </div>
                  <Button onClick={() => setShowAddStore(true)} className="gap-2 mt-2">
                    <Plus className="h-4 w-4" /> Conectar primera tienda
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {stores.map(store => (
                  <Card key={store.id} className="bg-card/50 border-white/10 hover:border-primary/30 transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                            <Store className="h-5 w-5 text-purple-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {store.name}
                              {store.isCentral && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">CENTRAL</Badge>}
                            </CardTitle>
                            <a href={store.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                              {store.url} <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                        <Badge className={store.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>
                          {store.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-background/40 rounded-lg p-2.5">
                          <p className="text-muted-foreground text-xs">Productos sincronizados</p>
                          <p className="font-semibold mt-0.5">{store.syncedProductCount}</p>
                        </div>
                        <div className="bg-background/40 rounded-lg p-2.5">
                          <p className="text-muted-foreground text-xs">Última sincronización</p>
                          <p className="font-semibold mt-0.5 text-xs">{store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleDateString("es-CO") : "Nunca"}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-2 border-white/10 hover:bg-primary/10"
                          onClick={() => handleSync(store.id, store.name)}
                          disabled={syncingId === store.id}>
                          <RefreshCw className={`h-3.5 w-3.5 ${syncingId === store.id ? "animate-spin" : ""}`} />
                          {syncingId === store.id ? "Sincronizando..." : "Sincronizar"}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2 border-red-500/20 text-red-400 hover:bg-red-500/10"
                          onClick={() => handleDelete(store.id)} disabled={deletingId === store.id}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ORDERS TAB */}
          <TabsContent value="orders" className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Select value={orderFilter} onValueChange={(v) => { setOrderFilter(v); fetchOrders(v !== "all" ? v : undefined); }}>
                <SelectTrigger className="w-48 border-white/10 bg-background/50">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los pedidos</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="paid">Pagados</SelectItem>
                  <SelectItem value="processing">En proceso</SelectItem>
                  <SelectItem value="completed">Completados</SelectItem>
                  <SelectItem value="escalated">Escalados</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="border-white/10" onClick={() => fetchOrders(orderFilter !== "all" ? orderFilter : undefined)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {loadingOrders ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : orders.length === 0 ? (
              <Card className="bg-card/50 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center py-12 gap-3">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No hay pedidos {orderFilter !== "all" ? `con estado "${orderFilter}"` : "aún"}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {orders.map(order => {
                  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <Card key={order.id} className="bg-card/50 border-white/10 hover:border-white/20 transition-all">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">#{order.id}</span>
                              {order.wooOrderId && <span className="text-xs text-muted-foreground">WC#{order.wooOrderId}</span>}
                              <Badge className={`text-[11px] gap-1 ${statusCfg.color}`}>
                                <StatusIcon className="h-3 w-3" />{statusCfg.label}
                              </Badge>
                              {order.adminEscalated && (
                                <Badge className="text-[11px] bg-orange-500/10 text-orange-400 border-orange-500/20 gap-1">
                                  <AlertTriangle className="h-3 w-3" />Admin requerido
                                </Badge>
                              )}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground">{order.contactName ?? "Cliente"} — {order.contactPhone ?? "Sin teléfono"}</p>
                              {order.items.length > 0 && (
                                <p className="mt-0.5">{order.items.map(i => `${i.qty}x ${i.name}`).join(", ")}</p>
                              )}
                              {order.escalationReason && <p className="mt-1 text-orange-400 text-xs">⚠️ {order.escalationReason}</p>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-lg">{formatCOP(order.total)}</p>
                            <p className="text-xs text-muted-foreground">{order.paymentMethod ?? "Sin método"}</p>
                            <p className="text-xs text-muted-foreground mt-1">{new Date(order.createdAt).toLocaleDateString("es-CO")}</p>
                          </div>
                        </div>
                        {order.status !== "completed" && order.status !== "cancelled" && (
                          <div className="flex gap-2 mt-3 pt-3 border-t border-white/5 flex-wrap">
                            {order.status === "pending" && (
                              <Button size="sm" variant="outline" className="text-xs border-white/10 h-7"
                                onClick={() => handleStatusChange(order.id, "paid")}>Marcar pagado</Button>
                            )}
                            {order.status === "paid" && (
                              <Button size="sm" variant="outline" className="text-xs border-white/10 h-7"
                                onClick={() => handleStatusChange(order.id, "processing")}>Procesar</Button>
                            )}
                            {order.status === "processing" && (
                              <Button size="sm" variant="outline" className="text-xs border-green-500/20 text-green-400 h-7"
                                onClick={() => handleStatusChange(order.id, "completed")}>Completar</Button>
                            )}
                            {!order.wooOrderId && order.status !== "escalated" && (
                              <Button size="sm" className="text-xs h-7 gap-1 bg-purple-600 hover:bg-purple-700"
                                onClick={() => handlePushToWoo(order.id)} disabled={pushingId === order.id}>
                                {pushingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                                Enviar a WooCommerce
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs border-red-500/20 text-red-400 h-7 ml-auto"
                              onClick={() => handleStatusChange(order.id, "cancelled")}>Cancelar</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ADD STORE DIALOG */}
      <Dialog open={showAddStore} onOpenChange={setShowAddStore}>
        <DialogContent className="sm:max-w-md bg-background/95 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" />Conectar Tienda WooCommerce</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre de la tienda</Label>
              <Input placeholder="Mi Tienda Principal" className="bg-background/50 border-white/10"
                value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>URL de la tienda</Label>
              <Input placeholder="https://mitienda.com" className="bg-background/50 border-white/10"
                value={addForm.url} onChange={e => setAddForm(p => ({ ...p, url: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Consumer Key</Label>
              <Input placeholder="ck_xxxxxxxxxxxx" className="bg-background/50 border-white/10"
                value={addForm.consumerKey} onChange={e => setAddForm(p => ({ ...p, consumerKey: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Consumer Secret</Label>
              <Input type="password" placeholder="cs_xxxxxxxxxxxx" className="bg-background/50 border-white/10"
                value={addForm.consumerSecret} onChange={e => setAddForm(p => ({ ...p, consumerSecret: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <input type="checkbox" id="isCentral" checked={addForm.isCentral}
                onChange={e => setAddForm(p => ({ ...p, isCentral: e.target.checked }))}
                className="h-4 w-4 rounded border-white/20" />
              <label htmlFor="isCentral" className="text-sm cursor-pointer">
                <span className="font-medium">Tienda central</span>
                <span className="text-muted-foreground ml-1.5">— prioridad para todos los tenants sin tienda propia</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtén las claves en: WooCommerce → Ajustes → Avanzado → API REST → Agregar clave
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStore(false)} className="border-white/10">Cancelar</Button>
            <Button onClick={handleAddStore} disabled={addingStore || !addForm.name || !addForm.url || !addForm.consumerKey || !addForm.consumerSecret}
              className="gap-2 bg-gradient-to-r from-primary to-orange-500">
              {addingStore ? <><Loader2 className="h-4 w-4 animate-spin" />Conectando...</> : <><Plus className="h-4 w-4" />Conectar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
