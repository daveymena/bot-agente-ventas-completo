import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Search, Package, Truck, RefreshCw, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";

/**
 * Dropi directo: el negocio pega su token de integración, trae su catálogo
 * y los pedidos van a Dropi sin pasar por WooCommerce.
 */

const api = async (endpoint: string, options: RequestInit = {}) => {
  const r = await fetch(`/api${endpoint}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detalle || j.error || j.message || `Error ${r.status}`);
  return j;
};

interface Integracion { tienda: string | null; usuario: string | null; vence: string | null }
interface Config {
  conectado: boolean;
  tokenHuella: string | null;
  integracion: Integracion | null;
  sugerencia: { tokenHuella: string; integracion: Integracion | null } | null;
}
interface ProductoDropi {
  id: number; nombre: string; precioSugerido: number | null; costo: number | null; stock: number | null;
  proveedor: string | null; categoria: string | null; foto: string | null; tipo: string | null; bodega: string | null; importadoComo: number | null;
}

const cop = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(Number(v)).toLocaleString("es-CO")}`);

export default function DropiPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [cargando, setCargando] = useState(true);
  const [token, setToken] = useState("");
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; detalle: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [q, setQ] = useState("");
  const [conStock, setConStock] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ProductoDropi[]>([]);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [importando, setImportando] = useState<number | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [verificacion, setVerificacion] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setConfig(await api("/dropi/config")); } catch (e: any) { toast({ title: "No se pudo leer la conexión con Dropi", description: e.message, variant: "destructive" }); }
    finally { setCargando(false); }
  }, [toast]);
  useEffect(() => { void cargar(); }, [cargar]);

  const probar = async () => {
    if (!token.trim()) return;
    setProbando(true); setPrueba(null);
    try { setPrueba(await api("/dropi/probar", { method: "POST", body: JSON.stringify({ token }) })); }
    catch (e: any) { setPrueba({ ok: false, detalle: e.message }); }
    finally { setProbando(false); }
  };

  const guardar = async (desdeWoo = false) => {
    setGuardando(true);
    try {
      const r = await api("/dropi/config", { method: "PUT", body: JSON.stringify(desdeWoo ? { desdeWoo: true } : { token }) });
      toast({ title: "Dropi conectado", description: r.detalle });
      setToken(""); setPrueba(null);
      await cargar();
    } catch (e: any) { toast({ title: "No se pudo conectar", description: e.message, variant: "destructive" }); }
    finally { setGuardando(false); }
  };

  const desconectar = async () => {
    if (!confirm("¿Quitar el token de Dropi? Los pedidos volverán a ir por WooCommerce (si está configurado).")) return;
    try { await api("/dropi/config", { method: "DELETE" }); await cargar(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = await api(`/dropi/buscar?q=${encodeURIComponent(q)}&conStock=${conStock ? 1 : 0}&porPagina=24`);
      if (!r.ok) throw new Error(r.error || "Dropi no respondió");
      setResultados(r.productos || []);
      if (!r.productos?.length) toast({ title: "Sin resultados en Dropi", description: q ? `Nada para "${q}"` : "Probá con una palabra" });
    } catch (e: any) { toast({ title: "Dropi no respondió", description: e.message, variant: "destructive" }); }
    finally { setBuscando(false); }
  };

  const importar = async (p: ProductoDropi) => {
    setImportando(p.id);
    try {
      const precio = Number(precios[p.id]) || null;
      const r = await api("/dropi/importar", { method: "POST", body: JSON.stringify({ items: [{ dropiProductId: p.id, precio }], lanzar: false }) });
      const it = r.resultados?.[0];
      if (!it?.ok) throw new Error(it?.error || "No se pudo importar");
      toast({ title: it.yaExistia ? "Producto actualizado" : "Producto importado", description: `${it.nombre}${it.curadoPor ? ` · ficha organizada por ${it.curadoPor}` : ""}${!it.yaExistia ? " · sin anuncio automático (usá 🚀 Lanzar si querés landing/copies/borrador)" : ""}` });
      setResultados((prev) => prev.map((x) => (x.id === p.id ? { ...x, importadoComo: it.productId } : x)));
    } catch (e: any) { toast({ title: "No se pudo importar", description: e.message, variant: "destructive" }); }
    finally { setImportando(null); }
  };

  const [lanzando, setLanzando] = useState<number | null>(null);
  const lanzar = async (productId: number) => {
    setLanzando(productId);
    try {
      const r = await api(`/dropi/lanzar/${productId}`, { method: "POST", body: JSON.stringify({ forzar: true }) });
      toast({ title: "Lanzamiento en marcha", description: r.mensaje || "Ficha → landing → copies → anuncio en borrador. Te llega el resumen por WhatsApp en 2-5 minutos." });
    } catch (e: any) { toast({ title: "No se pudo lanzar", description: e.message, variant: "destructive" }); }
    finally { setTimeout(() => setLanzando(null), 3000); }
  };

  const verificar = async () => {
    setVerificando(true); setVerificacion(null);
    try {
      const r = await api("/dropi/verificar", { method: "POST" });
      setVerificacion(`Revisados ${r.revisados} · desactivados ${r.desactivados.length}${r.desactivados.length ? ` (${r.desactivados.map((d: any) => `${d.nombre}: ${d.motivo}`).join("; ")})` : ""} · reactivados ${r.reactivados.length}${r.vinculo?.vinculados ? ` · vinculados desde WooCommerce ${r.vinculo.vinculados}` : ""}${r.errores ? ` · sin respuesta ${r.errores}` : ""}`);
    } catch (e: any) { toast({ title: "No se pudo verificar", description: e.message, variant: "destructive" }); }
    finally { setVerificando(false); }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Dropi</h1>
            <p className="text-muted-foreground text-sm mt-1">Conectá tu cuenta de Dropi con el token de integración: el bot trae tu catálogo y crea los pedidos directo en Dropi, sin pasar por WooCommerce.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Conexión</CardTitle>
            <CardDescription>El token está en Dropi → <b>Mis Integraciones</b> → crear una integración → copiar el token. Se guarda cifrado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cargando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la conexión…</div>
            ) : config?.conectado ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b>Conectado</b> · token {config.tokenHuella}
                      {config.integracion?.tienda ? <> · integración <span className="font-mono text-xs">{config.integracion.tienda}</span></> : null}
                      {config.integracion?.vence ? <> · vence {config.integracion.vence}</> : null}
                    </span>
                    <Button variant="outline" size="sm" onClick={desconectar}>Quitar token</Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {config?.sugerencia ? (
                  <Alert>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>Encontré el token que Dropify dejó en tu WooCommerce ({config.sugerencia.tokenHuella}). Podés usar ese mismo.</span>
                      <Button size="sm" onClick={() => guardar(true)} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Usar el de WooCommerce"}</Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="token">Token de integración de Dropi</Label>
                  <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJ0eXAiOiJKV1QiLCJhbGci…" autoComplete="off" />
                </div>
                {prueba ? (
                  <Alert variant={prueba.ok ? "default" : "destructive"}>
                    {prueba.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertDescription>{prueba.detalle}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={probar} disabled={!token.trim() || probando}>{probando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Probar"}</Button>
                  <Button onClick={() => guardar(false)} disabled={!token.trim() || guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar y conectar"}</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {config?.conectado ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Catálogo de Dropi</CardTitle>
                <CardDescription>Buscá productos de los proveedores y traelos a tu catálogo. El precio de venta lo decidís vos; si lo dejás vacío se usa el sugerido.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap items-center">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Ej: corrector de postura, faja, licuadora…" className="flex-1 min-w-[220px]" />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conStock} onChange={(e) => setConStock(e.target.checked)} /> Solo con stock</label>
                  <Button onClick={buscar} disabled={buscando}>{buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</Button>
                </div>
                {resultados.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {resultados.map((p) => (
                      <div key={p.id} className="border rounded-xl p-3 flex flex-col gap-2 bg-background">
                        <div className="aspect-[4/3] rounded-lg bg-muted overflow-hidden">{p.foto ? <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" loading="lazy" /> : null}</div>
                        <div className="text-sm font-semibold leading-snug line-clamp-2">{p.nombre}</div>
                        <div className="text-xs text-muted-foreground">Costo {cop(p.costo)} · sugerido {cop(p.precioSugerido)} · stock {p.stock ?? "—"}{p.categoria ? ` · ${p.categoria}` : ""}</div>
                        {p.proveedor ? <div className="text-xs text-muted-foreground">Proveedor: {p.proveedor}{p.bodega ? ` · ${p.bodega}` : ""}</div> : null}
                        {p.importadoComo ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> En tu catálogo (id {p.importadoComo})</div>
                            <Button size="sm" variant="outline" onClick={() => lanzar(p.importadoComo!)} disabled={lanzando === p.importadoComo}>{lanzando === p.importadoComo ? <Loader2 className="h-4 w-4 animate-spin" /> : "🚀 Lanzar"}</Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <Input type="number" inputMode="numeric" placeholder={p.precioSugerido ? String(Math.round(p.precioSugerido)) : "Precio de venta"} value={precios[p.id] ?? ""} onChange={(e) => setPrecios((prev) => ({ ...prev, [p.id]: e.target.value }))} className="h-8 text-sm" />
                            <Button size="sm" onClick={() => importar(p)} disabled={importando === p.id}>{importando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Disponibilidad</CardTitle>
                <CardDescription>Revisa en Dropi cada producto importado: desactiva los archivados o sin stock y reactiva los que volvieron. También vincula los que ya tenías por WooCommerce.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" onClick={verificar} disabled={verificando}>{verificando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}Verificar ahora</Button>
                {verificacion ? <p className="text-sm text-muted-foreground">{verificacion}</p> : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
