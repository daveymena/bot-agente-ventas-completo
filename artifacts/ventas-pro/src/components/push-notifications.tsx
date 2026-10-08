import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { estadoPush, activarPush, desactivarPush, probarPush, type EstadoPush } from "@/lib/pwa";
import { DescargarAppAndroid } from "@/components/app-android";

/** Notificaciones push del negocio en el celular (Web Push, sin Firebase).
 *  Avisa: mensajes nuevos de clientes, pedidos, comprobantes y alertas del
 *  supervisor. Funciona con la app instalada (PWA/APK). */
export function PushNotifications() {
  const [estado, setEstado] = useState<EstadoPush>("apagado");
  const [busy, setBusy] = useState(false);

  const refrescar = async () => setEstado(await estadoPush());
  useEffect(() => { refrescar(); }, []);

  const activar = async () => {
    setBusy(true);
    const r = await activarPush();
    setBusy(false);
    if (r.ok) { toast.success("Notificaciones activadas en este dispositivo."); refrescar(); }
    else toast.error(r.error || "No se pudo activar.");
  };

  const desactivar = async () => {
    setBusy(true);
    await desactivarPush();
    setBusy(false);
    toast.success("Notificaciones desactivadas en este dispositivo.");
    refrescar();
  };

  const probar = async () => {
    const ok = await probarPush();
    if (ok) toast.success("Aviso de prueba enviado. Debe llegarte en segundos.");
    else toast.error("No hay suscripción activa en este dispositivo.");
  };

  return (
    <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-primary to-accent" />
      <CardHeader className="pt-8">
        <CardTitle className="text-xl flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg text-primary"><Smartphone className="h-5 w-5" /></div>
          App en tu celular
        </CardTitle>
        <CardDescription>
          Instala VentasPro como app y recibe avisos de mensajes, pedidos y pagos al instante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Estado:{" "}
          <strong>
            {estado === "activo" && "✅ Activadas en este dispositivo"}
            {estado === "apagado" && "⏸️ Apagadas"}
            {estado === "bloqueado" && "🚫 Bloqueadas en el navegador (actívalas en ajustes del sitio)"}
            {estado === "no-soportado" && "⚠️ Este navegador no soporta push"}
          </strong>
        </div>
        <div className="flex flex-wrap gap-2">
          {estado === "activo" ? (
            <>
              <Button variant="outline" onClick={probar}><Bell className="h-4 w-4 mr-2" /> Enviar prueba</Button>
              <Button variant="ghost" onClick={desactivar} disabled={busy}><BellOff className="h-4 w-4 mr-2" /> Desactivar</Button>
            </>
          ) : (
            <Button onClick={activar} disabled={busy || estado === "bloqueado" || estado === "no-soportado"}>
              <Bell className="h-4 w-4 mr-2" /> Activar notificaciones
            </Button>
          )}
        </div>
        <div className="border-t pt-4">
          <DescargarAppAndroid />
        </div>
      </CardContent>
    </Card>
  );
}
