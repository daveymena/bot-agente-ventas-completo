import { 
  useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey,
  useConnectWhatsApp,
  useDisconnectWhatsApp
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QrCode, Smartphone, RefreshCw, PowerOff, ShieldCheck, AlertCircle, Phone, RotateCcw, Trash2, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("whatsapp-connect")!;

export default function WhatsAppConnection() {
  useAutoTour(HELP_GUIDE);
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);
  const [showPairForm, setShowPairForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const handleRequestPairingCode = async () => {
    const digits = phoneNumber.replace(/[^\d]/g, "");
    if (digits.length < 8) {
      setPairError("Ingresa el número completo con código de país (ej: 573001234567)");
      return;
    }
    setIsPairing(true);
    setPairError(null);
    setPairingCode(null);
    try {
      const res = await fetch("/api/whatsapp/pair-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo generar el código");
      setPairingCode(data.pairingCode);
      queryClient.invalidateQueries({ queryKey: getGetWhatsAppStatusQueryKey() });
    } catch (e: any) {
      setPairError(e.message || "Error al pedir el código de vinculación");
    } finally {
      setIsPairing(false);
    }
  };

  const { data: status, isLoading } = useGetWhatsAppStatus({
    // react-query v4: refetchInterval recibe (data, query) — el primer arg es la data ya,
    // no un objeto con .state. Antes se llamaba a `query.state.data` sobre `data` undefined
    // y explotaba con "Cannot read properties of undefined (reading 'state')" en el primer
    // render, dejando la página en blanco.
    query: {
      refetchInterval: (data: any) => (data?.state === 'connected' ? 10000 : 2000),
      queryKey: getGetWhatsAppStatusQueryKey(),
    },
  });

  const connectMutation = useConnectWhatsApp();
  const disconnectMutation = useDisconnectWhatsApp();

  const handleConnect = () => {
    connectMutation.mutate(undefined, {
      onSuccess: () => {
        toast.info("Iniciando conexión...");
        queryClient.invalidateQueries({ queryKey: getGetWhatsAppStatusQueryKey() });
      },
      onError: () => toast.error("Error al iniciar conexión")
    });
  };

  const handleDisconnect = () => {
    if(!confirm("¿Seguro que deseas desconectar WhatsApp? Los agentes dejarán de responder.")) return;
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("WhatsApp desconectado");
        queryClient.invalidateQueries({ queryKey: getGetWhatsAppStatusQueryKey() });
      },
      onError: () => toast.error("Error al desconectar")
    });
  };

  const handleResetSession = async () => {
    if(!confirm("¿Resetear la sesión? Esto borrará la sesión guardada y generará un nuevo QR.")) return;
    setIsResetting(true);
    try {
      const res = await fetch("/api/whatsapp/reset-session", { method: "POST" });
      if (!res.ok) throw new Error("Error del servidor");
      toast.success("Sesión reseteada — escanea el nuevo QR");
      queryClient.invalidateQueries({ queryKey: getGetWhatsAppStatusQueryKey() });
    } catch {
      toast.error("No se pudo resetear la sesión");
    } finally {
      setIsResetting(false);
    }
  };

  const renderState = () => {
    if (isLoading) {
      return (
        <Card className="max-w-md mx-auto w-full mt-10 rounded-3xl overflow-hidden glass-panel border-0 shadow-lg">
          <CardHeader><Skeleton className="h-8 w-1/2 mx-auto mb-2" /><Skeleton className="h-4 w-3/4 mx-auto" /></CardHeader>
          <CardContent className="flex justify-center py-10"><Skeleton className="h-64 w-64 rounded-2xl" /></CardContent>
        </Card>
      );
    }

    if (!status || status.state === 'disconnected') {
      return (
        <Card key="disconnected" className="max-w-md mx-auto w-full mt-10 text-center rounded-3xl overflow-hidden glass-panel border-0 shadow-lg relative">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          <CardHeader className="relative z-10 pt-10">
            <CardTitle className="text-3xl font-bold tracking-tight">Conectar WhatsApp</CardTitle>
            <CardDescription className="text-base mt-2">Vincula tu número de WhatsApp para que los agentes IA puedan empezar a responder mensajes.</CardDescription>
          </CardHeader>
          <CardContent className="py-8 relative z-10">
            <div className="mx-auto bg-muted/50 rounded-full w-28 h-28 flex items-center justify-center mb-8 border border-border/50 shadow-inner">
              <Smartphone className="h-12 w-12 text-muted-foreground" />
            </div>
            {status?.lastError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-3 mb-4 text-left">
                <p className="text-xs font-mono text-destructive break-words">{status.lastError}</p>
              </div>
            )}
            {!showPairForm ? (
              <div className="w-full flex flex-col gap-3">
                <Button data-tour="whatsapp-qr-button" size="lg" className="w-full text-base h-14 rounded-xl shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]" onClick={handleConnect} disabled={connectMutation.isPending}>
                  {connectMutation.isPending ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <QrCode className="mr-2 h-5 w-5" />}
                  Generar código QR
                </Button>
                <Button data-tour="whatsapp-pin-toggle" variant="ghost" className="w-full text-muted-foreground rounded-xl" onClick={() => setShowPairForm(true)}>
                  <KeyRound className="h-4 w-4 mr-2" /> ¿El QR no carga? Usar código PIN
                </Button>
              </div>
            ) : (
              <div className="text-left">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Número con código de país</label>
                <Input
                  placeholder="Ej: 573001234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isPairing}
                  className="h-12 rounded-xl mb-3"
                />
                {pairError && <p className="text-sm text-destructive mb-3">{pairError}</p>}
                {pairingCode ? (
                  <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tu código de vinculación:</p>
                    <p className="text-2xl font-bold tracking-widest">{pairingCode}</p>
                    <p className="text-xs text-muted-foreground mt-2">En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular con número de teléfono</p>
                  </div>
                ) : (
                  <Button className="w-full h-12 rounded-xl mb-3" onClick={handleRequestPairingCode} disabled={isPairing}>
                    {isPairing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Obtener código
                  </Button>
                )}
                <Button variant="ghost" className="w-full text-muted-foreground rounded-xl" onClick={() => { setShowPairForm(false); setPairingCode(null); setPairError(null); }}>
                  Volver al código QR
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    const qrCode = status.qrCode || (status as any).qrDataUrl || null;

    if (status.state === 'connecting' && !qrCode) {
      // If we have a pairing code, we shouldn't hide it with the connecting spinner!
      if (pairingCode) {
        return (
          <Card key="pairing" className="max-w-md mx-auto w-full mt-10 text-center rounded-3xl overflow-hidden glass-panel border-0 shadow-lg">
            <CardHeader className="pt-10">
              <CardTitle className="text-3xl font-bold tracking-tight">Vincular con código PIN</CardTitle>
              <CardDescription className="text-base mt-2">Ingresa este código en tu celular.</CardDescription>
            </CardHeader>
            <CardContent className="py-8">
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 mb-3 text-center">
                <p className="text-sm text-muted-foreground mb-3">Tu código de vinculación:</p>
                <p className="text-4xl font-black tracking-widest text-primary">{pairingCode}</p>
                <p className="text-sm text-muted-foreground mt-4">En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular con número de teléfono</p>
              </div>
              <Button variant="ghost" className="w-full text-muted-foreground rounded-xl" onClick={handleResetSession} disabled={isResetting}>
                Cancelar
              </Button>
            </CardContent>
          </Card>
        );
      }

      return (
        <Card key="connecting" className="max-w-md mx-auto w-full mt-10 text-center rounded-3xl overflow-hidden glass-panel border-0 shadow-lg">
          <CardHeader className="pt-10">
            <CardTitle className="text-3xl font-bold tracking-tight">Conectando...</CardTitle>
            <CardDescription className="text-base mt-2">Generando sesión con los servidores de WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="py-16 flex flex-col items-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <RefreshCw className="h-16 w-16 text-primary animate-spin relative z-10" />
            </div>
            <p className="text-muted-foreground font-medium">Por favor, espera un momento.</p>
          </CardContent>
          <CardFooter className="justify-center border-t border-border/50 pt-6 pb-6 bg-muted/5">
            <Button variant="ghost" size="sm" className="text-muted-foreground rounded-xl" onClick={handleResetSession} disabled={isResetting}>
              <RotateCcw className="h-4 w-4 mr-2" /> Si se cuelga, resetear sesión
            </Button>
          </CardFooter>
        </Card>
      );
    }

    if (status.state === 'qr' || qrCode) {
      return (
        <Card key="qr" className="max-w-md mx-auto w-full mt-10 rounded-3xl overflow-hidden glass-panel border-0 shadow-lg">
          <CardHeader className="text-center pt-10">
            <CardTitle className="text-3xl font-bold tracking-tight">{showPairForm ? "Vincular con código PIN" : "Escanea para conectar"}</CardTitle>
            <CardDescription className="text-base mt-2">
              {showPairForm
                ? "Ingresa tu número con código de país y usa el código en WhatsApp > Dispositivos vinculados."
                : 'Abre WhatsApp en tu teléfono, ve a "Dispositivos vinculados" y escanea este código QR.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-8">
            {!showPairForm ? (
              <div className="w-full flex flex-col items-center">
                <div className="bg-white p-5 rounded-3xl shadow-[0_0_40px_rgba(var(--primary),0.15)] border border-primary/10 mb-8 transition-transform hover:scale-105 duration-500">
                  {qrCode ? (
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 max-w-full h-auto" />
                  ) : (
                    <Skeleton className="w-64 h-64 rounded-xl" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-primary font-medium bg-primary/10 px-5 py-2.5 rounded-full border border-primary/20 shadow-sm mb-4">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Esperando confirmación...
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground rounded-xl" onClick={() => setShowPairForm(true)}>
                  <KeyRound className="h-4 w-4 mr-2" /> ¿No puedes escanear? Usar código PIN
                </Button>
              </div>
            ) : (
              <div className="text-left w-full">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Número con código de país</label>
                <Input
                  placeholder="Ej: 573001234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isPairing}
                  className="h-12 rounded-xl mb-3"
                />
                {pairError && <p className="text-sm text-destructive mb-3">{pairError}</p>}
                {pairingCode ? (
                  <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tu código de vinculación:</p>
                    <p className="text-2xl font-bold tracking-widest">{pairingCode}</p>
                    <p className="text-xs text-muted-foreground mt-2">En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular con número de teléfono</p>
                  </div>
                ) : (
                  <Button className="w-full h-12 rounded-xl mb-3" onClick={handleRequestPairingCode} disabled={isPairing}>
                    {isPairing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Obtener código
                  </Button>
                )}
                <Button variant="ghost" className="w-full text-muted-foreground rounded-xl" onClick={() => { setShowPairForm(false); setPairingCode(null); setPairError(null); }}>
                  Volver al código QR
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between border-t border-border/50 pt-6 pb-6 bg-muted/5 gap-3">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground rounded-xl" onClick={handleDisconnect}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-orange-600 border-orange-300 hover:bg-orange-50" onClick={handleResetSession} disabled={isResetting}>
              <RotateCcw className="h-4 w-4 mr-2" /> Nuevo QR
            </Button>
          </CardFooter>
        </Card>
      );
    }

    if (status.state === 'connected') {
      return (
        <Card key="connected" data-tour="whatsapp-connected-card" className="max-w-md mx-auto w-full mt-10 rounded-3xl overflow-hidden glass-panel border-0 shadow-lg relative">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-green-500/10 to-transparent pointer-events-none" />
          <div className="px-6 pt-12 pb-8 text-center relative z-10">
            <div className="mx-auto bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full w-24 h-24 flex items-center justify-center mb-6 shadow-lg shadow-green-500/30 ring-8 ring-green-500/10">
              <ShieldCheck className="h-12 w-12" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight mb-2 text-foreground">Conexión Activa</CardTitle>
            <CardDescription className="text-base">Tus agentes IA están listos para responder y vender.</CardDescription>
          </div>
          
          <div className="px-8 pb-8 relative z-10">
            <div className="bg-background rounded-[2rem] border-4 border-muted p-4 shadow-inner relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-4 bg-muted w-1/3 mx-auto rounded-b-xl" />
              <div className="flex flex-col gap-4 mt-6">
                <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-2xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Línea vinculada</p>
                    <p className="font-bold tabular-nums-all text-sm truncate">{status.phone || status.phoneNumber || '-'}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Sesión iniciada</p>
                  <p className="text-xs font-medium">
                    {status.connectedAt ? format(parseISO(status.connectedAt), "d MMM yyyy, HH:mm", { locale: es }) : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <CardFooter className="p-6 pt-0 relative z-10 flex flex-col gap-3">
            <Button data-tour="whatsapp-disconnect-button" variant="destructive" className="w-full h-12 rounded-xl text-base shadow-lg shadow-destructive/20 font-medium transition-transform active:scale-[0.98]" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
              <PowerOff className="h-5 w-5 mr-2" /> Desconectar línea
            </Button>
            <Button variant="outline" className="w-full h-10 rounded-xl text-sm text-orange-600 border-orange-300 hover:bg-orange-50" onClick={handleResetSession} disabled={isResetting}>
              <Trash2 className="h-4 w-4 mr-2" /> {isResetting ? "Reseteando..." : "Borrar sesión y reconectar con QR nuevo"}
            </Button>
            <p className="text-xs text-center text-muted-foreground px-4">Si desconectas, la IA dejará de responder inmediatamente.</p>
          </CardFooter>
        </Card>
      );
    }

    if (status.state === 'error' || status.state === undefined) {
      return (
        <Card key="error" className="max-w-md mx-auto w-full mt-10 rounded-3xl overflow-hidden glass-panel border border-destructive/20 shadow-lg shadow-destructive/5 relative">
          <CardHeader className="text-center pt-10">
            <div className="mx-auto bg-destructive/10 text-destructive rounded-full w-20 h-20 flex items-center justify-center mb-6 ring-8 ring-destructive/5">
              <AlertCircle className="h-10 w-10" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-destructive">Error de conexión</CardTitle>
            <CardDescription className="text-base mt-2">Ocurrió un problema con la sesión de WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-8">
            <div className="bg-muted/50 p-4 rounded-2xl border border-destructive/20 shadow-inner">
              <p className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap text-left break-all">
                {status.lastError || "Error desconocido en el servidor de WhatsApp"}
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-center gap-3 border-t border-border/50 pt-6 pb-6 bg-muted/5">
            <Button variant="outline" className="rounded-xl h-12 px-6 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={handleResetSession} disabled={isResetting}>
              <RotateCcw className="h-4 w-4 mr-2" /> {isResetting ? "Reseteando..." : "Resetear Sesión"}
            </Button>
            <Button className="rounded-xl h-12 px-8 shadow-lg shadow-primary/20" onClick={handleConnect}>Reintentar</Button>
          </CardFooter>
        </Card>
      );
    }

    return null;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-start gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words min-w-0">Conexión de WhatsApp</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground mt-1">
              Gestiona el dispositivo vinculado a tus agentes IA. Cada sesión es independiente: puedes abrir el bot en otro lugar sin afectar esta conexión.
            </p>
          </div>
          {status && status.state !== 'disconnected' && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-orange-600 rounded-xl shrink-0" onClick={handleResetSession} disabled={isResetting}>
              <RotateCcw className="h-4 w-4 mr-2" /> Resetear sesión
            </Button>
          )}
        </div>

        {renderState()}
      </div>
    </Layout>
  );
}
