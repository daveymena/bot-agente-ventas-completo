import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Facebook, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { LogoMarca } from "@/components/logo-marca";

interface Estado {
  propias: boolean;
  configurado: boolean;
  accessToken: string;
  pageId: string;
  adAccountId: string;
  pixelId: string;
  catalogId: string;
  appId: string;
  appSecret: string;
  messengerPageToken: string;
  messengerVerifyToken: string;
  pageName: string;
  tasks: string[];
}

type Prueba = { ok: boolean; detalle: string; page?: { id: string; name: string; tasks?: string[] } } | null;

export function FacebookCredentials() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [fbToken, setFbToken] = useState("");
  const [verToken, setVerToken] = useState(false);
  const [pruebaToken, setPruebaToken] = useState<Prueba>(null);
  const [probandoToken, setProbandoToken] = useState(false);

  const [pageId, setPageId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verAppSecret, setVerAppSecret] = useState(false);
  const [messengerToken, setMessengerToken] = useState("");
  const [verMessenger, setVerMessenger] = useState(false);
  const [messengerVerify, setMessengerVerify] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch("/api/facebook/credentials", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: Estado = await res.json();
      setEstado(data);
      setPageId(data.pageId);
      setAdAccountId(data.adAccountId);
      setPixelId(data.pixelId);
      setCatalogId(data.catalogId);
      setAppId(data.appId);
    } catch {
      toast.error("No se pudo cargar la configuración de Facebook");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const probar = async () => {
    setProbandoToken(true);
    setPruebaToken(null);
    try {
      const body: any = {};
      if (fbToken) body.accessToken = fbToken;
      const pageIdVal = pageId.trim();
      if (pageIdVal) body.pageId = pageIdVal;
      const res = await fetch("/api/facebook/credentials/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPruebaToken(await res.json());
    } catch {
      setPruebaToken({ ok: false, detalle: "No se pudo hacer la prueba" });
    } finally {
      setProbandoToken(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/facebook/credentials", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(fbToken ? { accessToken: fbToken } : {}),
          pageId: pageId || undefined,
          adAccountId: adAccountId || undefined,
          pixelId: pixelId || undefined,
          catalogId: catalogId || undefined,
          appId: appId || undefined,
          ...(appSecret ? { appSecret } : {}),
          messengerPageToken: messengerToken || undefined,
          messengerVerifyToken: messengerVerify || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Credenciales de Facebook guardadas");
      setFbToken("");
      setAppSecret("");
      setMessengerToken("");
      await cargar();
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Card className="rounded-3xl border-0 shadow-lg glass-panel md:col-span-2">
        <CardContent className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader className="h-4 w-4 animate-spin" /> Cargando configuración de Facebook…
        </CardContent>
      </Card>
    );
  }

  const Resultado = ({ p }: { p: Prueba }) =>
    !p ? null : (
      <p className={`text-xs flex items-start gap-1.5 ${p.ok ? "text-emerald-600" : "text-red-500"}`}>
        {p.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
        {p.detalle}
      </p>
    );

  return (
    <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500" />
      <CardHeader className="pt-8">
        <CardTitle className="text-xl flex items-center gap-2">
          <div className="p-2 bg-white ring-1 ring-border rounded-lg"><LogoMarca marca="facebook" className="h-5 w-5" /></div>
          Facebook — tu cuenta
        </CardTitle>
        <CardDescription>
          Acá van <strong>tus</strong> credenciales de Facebook: página, cuenta de anuncios, catálogo, pixel y app.
          Tus anuncios y catálogo usarán TU cuenta, no la del servidor.
          Se guardan cifradas y nunca se muestran de nuevo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {!estado?.propias && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700">Todavía no conectaste tu Facebook</p>
              <p className="text-amber-700/80 mt-0.5">
                Mientras tanto los anuncios y el catálogo usan la cuenta del servidor —
                <strong>el gasto y los leads no son tuyos</strong>. Cargá al menos el token y la página.
              </p>
            </div>
          </div>
        )}

        {/* ── Access Token ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">Access Token de Página</h3>
              {estado?.configurado
                ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              Token de página (Largo) {estado?.accessToken && <span className="normal-case font-normal tracking-normal">· guardado: {estado.accessToken}</span>}
            </Label>
            <div className="relative">
              <Input
                type={verToken ? "text" : "password"}
                value={fbToken}
                onChange={e => { setFbToken(e.target.value); setPruebaToken(null); }}
                placeholder={estado?.accessToken ? "Dejalo vacío para no cambiarlo" : "EAA..."}
                className="font-mono text-sm bg-muted/30 pr-11"
                autoComplete="off"
              />
              <button type="button" onClick={() => setVerToken(v => !v)}
                aria-label={verToken ? "Ocultar" : "Mostrar"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sacalo de Facebook Developers → Herramientas → Access Token Debugger o desde tu app.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={probar} disabled={probandoToken}>
                {probandoToken ? <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Probando…</> : "Probar conexión"}
              </Button>
              <Resultado p={pruebaToken} />
            </div>
          </div>
        </div>

        {/* ── Page ID ── */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Page ID</Label>
            <Input value={pageId} onChange={e => { setPageId(e.target.value); setPruebaToken(null); }}
              placeholder="123456789012345" className="font-mono text-sm bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">El ID numérico de tu página de Facebook.</p>
          </div>
        </div>

        {/* ── Ad Account, Pixel, Catalog, App ── */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50">
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Ad Account ID</Label>
            <Input value={adAccountId} onChange={e => { setAdAccountId(e.target.value); setPruebaToken(null); }}
              placeholder="act_1234567890" className="font-mono text-sm bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">ID de tu cuenta de anuncios (formato act_...).</p>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Pixel ID</Label>
            <Input value={pixelId} onChange={e => { setPixelId(e.target.value); setPruebaToken(null); }}
              placeholder="1234567890123456" className="font-mono text-sm bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">ID del Facebook Pixel para tracking.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Catalog ID</Label>
            <Input value={catalogId} onChange={e => { setCatalogId(e.target.value); setPruebaToken(null); }}
              placeholder="1234567890123456" className="font-mono text-sm bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">ID de tu catálogo de productos en Commerce Manager.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">App ID</Label>
            <Input value={appId} onChange={e => { setAppId(e.target.value); setPruebaToken(null); }}
              placeholder="123456789012345" className="font-mono text-sm bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">App ID de tu app en Facebook Developers.</p>
          </div>
        </div>

        {/* ── App Secret + Messenger ── */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50">
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              App Secret {estado?.appSecret && <span className="normal-case font-normal tracking-normal">· guardado: {estado.appSecret}</span>}
            </Label>
            <div className="relative">
              <Input
                type={verAppSecret ? "text" : "password"}
                value={appSecret}
                onChange={e => { setAppSecret(e.target.value); setPruebaToken(null); }}
                placeholder={estado?.appSecret ? "Dejalo vacío para no cambiarlo" : "..."}
                className="font-mono text-sm bg-muted/30 pr-11"
                autoComplete="off"
              />
              <button type="button" onClick={() => setVerAppSecret(v => !v)}
                aria-label={verAppSecret ? "Ocultar" : "Mostrar"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verAppSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">App Secret de tu app en Facebook Developers → Configuración → Básica.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              Messenger Page Token {estado?.messengerPageToken && <span className="normal-case font-normal tracking-normal">· guardado: {estado.messengerPageToken}</span>}
            </Label>
            <div className="relative">
              <Input
                type={verMessenger ? "text" : "password"}
                value={messengerToken}
                onChange={e => { setMessengerToken(e.target.value); setPruebaToken(null); }}
                placeholder={estado?.messengerPageToken ? "Dejalo vacío para no cambiarlo" : "EAA..."}
                className="font-mono text-sm bg-muted/30 pr-11"
                autoComplete="off"
              />
              <button type="button" onClick={() => setVerMessenger(v => !v)}
                aria-label={verMessenger ? "Ocultar" : "Mostrar"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verMessenger ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Token de página para Messenger (puede ser el mismo que Access Token).</p>
          </div>
        </div>

        {/* ── Messenger Verify Token ── */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Messenger Verify Token</Label>
            <Input value={messengerVerify} onChange={e => { setMessengerVerify(e.target.value); setPruebaToken(null); }}
              placeholder="ventaspro_webhook_verify_2026" className="bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">Token de verificación para el webhook de Messenger (lo ponés en Facebook Developers → Webhooks).</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Se guardan cifradas y nunca se muestran de nuevo.
          </p>
          <Button onClick={guardar} disabled={guardando} className="font-bold">
            {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "Guardar credenciales"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
