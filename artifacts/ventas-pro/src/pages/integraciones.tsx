/**
 * Integraciones: conectar y configurar cada plataforma en un solo lugar.
 *
 * Pedido del dueño (01-10-2026): "en qué parte del frontend se puede hacer la
 * autenticación y la configuración de esas integraciones" + "lo mismo con
 * Facebook, que se conecta con el botón".
 *
 *  · Facebook y Mercado Libre: OAuth con un botón.
 *    - Facebook vuelve a /facebook (es la redirect URI registrada en la app de
 *      Meta y esa página canjea el código). Ver lib/facebook-login.ts.
 *    - Mercado Libre: se guardan client_id/secret y el botón va a
 *      /api/integraciones/mercadolibre/autorizar (vuelve solo).
 *  · Shopify, AliExpress, Falabella: credenciales pegadas (no hay OAuth sin
 *    una app aprobada de cada plataforma). Los secretos se cifran en el
 *    servidor y nunca vuelven al navegador.
 */
import { SecretInput } from "@/components/ui/secret-input";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, CircleDashed, Download, PackageSearch, Unplug, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { describeError } from "@/lib/utils";
import { urlLoginFacebook, type ConfigAppFacebook } from "@/lib/facebook-login";
import { TarjetaFacturacion } from "@/components/tarjeta-facturacion";
import { LogoMarca } from "@/components/logo-marca";
import { DatoSensibleInput, ValorOculto } from "@/components/ui/dato-sensible";

type Plataforma = "shopify" | "aliexpress" | "mercadolibre" | "falabella";
interface EstadoIntegracion { conectada: boolean; autorizada: boolean; tienda?: string; activa: boolean; actualizadaEn?: string }

async function api<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${endpoint}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers }, credentials: "include" });
  const raw = await r.text().catch(() => "");
  let j: any = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { j = { error: raw.trim().startsWith("<") ? `El servidor respondió HTML (${r.status}).` : raw.slice(0, 200) }; }
  if (!r.ok || j?.success === false) throw new Error(j?.error || j?.message || `${r.status} ${r.statusText}`);
  return j as T;
}

/** Qué pide cada plataforma. `tienda`/`token`/`secreto` son los nombres que guarda el servidor. */
const CAMPOS: Record<Plataforma, Array<{ clave: "tienda" | "token" | "secreto" | "moneda"; etiqueta: string; ayuda: string; secreto?: boolean; sensible?: boolean; opcional?: boolean }>> = {
  shopify: [
    { clave: "tienda", etiqueta: "Dominio de la tienda", ayuda: "tu-tienda.myshopify.com" },
    { clave: "token", etiqueta: "Token de acceso (Admin API)", ayuda: "shpat_… — Shopify → Configuración → Apps → Desarrollar apps → tu app → Credenciales", secreto: true },
    { clave: "secreto", etiqueta: "Clave secreta de la app (para verificar webhooks)", ayuda: "API secret key de la misma app", secreto: true, opcional: true },
  ],
  mercadolibre: [
    { clave: "tienda", etiqueta: "Client ID (App ID)", ayuda: "developers.mercadolibre.com.co → Mis aplicaciones", sensible: true },
    { clave: "token", etiqueta: "Client Secret", ayuda: "Clave secreta de la misma app", secreto: true },
  ],
  aliexpress: [
    { clave: "tienda", etiqueta: "App Key", ayuda: "AliExpress Open Platform / Portals de afiliados", sensible: true },
    { clave: "token", etiqueta: "App Secret", ayuda: "Clave secreta de la app", secreto: true },
    { clave: "secreto", etiqueta: "Tracking ID (afiliados)", ayuda: "Opcional, para enlaces de afiliado", secreto: true, opcional: true },
  ],
  falabella: [
    { clave: "tienda", etiqueta: "Usuario del Seller Center (email)", ayuda: "El correo con el que entras al Seller Center", sensible: true },
    { clave: "token", etiqueta: "API Key", ayuda: "Seller Center → Mi cuenta → Integraciones → API Key", secreto: true },
  ],
};

