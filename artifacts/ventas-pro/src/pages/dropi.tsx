import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Search, Package, Truck, RefreshCw, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { LogoMarca } from "@/components/logo-marca";

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

interface Lote {
  id: string; estado: "en_curso" | "terminado" | "detenido"; total: number; hechos: number;
  importados: Array<{ dropiProductId: number; productId: number; nombre: string; nuevo: boolean }>;
  fallidos: Array<{ dropiProductId: number; error: string }>;
  factorSobreCosto: number | null; curar: boolean;
}

const cop = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(Number(v)).toLocaleString("es-CO")}`);

/** Misma regla que el servidor (precioPorFactor): costo × factor, a miles terminado en 900. */
const precioPorFactor = (costo: number | null, factor: number): number | null => {
  if (!costo || !(costo > 0) || !(factor > 1)) return null;
  const crudo = costo * factor;
  let v = Math.ceil(crudo / 1000) * 1000 - 100;
  if (v < crudo) v += 1000;
  return v;
};

/**
 * Cotizador de envío (30-09-2026): el mismo cálculo que el panel de Dropi —
 * transportadoras que pueden llevar el producto a la ciudad, con flete,
 * comisión y la ganancia que queda. Lo mismo usan Atlas, la landing y el
 * vendedor de WhatsApp (ellos sin mostrarle el flete al cliente).
 */
interface CotizacionFila { transportadora: string; disponible: boolean; flete: number | null; comisionDropi: number | null; alProveedor: number | null; ganancia: number | null; totalCobrado: number | null }
function CotizadorEnvio() {
  const { toast } = useToast();
  const [productos, setProductos] = useState<Array<{ id: number; name: string; price: number }>>([]);
  const [productId, setProductId] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [precio, setPrecio] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [recaudo, setRecaudo] = useState(true);
  const [cotizando, setCotizando] = useState(false);
  const [res, setRes] = useState<{ ciudad?: { nombre: string; departamento: string; aceptaContraentrega: boolean | null }; transportadoras?: CotizacionFila[]; error?: string } | null>(null);

  useEffect(() => {
    api("/products").then((r) => setProductos((Array.isArray(r) ? r : r.products || []).map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })))).catch(() => {});
  }, []);

  const cotizar = async () => {
    if (!productId || !ciudad.trim()) { toast({ title: "Elegí producto y ciudad" }); return; }
    setCotizando(true); setRes(null);
    try {
      const qs = new URLSearchParams({ productId, ciudad: ciudad.trim(), departamento: departamento.trim(), cantidad: cantidad || "1", recaudo: recaudo ? "1" : "0" });
      if (Number(precio) > 0) qs.set("precio", String(Number(precio)));
      const r = await api(`/dropi/cotizar?${qs}`);
      setRes(r.ok ? r : { error: r.error || "Dropi no cotizó" });
    } catch (e: any) { setRes({ error: e.message }); }
    finally { setCotizando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Cotizar envío</CardTitle>
        <CardDescription>Qué transportadoras pueden llevar el producto a esa ciudad, cuánto cuesta el flete y cuánto te queda. Si el cliente no elige, el pedido sale con la disponible más económica.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Producto</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={productId} onChange={(e) => { setProductId(e.target.value); const p = productos.find((x) => String(x.id) === e.target.value); setPrecio(p?.price ? String(p.price) : ""); }}>
              <option value="">Elegí un producto importado de Dropi…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Ciudad</Label><Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ej: Medellín" /></div>
          <div className="space-y-1"><Label>Departamento</Label><Input value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="Ej: Antioquia" /></div>
          <div className="space-y-1"><Label>Precio de venta (unidad)</Label><Input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="space-y-1"><Label>Cantidad</Label><Input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recaudo} onChange={(e) => setRecaudo(e.target.checked)} /> Pago contraentrega</label>
          <Button onClick={cotizar} disabled={cotizando} className="ml-auto">{cotizando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cotizar"}</Button>
        </div>
        {res?.error ? <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{res.error}</AlertDescription></Alert> : null}
        {res?.transportadoras ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {res.ciudad?.nombre}{res.ciudad?.departamento ? `, ${res.ciudad.departamento}` : ""}
              {res.ciudad?.aceptaContraentrega === false ? " · sin contraentrega (pago anticipado)" : res.ciudad?.aceptaContraentrega ? " · acepta contraentrega" : ""}
            </p>
            {res.transportadoras.length === 0 ? <p className="text-sm">Ninguna transportadora cotizó para esa ciudad.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Transportadora</th><th className="py-1 pr-3">Flete</th><th className="py-1 pr-3">Comisión</th><th className="py-1 pr-3">Proveedor</th><th className="py-1">Ganancia</th></tr></thead>
                  <tbody>
                    {res.transportadoras.map((t, i) => (
                      <tr key={t.transportadora + i} className={`border-t ${t.disponible ? "" : "opacity-50"}`}>
                        <td className="py-1.5 pr-3">{t.transportadora}{i === 0 && t.disponible ? <span className="ml-2 text-xs text-emerald-600">más económica</span> : null}{!t.disponible ? <span className="ml-2 text-xs">no disponible</span> : null}</td>
                        <td className="py-1.5 pr-3">{cop(t.flete)}</td>
                        <td className="py-1.5 pr-3">{cop(t.comisionDropi)}</td>
                        <td className="py-1.5 pr-3">{cop(t.alProveedor)}</td>
                        <td className={`py-1.5 font-medium ${t.ganancia != null && t.ganancia < 0 ? "text-destructive" : ""}`}>{cop(t.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function DropiPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [cargando, setCargando] = useState(true);
  const [token, setToken] = useState("");
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; detalle: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Cambiar el token SIN quitar el actual: el servidor prueba el nuevo antes
  // de guardarlo (PUT /dropi/config), así que el que funciona solo se
  // reemplaza si el nuevo también funciona. Antes la única salida era
  // "Quitar token" y, si el nuevo era rechazado, el negocio quedaba sin
  // Dropi (pasó el 29-09-2026 con un token Chatbot Agents atado a otra IP).
  const [cambiando, setCambiando] = useState(false);

  const [q, setQ] = useState("");
  const [conStock, setConStock] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ProductoDropi[]>([]);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  // Catálogo tipo Dropi: filtros, páginas, selección múltiple e importación en lote.
  const [categorias, setCategorias] = useState<Array<{ id: number; name: string }>>([]);
  const [categoria, setCategoria] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [modoPrecio, setModoPrecio] = useState<"sugerido" | "factor">("sugerido");
  const [factor, setFactor] = useState("2.5");
  const [curar, setCurar] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [iniciandoLote, setIniciandoLote] = useState(false);
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
      setToken(""); setPrueba(null); setCambiando(false);
      await cargar();
    } catch (e: any) {
      // El motivo queda a la vista (el aviso flotante se va solo y el
      // mensaje de IP es largo); el token anterior, si había, sigue intacto.
      setPrueba({ ok: false, detalle: `${e.message}${config?.conectado ? " — El token anterior sigue conectado." : ""}` });
      toast({ title: "No se pudo conectar", description: "Mirá el detalle debajo del campo.", variant: "destructive" });
    }
    finally { setGuardando(false); }
  };

  const desconectar = async () => {
    if (!confirm("¿Quitar el token de Dropi? El bot se queda SIN Dropi directo hasta que pegues otro que funcione. Si solo querés reemplazarlo, usá \"Cambiar token\": el actual se mantiene hasta que el nuevo pase la prueba.")) return;
    try { await api("/dropi/config", { method: "DELETE" }); await cargar(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const buscar = async (paginaPedida = 1) => {
    setBuscando(true);
    try {
      const r = await api(`/dropi/buscar?q=${encodeURIComponent(q)}&conStock=${conStock ? 1 : 0}&porPagina=24&pagina=${paginaPedida}${categoria ? `&categoria=${categoria}` : ""}`);
      if (!r.ok) throw new Error(r.error || "Dropi no respondió");
      const nuevos: ProductoDropi[] = r.productos || [];
      setResultados((prev) => (paginaPedida === 1 ? nuevos : [...prev, ...nuevos.filter((n) => !prev.some((p) => p.id === n.id))]));
      setPagina(paginaPedida);
      setHayMas(!!r.hayMas);
      if (paginaPedida === 1) setSeleccion(new Set());
      if (paginaPedida === 1 && !nuevos.length) toast({ title: "Sin resultados en Dropi", description: q ? `Nada para "${q}"` : "Probá con otra palabra o categoría" });
    } catch (e: any) { toast({ title: "Dropi no respondió", description: e.message, variant: "destructive" }); }
    finally { setBuscando(false); }
  };

  // Al conectar: categorías + una primera página para que el catálogo no arranque vacío.
  useEffect(() => {
    if (!config?.conectado) return;
    api("/dropi/categorias").then((r) => setCategorias(r.categorias || [])).catch(() => {});
    if (!resultados.length) void buscar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.conectado]);

  const alternar = (id: number) => setSeleccion((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const seleccionables = resultados.filter((p) => !p.importadoComo);
  const todaLaPaginaSeleccionada = seleccionables.length > 0 && seleccionables.every((p) => seleccion.has(p.id));
  const seleccionarPagina = () => setSeleccion((prev) => {
    const s = new Set(prev);
    if (todaLaPaginaSeleccionada) seleccionables.forEach((p) => s.delete(p.id)); else seleccionables.forEach((p) => s.add(p.id));
    return s;
  });
  const factorNum = modoPrecio === "factor" ? Number(String(factor).replace(",", ".")) : 0;
  const precioDeVenta = (p: ProductoDropi) => Number(precios[p.id]) || (factorNum > 1 ? precioPorFactor(p.costo, factorNum) : null) || p.precioSugerido;

  // Progreso del lote: se consulta al entrar y cada 3 s mientras corre.
  const leerLote = useCallback(async () => {
    try {
      const r = await api("/dropi/importar-lote");
      const l: Lote | null = r.lote || null;
      setLote(l);
      if (l?.importados?.length) {
        const porDropi = new Map(l.importados.map((x) => [x.dropiProductId, x.productId]));
        setResultados((prev) => prev.map((p) => (porDropi.has(p.id) ? { ...p, importadoComo: porDropi.get(p.id)! } : p)));
      }
      return l;
    } catch { return null; }
  }, []);
  useEffect(() => { if (config?.conectado) void leerLote(); }, [config?.conectado, leerLote]);
  useEffect(() => {
    if (lote?.estado !== "en_curso") return;
    const t = setInterval(() => { void leerLote(); }, 3000);
    return () => clearInterval(t);
  }, [lote?.estado, leerLote]);

  const importarSeleccionados = async () => {
    if (!seleccion.size) return;
    if (modoPrecio === "factor" && !(factorNum > 1)) { toast({ title: "Revisá el multiplicador", description: "Tiene que ser mayor que 1 (ej. 2.5 = vender a 2,5 veces el costo).", variant: "destructive" }); return; }
    setIniciandoLote(true);
    try {
      const items = [...seleccion].map((id) => ({ dropiProductId: id, precio: Number(precios[id]) || null }));
      const r = await api("/dropi/importar-lote", { method: "POST", body: JSON.stringify({ items, curar, factorSobreCosto: modoPrecio === "factor" ? factorNum : null }) });
      setLote(r.lote);
      setSeleccion(new Set());
      toast({ title: `Importando ${r.lote.total} productos`, description: "Corre en segundo plano: podés seguir usando el panel. Te aviso por WhatsApp al terminar." });
    } catch (e: any) { toast({ title: "No se pudo empezar la importación", description: e.message, variant: "destructive" }); }
    finally { setIniciandoLote(false); }
  };

  const detenerImportacion = async () => {
    try { await api("/dropi/importar-lote/detener", { method: "POST" }); toast({ title: "Deteniendo", description: "Termina el producto en curso y para. Lo ya importado queda." }); }
    catch (e: any) { toast({ title: "No se pudo detener", description: e.message, variant: "destructive" }); }
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
            <h1 className="text-2xl font-bold flex items-center gap-2"><LogoMarca marca="dropi" className="h-7 w-7" /> Dropi</h1>
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
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setCambiando((v) => !v); setPrueba(null); }}>{cambiando ? "Cancelar" : "Cambiar token"}</Button>
                      <Button variant="ghost" size="sm" onClick={desconectar}>Quitar</Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            {!cargando && (!config?.conectado || cambiando) ? (
              <>
                {config?.conectado ? (
                  <p className="text-sm text-muted-foreground">El token actual sigue funcionando hasta que el nuevo pase la prueba.</p>
                ) : null}
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
                  <Button onClick={() => guardar(false)} disabled={!token.trim() || guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : config?.conectado ? "Probar y reemplazar" : "Guardar y conectar"}</Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {config?.conectado ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Catálogo de Dropi</CardTitle>
                <CardDescription>Explorá el catálogo de los proveedores, marcá los que quieras y traelos todos juntos. La importación corre en segundo plano y te avisa al terminar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="flex gap-2 flex-wrap items-center">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar(1)} placeholder="Buscar: corrector de postura, faja, licuadora…" className="flex-1 min-w-[200px]" />
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm min-w-[160px]" aria-label="Categoría">
                    <option value="">Todas las categorías</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conStock} onChange={(e) => setConStock(e.target.checked)} /> Solo con stock</label>
                  <Button onClick={() => buscar(1)} disabled={buscando}>{buscando && pagina === 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</Button>
                </div>

                {/* Progreso del lote */}
                {lote ? (
                  <div className={`rounded-xl border p-3 space-y-2 ${lote.estado === "en_curso" ? "bg-primary/5" : "bg-muted/40"}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {lote.estado === "en_curso" ? <><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Importando {lote.hechos}/{lote.total}</> : lote.estado === "detenido" ? `Importación detenida: ${lote.hechos}/${lote.total}` : `Importación terminada: ${lote.hechos}/${lote.total}`}
                        <span className="text-muted-foreground font-normal"> · {lote.importados.filter((x) => x.nuevo).length} nuevos{lote.fallidos.length ? ` · ${lote.fallidos.length} con error` : ""}</span>
                      </span>
                      {lote.estado === "en_curso" ? <Button size="sm" variant="outline" onClick={detenerImportacion}>Detener</Button> : null}
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${lote.total ? Math.round((lote.hechos / lote.total) * 100) : 0}%` }} /></div>
                    {lote.estado !== "en_curso" && lote.fallidos.length ? (
                      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver los que fallaron</summary>
                        <ul className="mt-1 space-y-0.5">{lote.fallidos.map((f) => <li key={f.dropiProductId}>#{f.dropiProductId}: {f.error}</li>)}</ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}

                {resultados.length ? (
                  <>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{resultados.length} productos{seleccion.size ? ` · ${seleccion.size} seleccionados` : ""}</span>
                      {seleccionables.length ? <Button size="sm" variant="ghost" onClick={seleccionarPagina}>{todaLaPaginaSeleccionada ? "Quitar selección" : "Seleccionar todos"}</Button> : null}
                    </div>
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      {resultados.map((p) => {
                        const elegido = seleccion.has(p.id);
                        const venta = precioDeVenta(p);
                        const ganancia = venta != null && p.costo != null ? venta - p.costo : null;
                        return (
                          <div
                            key={p.id}
                            onClick={() => !p.importadoComo && alternar(p.id)}
                            className={`relative border rounded-xl p-2 sm:p-3 flex flex-col gap-1.5 bg-background transition ${p.importadoComo ? "opacity-80" : "cursor-pointer hover:shadow-sm"} ${elegido ? "ring-2 ring-primary border-primary" : ""}`}
                          >
                            <div className="relative aspect-square rounded-lg bg-muted overflow-hidden">
                              {p.foto ? <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" loading="lazy" /> : <Package className="h-8 w-8 m-auto mt-[40%] text-muted-foreground" />}
                              {!p.importadoComo ? (
                                <input type="checkbox" checked={elegido} onChange={() => alternar(p.id)} onClick={(e) => e.stopPropagation()} aria-label={`Seleccionar ${p.nombre}`} className="absolute top-2 left-2 h-5 w-5 accent-primary" />
                              ) : (
                                <span className="absolute top-2 left-2 rounded-full bg-green-600 text-white text-[10px] px-2 py-0.5 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> En tu catálogo</span>
                              )}
                              {p.stock != null ? <span className={`absolute bottom-2 right-2 rounded-full text-[10px] px-2 py-0.5 ${p.stock > 0 ? "bg-black/60 text-white" : "bg-red-600 text-white"}`}>Stock {p.stock}</span> : null}
                            </div>
                            <div className="text-xs sm:text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5em]">{p.nombre}</div>
                            <div className="text-[11px] text-muted-foreground">Costo <b className="text-foreground">{cop(p.costo)}</b> · sugerido {cop(p.precioSugerido)}</div>
                            <div className="text-[11px]">
                              Vendés a <b>{cop(venta)}</b>
                              {ganancia != null ? <span className={ganancia > 0 ? "text-green-700" : "text-red-600"}> · ganás {cop(ganancia)} antes de flete</span> : null}
                            </div>
                            {p.proveedor ? <div className="text-[11px] text-muted-foreground truncate">{p.proveedor}{p.bodega ? ` · ${p.bodega}` : ""}</div> : null}
                            {p.importadoComo ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); lanzar(p.importadoComo!); }} disabled={lanzando === p.importadoComo}>{lanzando === p.importadoComo ? <Loader2 className="h-3 w-3 animate-spin" /> : "🚀 Lanzar"}</Button>
                            ) : elegido ? (
                              <Input type="number" inputMode="numeric" onClick={(e) => e.stopPropagation()} placeholder={`Precio propio (${cop(venta)})`} value={precios[p.id] ?? ""} onChange={(e) => setPrecios((prev) => ({ ...prev, [p.id]: e.target.value }))} className="h-7 text-xs" />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {hayMas ? (
                      <div className="flex justify-center"><Button variant="outline" onClick={() => buscar(pagina + 1)} disabled={buscando}>{buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cargar más"}</Button></div>
                    ) : null}
                  </>
                ) : buscando ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Trayendo el catálogo de Dropi…</div>
                ) : null}

                {/* Barra de importación: fija abajo mientras haya selección */}
                {seleccion.size ? (
                  <div className="sticky bottom-2 z-10 rounded-xl border bg-background/95 backdrop-blur shadow-lg p-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold">{seleccion.size} seleccionados</span>
                    <div className="flex items-center gap-2 text-sm">
                      <select value={modoPrecio} onChange={(e) => setModoPrecio(e.target.value as any)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Precio de venta">
                        <option value="sugerido">Precio sugerido de Dropi</option>
                        <option value="factor">Costo × multiplicador</option>
                      </select>
                      {modoPrecio === "factor" ? <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" className="h-9 w-20" aria-label="Multiplicador" /> : null}
                    </div>
                    <label className="flex items-center gap-2 text-sm" title="La IA reescribe nombre, descripción y características para el comprador (usa modelos gratuitos primero). Sin esto queda la descripción del proveedor limpia y es más rápido.">
                      <input type="checkbox" checked={curar} onChange={(e) => setCurar(e.target.checked)} /> Fichas con IA
                    </label>
                    <div className="flex gap-2 ml-auto">
                      <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Set())}>Limpiar</Button>
                      <Button onClick={importarSeleccionados} disabled={iniciandoLote || lote?.estado === "en_curso"}>
                        {iniciandoLote ? <Loader2 className="h-4 w-4 animate-spin" /> : `Importar ${seleccion.size}`}
                      </Button>
                    </div>
                    {lote?.estado === "en_curso" ? <p className="w-full text-xs text-muted-foreground">Hay una importación corriendo: esperá a que termine para empezar otra.</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <CotizadorEnvio />

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
