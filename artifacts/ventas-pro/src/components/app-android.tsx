import { useEffect, useState } from "react";
import { Download, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APK, dentroDeLaApp, esAndroid } from "@/lib/app-android";

/**
 * Descargar el APK desde la propia app (08-10). El dueño: "necesito que el
 * APK esté disponible desde la app, que al abrirla tenga esa opción". Antes
 * el APK solo existía en una carpeta del Escritorio y la tarjeta decía
 * "la APK de Play Store llega con esto" sin ningún enlace.
 */
export function DescargarAppAndroid() {
  const [enApp, setEnApp] = useState(false);
  useEffect(() => setEnApp(dentroDeLaApp()), []);

  if (enApp) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Estás usando la app de VentasPro para Android.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button asChild>
        <a href={APK.url} download={`VentasPro-${APK.version}.apk`}>
          <Download className="h-4 w-4 mr-2" /> Descargar app para Android ({APK.tamano})
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        Ábrelo desde las descargas del celular y toca <b>Instalar</b>. Si Android pregunta, permite instalar apps de
        esta fuente. Es la misma VentasPro, siempre al día con el servidor: no hace falta reinstalar cuando hay mejoras.
      </p>
    </div>
  );
}

/** Aviso al abrir VentasPro desde el navegador de un Android (no dentro del APK). */
export function AvisoAppAndroid() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (!esAndroid() || dentroDeLaApp()) return;
    try {
      if (localStorage.getItem("vp-aviso-apk-cerrado") === APK.version) return;
    } catch { /* sin almacenamiento: se muestra igual */ }
    setVer(true);
  }, []);
  if (!ver) return null;

  const cerrar = () => {
    setVer(false);
    try { localStorage.setItem("vp-aviso-apk-cerrado", APK.version); } catch { /* noop */ }
  };
  return (
    <div className="mx-3 mt-3 rounded-2xl border bg-card p-3 shadow-sm flex items-center gap-3" role="region" aria-label="App de Android">
      <img src="/icono-192.png" alt="" className="h-10 w-10 rounded-xl" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">VentasPro para Android</p>
        <p className="text-xs text-muted-foreground leading-tight">Avisos al instante y acceso con un toque.</p>
      </div>
      <Button size="sm" asChild>
        <a href={APK.url} download={`VentasPro-${APK.version}.apk`} onClick={cerrar}>Instalar</a>
      </Button>
      <button type="button" onClick={cerrar} aria-label="Cerrar" className="p-1 text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
