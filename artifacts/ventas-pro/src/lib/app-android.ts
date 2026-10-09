/**
 * La app de Android de VentasPro (TWA): un APK que abre ventasproia.com a
 * pantalla completa. Es la MISMA app web, así que siempre está sincronizada
 * con el servidor: no hay datos ni versiones que copiar. Solo hace falta
 * publicar un APK nuevo si cambia el ícono, el nombre o el paquete.
 *
 * Firmado con la llave cuya huella publica el servidor en
 * /.well-known/assetlinks.json (ANDROID_SHA256): por eso abre sin la barra
 * del navegador. Si la firma no coincidiera, se vería como una pestaña.
 */
export const APK = {
  version: "1.0.0",
  url: "/descargas/VentasPro-1.0.0.apk",
  tamano: "1,3 MB",
  paquete: "com.ventaspro.app",
};

/** ¿Estamos DENTRO del APK? La TWA arranca en /?app=ventaspro. */
export function dentroDeLaApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("app") === "ventaspro") {
      sessionStorage.setItem("vp-en-app", "1");
      return true;
    }
    if (sessionStorage.getItem("vp-en-app") === "1") return true;
  } catch { /* almacenamiento bloqueado: se sigue con lo demás */ }
  if (document.referrer.startsWith(`android-app://${APK.paquete}`)) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function esAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}