const INFO: Record<Plataforma, { titulo: string; descripcion: string; importar: boolean; pedidos: boolean }> = {
  shopify: { titulo: "Shopify", descripcion: "Importa los productos de tu tienda y recibe sus pedidos en VentasPro.", importar: true, pedidos: true },
  mercadolibre: { titulo: "Mercado Libre", descripcion: "Importa tus publicaciones, publica productos de VentasPro y trae tus ventas.", importar: true, pedidos: true },
  aliexpress: { titulo: "AliExpress", descripcion: "Busca productos ordenados por ventas con fotos y video del fabricante (API de afiliados).", importar: true, pedidos: false },
  falabella: { titulo: "Falabella Seller Center", descripcion: "Trae los pedidos de tu tienda en Falabella.", importar: false, pedidos: true },
};

function EstadoBadge({ e, oauth }: { e?: EstadoIntegracion; oauth?: boolean }) {
  if (!e?.conectada) return <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />Sin conectar</Badge>;
  if (oauth && !e.autorizada) return <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700"><CircleDashed className="h-3 w-3" />Falta autorizar</Badge>;
  if (!e.activa) return <Badge variant="outline">Apagada</Badge>;
  return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Conectada</Badge>;
}

function TarjetaPlataforma({ p, estado, recargar }: { p: Plataforma; estado?: EstadoIntegracion; recargar: () => void }) {
  const { toast } = useToast();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(!estado?.conectada);
  const [webhook, setWebhook] = useState<string | null>(null);
  const [consulta, setConsulta] = useState("");
  // Enlace directo: /integraciones?abrir=aliexpress abre ESTA tarjeta y la
  // trae a la vista (08-10: "llévame directo a configurarlo").
  const pedida = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("abrir") === p;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pedida) return;
    setAbierta(true);
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [pedida]);
  const info = INFO[p];
  const oauth = p === "mercadolibre";

  useEffect(() => { if (estado) setAbierta(!estado.conectada || pedida); }, [estado?.conectada]);

  const correr = async (accion: string, fn: () => Promise<void>) => {
    setOcupado(accion);
    try { await fn(); } catch (e: any) {
      toast({ title: `${info.titulo}: no se pudo`, description: describeError(e, "Intenta de nuevo."), variant: "destructive" });
    } finally { setOcupado(null); }
  };

  const guardar = () => correr("guardar", async () => {
    const faltan = CAMPOS[p].filter((c) => !c.opcional && !String(valores[c.clave] || "").trim() && !(estado?.conectada && c.secreto));
    if (faltan.length) throw new Error(`Falta: ${faltan.map((c) => c.etiqueta).join(", ")}`);
    const cuerpo: Record<string, string> = {};
    for (const c of CAMPOS[p]) if (String(valores[c.clave] || "").trim()) cuerpo[c.clave] = valores[c.clave].trim();
    const r: any = await api(`/integraciones/${p}`, { method: "PUT", body: JSON.stringify({ ...cuerpo, activa: true }) });
    setValores({});
    toast({ title: `${info.titulo} guardado`, description: r?.aliexpress
      ? `Claves probadas con AliExpress ✅${r.aliexpress.ejemplo ? ` — ejemplo: «${String(r.aliexpress.ejemplo).slice(0, 60)}» a ${r.aliexpress.precio} ${r.aliexpress.moneda}` : ""}`
      : r?.tienda?.nombre ? `Tienda: ${r.tienda.nombre} (${r.tienda.moneda})` : oauth ? "Ahora toca «Autorizar con Mercado Libre»." : "Credenciales guardadas y cifradas." });
    recargar();
  });

  const autorizarMl = () => { window.location.href = "/api/integraciones/mercadolibre/autorizar"; };

  const importar = () => correr("importar", async () => {
    // AliExpress no es TU tienda: hay que decirle qué buscar. Antes el botón
    // mandaba solo {limite} y el servidor respondía "necesita consulta".
    if (p === "aliexpress" && !consulta.trim()) throw new Error("Escribe qué productos buscar (ej: corrector de postura).");
    const r: any = await api(`/integraciones/${p}/importar`, { method: "POST", body: JSON.stringify({ limite: p === "aliexpress" ? 10 : 50, consulta: consulta.trim() || undefined }) });
    toast({
      title: `${info.titulo}: productos`,
      description: `${r.importados ?? 0} nuevos, ${r.actualizados ?? 0} actualizados${r.errores ? `, ${r.errores} con error` : ""}.`
        + (p === "aliexpress" ? " Quedaron como BORRADOR en Productos: ponles tu precio de venta y actívalos." : ""),
    });
  });

  const pedidos = () => correr("pedidos", async () => {
    const r: any = await api(`/integraciones/${p}/pedidos`, { method: "POST", body: JSON.stringify({ limite: 50 }) });
    toast({ title: `${info.titulo}: pedidos`, description: `${r.creados ?? 0} nuevos${r.repetidos ? `, ${r.repetidos} ya estaban` : ""}${r.errores ? `, ${r.errores} con error` : ""}. Los ves en Pedidos/Dropshipping.` });
  });

  const desconectar = () => correr("desconectar", async () => {
    if (!window.confirm(`¿Desconectar ${info.titulo}? Se borran las credenciales guardadas.`)) return;
    await api(`/integraciones/${p}`, { method: "DELETE" });
    toast({ title: `${info.titulo} desconectado` });
    recargar();
  });

  const verWebhook = () => correr("webhook", async () => {
    const r: any = await api(`/integraciones/${p}/webhook-url`);
    setWebhook(r.url);
  });

  const listo = !!estado?.conectada && (!oauth || estado.autorizada) && estado.activa;

  return (
    <Card ref={ref} className={pedida ? "ring-2 ring-primary scroll-mt-4" : "scroll-mt-4"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border shadow-sm"><LogoMarca marca={p} className="h-7 w-7" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">{info.titulo}</CardTitle>
              <CardDescription>{info.descripcion}</CardDescription>
            </div>
          </div>
          <EstadoBadge e={estado} oauth={oauth} />
        </div>
        {estado?.tienda && <p className="text-xs text-muted-foreground truncate">Cuenta: {CAMPOS[p].some((c) => c.clave === "tienda" && c.sensible) ? <ValorOculto valor={estado.tienda} /> : estado.tienda}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {abierta ? (
          <div className="space-y-3">
            {p === "aliexpress" && <GuiaAliExpress />}
            {CAMPOS[p].map((c) => (
              <div key={c.clave} className="space-y-1">
                <Label htmlFor={`${p}-${c.clave}`}>{c.etiqueta}{c.opcional ? " (opcional)" : ""}</Label>
                {c.secreto ? (
                  <SecretInput
                    id={`${p}-${c.clave}`}
                    guardado={!!estado?.conectada}
                    placeholder={c.ayuda}
                    value={valores[c.clave] || ""}
                    onChange={(nuevo) => setValores((v) => ({ ...v, [c.clave]: nuevo }))}
                  />
                ) : c.sensible ? (
                  <DatoSensibleInput
                    id={`${p}-${c.clave}`}
                    placeholder={c.ayuda}
                    value={valores[c.clave] || ""}
                    onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`${p}-${c.clave}`}
                    type="text"
                    autoComplete="off"
                    placeholder={c.ayuda}
                    value={valores[c.clave] || ""}
                    onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                  />
                )}
                <p className="text-xs text-muted-foreground">{c.ayuda}</p>
              </div>
            ))}
            {oauth && (
              <p className="text-xs text-muted-foreground">
                En tu app de Mercado Libre, la URL de redirección debe ser{" "}
                <code className="break-all">{window.location.origin}/api/integraciones/webhooks/mercadolibre/callback</code>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={guardar} disabled={!!ocupado}>{ocupado === "guardar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar{p === "shopify" || p === "aliexpress" ? " y probar" : ""}</Button>
              {estado?.conectada && <Button variant="ghost" onClick={() => setAbierta(false)}>Cancelar</Button>}
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAbierta(true)}>Cambiar credenciales</Button>
        )}

        {oauth && estado?.conectada && (
          <Button onClick={autorizarMl} className="w-full sm:w-auto bg-yellow-400 text-black hover:bg-yellow-300">
            {estado.autorizada ? "Volver a autorizar con Mercado Libre" : "Autorizar con Mercado Libre"}
          </Button>
        )}

        {listo && p === "aliexpress" && (
          <div className="space-y-1 border-t pt-4">
            <Label htmlFor="ali-consulta">¿Qué productos buscar?</Label>
            <Input id="ali-consulta" placeholder="Ej: corrector de postura" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
            <p className="text-xs text-muted-foreground">Trae los 10 que más se venden, con fotos y video del fabricante. Entran como borrador con el costo del proveedor.</p>
          </div>
        )}
        {listo && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {info.importar && (
              <Button variant="secondary" onClick={importar} disabled={!!ocupado}>
                {ocupado === "importar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-2 h-4 w-4" />}Importar productos
              </Button>
            )}
            {info.pedidos && (
              <Button variant="secondary" onClick={pedidos} disabled={!!ocupado}>
                {ocupado === "pedidos" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Traer pedidos
              </Button>
            )}
            {(p === "shopify" || p === "mercadolibre") && (
              <Button variant="ghost" onClick={verWebhook} disabled={!!ocupado}>Ver URL de notificaciones</Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={desconectar} disabled={!!ocupado}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>
          </div>
        )}

        {webhook && (
          <div className="rounded-md bg-muted p-3 text-xs space-y-2">
            <p>{p === "shopify" ? "Pégala en Shopify → Configuración → Notificaciones → Webhooks → «Creación de pedido» (formato JSON)." : "Pégala en tu app de Mercado Libre → Notificaciones, tema «orders_v2»."}</p>
            <div className="flex items-center gap-2">
              <code className="break-all flex-1">{webhook}</code>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(webhook); toast({ title: "Copiada" }); }}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Cómo sacar las claves de AliExpress, paso a paso, con los enlaces reales. */
function GuiaAliExpress() {
  return (
    <ol className="rounded-md bg-muted p-3 text-xs space-y-1.5 list-decimal list-inside">
      <li>Regístrate gratis como afiliado en <a className="underline" href="https://portals.aliexpress.com" target="_blank" rel="noopener noreferrer">portals.aliexpress.com</a> (con tu cuenta de AliExpress).</li>
      <li>Entra a <a className="underline" href="https://openservice.aliexpress.com" target="_blank" rel="noopener noreferrer">openservice.aliexpress.com</a> → <b>App Console</b> → <b>Create App</b> → tipo <b>Affiliates</b> (afiliados). Completa los datos y envíala.</li>
      <li>Cuando la aprueben (suele tardar 1–3 días), abre la app y copia <b>App Key</b> y <b>App Secret</b> aquí abajo.</li>
      <li>Opcional: en Portals → <b>Tracking ID</b>, crea uno para ganar comisión por los enlaces.</li>
      <li>Toca <b>Guardar y probar</b>: VentasPro hace una búsqueda real y solo guarda si AliExpress acepta las claves.</li>
    </ol>
  );
}

function TarjetaCanva() {
  const [estado, setEstado] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(() => {
    fetch("/api/canva/estado", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(j => setEstado(j?.canva || null))
      .catch(() => setEstado(null))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  // aviso tras volver del OAuth
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("canva") === "conectado") {
      recargar();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [recargar]);
  const conectada = !!estado?.conectado;
  const deshabilitado = !estado?.enabled;
  const probar = async () => {
    try {
      const r = await fetch("/api/canva/probar", { method: "POST", credentials: "include" });
      const j = await r.json().catch(()=>({}));
      if (r.ok) {
        const nombre = j?.perfil?.display_name || j?.perfil?.name || "tu cuenta";
        const caps = Array.isArray(j?.capacidades) ? j.capacidades.join(", ") : (j?.capacidades?.features ? JSON.stringify(j.capacidades.features) : "");
        alert(`Canva conectado ✅ — ${nombre}.\nFunciones disponibles: ${caps || "ver detalle en consola"}`);
      }
      else alert("Canva no conectado: " + (j.error || r.status));
    } catch(e:any){ alert("Error: " + (e?.message||e)); }
  };
  const desconectar = async () => {
    if (!confirm("¿Desconectar Canva? Se borra el token.")) return;
    await fetch("/api/canva/desconectar", { method: "DELETE", credentials: "include" });
    recargar();
  };
  return (
    <Card className={estado?.conectado ? "ring-1 ring-emerald-200" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#00C4CC] text-white font-black text-sm ring-1 ring-border shadow-sm">Ca</span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Canva Connect</CardTitle>
              <CardDescription>Usa tus diseños y plantillas de Canva para las fotos de tus productos y anuncios.</CardDescription>
              <p className="mt-1 text-xs text-muted-foreground">Permisos: ver y crear diseños, listar tu catálogo de diseños, subir archivos, leer plantillas de marca y perfil.</p>
            </div>
          </div>
          {cargando ? <Badge variant="outline">Cargando</Badge> : conectada ? <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Conectada</Badge> : deshabilitado ? <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />Deshabilitado</Badge> : <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />Sin conectar</Badge>}
        </div>
        {estado?.motivo && <p className="text-xs text-muted-foreground">{estado.motivo}</p>}
        {estado?.limitaciones && <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">⚠️ {estado.limitaciones}</p>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => window.location.href = "/api/canva/auth"} disabled={deshabilitado} className="bg-[#00C4CC] hover:bg-[#00b3bb] text-white">
          {conectada ? "Reconectar con Canva" : "Conectar con Canva"}
        </Button>
        {conectada && <><Button variant="outline" onClick={probar}>Probar conexión</Button><Button variant="ghost" className="text-destructive" onClick={desconectar}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button></>}
        {deshabilitado && <p className="w-full text-xs text-muted-foreground">Activa en el servidor: CANVA_ENABLED=true + CANVA_CLIENT_ID/SECRET + CANVA_REDIRECT_URI=https://ventasproia.com/api/canva/callback. FFmpeg local sigue funcionando sin Canva.</p>}
      </CardContent>
    </Card>
  );
}

function TarjetaFacebook() {
  const [cfg, setCfg] = useState<ConfigAppFacebook>({ appId: null, enabled: false });
  const [estado, setEstado] = useState<{ hasToken?: boolean; pageId?: string; adAccountId?: string } | null>(null);
  useEffect(() => {
    api<ConfigAppFacebook>("/public/fb-app-config").then(setCfg).catch(() => setCfg({ appId: null, enabled: false }));
    api<any>("/facebook/config").then(setEstado).catch(() => setEstado(null));
  }, []);
  const conectada = !!estado?.hasToken && !!estado?.pageId;
  // Vuelve a /facebook: es la redirect URI registrada y esa página canjea el código.
  const url = urlLoginFacebook(cfg, `${window.location.origin}/facebook`);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border shadow-sm"><LogoMarca marca="meta" className="h-7 w-7" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Facebook e Instagram</CardTitle>
              <CardDescription>Página, Messenger, anuncios y catálogo de Meta.</CardDescription>
              <div className="mt-2 flex gap-1.5"><LogoMarca marca="facebook" className="h-4 w-4" /><LogoMarca marca="messenger" className="h-4 w-4" /><LogoMarca marca="instagram" className="h-4 w-4" /></div>
            </div>
          </div>
          {conectada
            ? <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Conectada</Badge>
            : <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />Sin conectar</Badge>}
        </div>
        {conectada && <p className="text-xs text-muted-foreground">Página <ValorOculto valor={estado?.pageId} />{estado?.adAccountId ? <> · cuenta publicitaria <ValorOculto valor={estado.adAccountId} /></> : " · falta elegir la cuenta publicitaria"}</p>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")} disabled={!cfg.enabled || !url} className="bg-[#1877F2] hover:bg-[#166FE5]">
          {conectada ? "Reconectar con Facebook" : "Conectar con Facebook"}
        </Button>
        <Button variant="outline" asChild><Link href="/facebook">Configuración de Facebook <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
        {!cfg.enabled && <p className="w-full text-xs text-muted-foreground">El login con Facebook no está habilitado en el servidor (FB_APP_ID, FB_APP_SECRET y FB_CONNECT_ENABLED=true).</p>}
      </CardContent>
    </Card>
  );
}

export default function IntegracionesPage() {
  const [estado, setEstado] = useState<Record<string, EstadoIntegracion>>({});
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(() => {
    api<{ integraciones: Record<string, EstadoIntegracion> }>("/integraciones/estado")
      .then((r) => setEstado(r.integraciones || {}))
      .catch(() => setEstado({}))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { recargar(); }, [recargar]);

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">Integraciones</h1>
          <p className="text-muted-foreground">Conecta tus tiendas, marketplaces y proveedores. Las claves se guardan cifradas y nunca vuelven al navegador.</p>
        </div>
        {cargando ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <TarjetaCanva />
            <TarjetaFacebook />
            <TarjetaFacturacion />
            {(["shopify", "mercadolibre", "aliexpress", "falabella"] as Plataforma[]).map((p) => (
              <TarjetaPlataforma key={p} p={p} estado={estado[p]} recargar={recargar} />
            ))}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">WooCommerce y Dropi</CardTitle>
                <CardDescription>Ya tienen su propia página de configuración.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" asChild><Link href="/woocommerce"><LogoMarca marca="woocommerce" className="mr-2 h-5 w-5" />WooCommerce</Link></Button>
                <Button variant="outline" asChild><Link href="/dropi"><LogoMarca marca="dropi" className="mr-2 h-5 w-5" />Dropi</Link></Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
