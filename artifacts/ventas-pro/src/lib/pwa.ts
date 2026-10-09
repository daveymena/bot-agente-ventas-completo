/**
 * PWA VentasPro: registro del SW + suscripción Web Push (VAPID, sin Firebase).
 * La suscripción queda ligada a la sesión del dueño (cookie) en /api/push/*.
 */

function b64ToU8(base64: string): Uint8Array {
  const bin = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function pwaSoportado(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pwaSoportado()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    return reg;
  } catch {
    return null;
  }
}

export type EstadoPush = "no-soportado" | "bloqueado" | "activo" | "apagado";

export async function estadoPush(): Promise<EstadoPush> {
  if (!pwaSoportado()) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "activo" : "apagado";
  } catch {
    return "apagado";
  }
}

export async function activarPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pwaSoportado()) return { ok: false, error: "Este navegador no soporta notificaciones push." };
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, error: "Permiso de notificaciones denegado." };
  try {
    const r = await fetch("/api/push/vapid-key", { credentials: "include" });
    const { publicKey } = await r.json();
    if (!publicKey) return { ok: false, error: "Push no configurado en el servidor (falta VAPID)." };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) as BufferSource });
    }
    const resp = await fetch("/api/push/suscribir", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suscripcion: sub.toJSON(), dispositivo: navigator.userAgent.slice(0, 200) }),
    });
    if (!resp.ok) return { ok: false, error: "No se pudo guardar la suscripción." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falló la suscripción." };
  }
}

export async function desactivarPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/suscribir", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch { /* noop */ }
}

export async function probarPush(): Promise<boolean> {
  try {
    const r = await fetch("/api/push/probar", { method: "POST", credentials: "include" });
    return r.ok;
  } catch {
    return false;
  }
}
