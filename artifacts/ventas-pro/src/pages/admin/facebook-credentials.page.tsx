import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Facebook, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff } from "lucide-react";

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
}

type Prueba = { ok: boolean; detalle: string } | null;

export default function FacebookCredentialsPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [accessToken, setAccessToken] = useState("");
  const [verAccess, setVerAccess] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verSecret, setVerSecret] = useState(false);
  const [pageId, setPageId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [messengerPageToken, setMessengerPageToken] = useState("");
  const [verMessenger, setVerMessenger] = useState(false);
  const [messengerVerifyToken, setMessengerVerifyToken] = useState("");

  const [prueba, setPrueba] = useState<Prueba>(null);
  const [probando, setProbando] = useState(false);

  const cargar = async () => {
    try {
      const res = await fetch("/api/facebook/credentials", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: Estado = await res.json();
      setEstado(data);
      setAppId(data.appId || "");
      setPageId(data.pageId || "");
      setAdAccountId(data.adAccountId || "");
      setPixelId(data.pixelId || "");
      setCatalogId(data.catalogId || "");
      setMessengerVerifyToken(data.messengerVerifyToken || "");
    } catch {
      toast.error("No se pudo cargar la configuración de Facebook");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const body: any = {};
      if (accessToken) body.accessToken = accessToken;
      if (pageId) body.pageId = pageId;

      const res = await fetch("/api/facebook/credentials/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPrueba(await res.json());
    } catch {
      setPrueba({ ok: false, detalle: "No se pudo hacer la prueba" });
    } finally {
      setProbando(false);
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
          ...(accessToken ? { accessToken } : {}),
          ...(appSecret ? { appSecret } : {}),
          ...(appId ? { appId } : {}),
          ...(pageId ? { pageId } : {}),
          ...(adAccountId ? { adAccountId } : {}),
          ...(pixelId ? { pixelId } : {}),
          ...(catalogId ? { catalogId } : {}),
          ...(messengerPageToken ? { messengerPageToken } : {}),
          messengerVerifyToken,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Credenciales de Facebook guardadas ✓");
      setAccessToken("");
      setAppSecret("");
      setMessengerPageToken("");
      await cargar();
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando configuración de Facebook…</p>
        </div>
      </div>
    );
  }

  const Resultado = ({ p }: { p: Prueba }) =>
    !p ? null : (
      <p className={`text-xs flex items-start gap-1.5 ${p.ok ? "text-blue-400" : "text-red-500"}`}>
        {p.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
        {p.detalle}
      </p>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="rounded-3xl border-0 shadow-2xl glass-panel overflow-hidden relative">
          <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-500 to-cyan-500" />
          <CardHeader className="pt-8">
            <CardTitle className="text-3xl flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500"><Facebook className="h-6 w-6" /></div>
              Facebook & Anuncios
            </CardTitle>
            <CardDescription className="text-base">
              Conecta tu cuenta de Facebook para anuncios, catálogo, Messenger y análisis
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 pb-8">
            {!estado?.propias && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700">⚠️ Credenciales no configuradas</p>
                  <p className="text-amber-700/80 text-sm">Los anuncios están usando la cuenta del servidor. Configura las tuyas para anunciar con tu propia cuenta.</p>
                </div>
              </div>
            )}

            {/* Credenciales Principales */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-bold text-lg">Credenciales Principales</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">App ID</Label>
                  <Input value={appId} onChange={e => setAppId(e.target.value)} placeholder="1234567890" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">App Secret</Label>
                  <div className="relative mt-1">
                    <Input type={verSecret ? "text" : "password"} value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="abc123..." className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                    <button type="button" onClick={() => setVerSecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {verSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Access Token */}
            <div className="space-y-3 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <Label className="text-xs font-semibold uppercase tracking-wider block">Access Token (Page Token)</Label>
              <div className="relative">
                <Input type={verAccess ? "text" : "password"} value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAAB..." className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                <button type="button" onClick={() => setVerAccess(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {verAccess ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={probar} disabled={probando}>
                  {probando ? <><Loader className="h-3 w-3 mr-1 animate-spin" /> Probando…</> : "Probar"}
                </Button>
                <Resultado p={prueba} />
              </div>
            </div>

            {/* IDs de Negocio */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-bold text-lg">IDs de Negocio</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Page ID</Label>
                  <Input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="1234567890" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Ad Account ID</Label>
                  <Input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} placeholder="act_1234567890" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Pixel ID</Label>
                  <Input value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="1234567890" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Catalog ID</Label>
                  <Input value={catalogId} onChange={e => setCatalogId(e.target.value)} placeholder="1234567890" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
              </div>
            </div>

            {/* Messenger */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-bold text-lg">Messenger</h3>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider block">Messenger Page Token</Label>
                <div className="relative mt-1">
                  <Input type={verMessenger ? "text" : "password"} value={messengerPageToken} onChange={e => setMessengerPageToken(e.target.value)} placeholder="EAAB..." className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                  <button type="button" onClick={() => setVerMessenger(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                    {verMessenger ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider block">Messenger Verify Token</Label>
                <Input value={messengerVerifyToken} onChange={e => setMessengerVerifyToken(e.target.value)} placeholder="mi_verify_token_secreto" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                <p className="text-xs text-slate-400 mt-1">Token para verificar webhooks (texto plano)</p>
              </div>
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
              <Button onClick={guardar} disabled={guardando} className="bg-blue-600 hover:bg-blue-700">
                {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "💾 Guardar Cambios"}
              </Button>
              {estado?.configurado && <Badge className="bg-blue-500/10 text-blue-400">Configurado</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
