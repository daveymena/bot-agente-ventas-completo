import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Telegram como canal de avisos: pedidos, rechazos de Dropi, lanzamientos,
 * auditorías e informes llegan también por acá (además de WhatsApp).
 */
const api = async (endpoint: string, options: RequestInit = {}) => {
  const r = await fetch(`/api${endpoint}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.detalle || j.message || `Error ${r.status}`);
  return j;
};

export function TelegramCredentials() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<{ conectado: boolean; bot?: string | null; chatId?: string | null; atlasEscucha?: boolean } | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<Array<{ chatId: string; nombre: string; ultimoTexto: string }>>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => { try { setCfg(await api("/telegram/config")); } catch { setCfg({ conectado: false }); } }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const descubrir = async () => {
    setOcupado("descubrir");
    try {
      const r = await api("/telegram/descubrir", { method: "POST", body: JSON.stringify({ token }) });
      setChats(r.chats || []);
      if (!r.chats?.length) toast({ title: "Aún no veo mensajes", description: `Escribile "hola" al bot ${r.bot || ""} en Telegram y volvé a intentar.` });
      else if (r.chats.length === 1) setChatId(r.chats[0].chatId);
    } catch (e: any) { toast({ title: "No se pudo leer el bot", description: e.message, variant: "destructive" }); }
    finally { setOcupado(null); }
  };

  const guardar = async () => {
    setOcupado("guardar");
    try {
      // fetch propio (y no `api`) para poder leer `chats` del error: si el chat
      // id no es el del bot, el backend devuelve los que sí le escribieron y
      // acá se muestran de una, con un clic, sin tener que adivinar ids.
      const res = await fetch("/api/telegram/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, chatId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(j.chats) && j.chats.length) setChats(j.chats);
        toast({ title: "No se pudo conectar", description: j.error || `Error ${res.status}`, variant: "destructive" });
        return;
      }
      toast({ title: "Telegram conectado", description: j.detalle || "Te mandé un mensaje de prueba." });
      setToken(""); setChatId(""); setChats([]);
      await cargar();
    } catch (e: any) { toast({ title: "No se pudo conectar", description: e.message, variant: "destructive" }); }
    finally { setOcupado(null); }
  };

  const probar = async () => {
    setOcupado("probar");
    try { const r = await api("/telegram/probar", { method: "POST" }); toast({ title: r.ok ? "Mensaje enviado" : "No se pudo enviar", description: r.detalle || r.error, variant: r.ok ? "default" : "destructive" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setOcupado(null); }
  };

  const quitar = async () => {
    if (!confirm("¿Quitar Telegram? Los avisos seguirán solo por WhatsApp.")) return;
    try { await api("/telegram/config", { method: "DELETE" }); await cargar(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Telegram (avisos)</CardTitle>
        <CardDescription>Pedidos, rechazos de Dropi, lanzamientos, auditorías e informes te llegan también por Telegram, y si le escribís al bot (texto o nota de voz) te contesta Atlas. Creá un bot con @BotFather, pegá el token, escribile "hola" al bot y elegí tu chat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cfg?.conectado ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span><b>Conectado</b>{cfg.bot ? ` · ${cfg.bot}` : ""}{cfg.chatId ? ` · chat ${cfg.chatId}` : ""}{cfg.atlasEscucha ? " · Atlas responde por acá 💬" : ""}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={probar} disabled={ocupado === "probar"}>{ocupado === "probar" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar prueba"}</Button>
                <Button size="sm" variant="outline" onClick={quitar}>Quitar</Button>
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="tg-token">Token del bot</Label>
              <Input id="tg-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAH…" autoComplete="off" />
            </div>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label htmlFor="tg-chat">Chat ID</Label>
                <Input id="tg-chat" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Ej: 123456789 o -100…" autoComplete="off" />
              </div>
              <Button variant="outline" onClick={descubrir} disabled={!token.trim() || ocupado === "descubrir"}>{ocupado === "descubrir" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Detectar mi chat"}</Button>
              <Button onClick={guardar} disabled={!token.trim() || !chatId.trim() || ocupado === "guardar"}>{ocupado === "guardar" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar y probar"}</Button>
            </div>
            {chats.length >= 1 ? (
              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">Chats que le escribieron al bot:</p>
                {chats.map((c) => <button key={c.chatId} type="button" className="block text-left underline" onClick={() => setChatId(c.chatId)}>{c.nombre} · {c.chatId}{c.ultimoTexto ? ` · "${c.ultimoTexto}"` : ""}</button>)}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
