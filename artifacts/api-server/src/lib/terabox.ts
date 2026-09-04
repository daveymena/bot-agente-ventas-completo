import { logger } from "./logger";

/**
 * Integración con Terabox (almacenamiento en la nube).
 *
 * Terabox NO tiene API oficial. Se usa la librería no oficial `terabox-api`,
 * que interactúa con la API interna vía la cookie de sesión `ndus`. Para un
 * negocio real esto es frágil y va contra los términos; acá se usa a pedido
 * del dueño sobre una cuenta de prueba.
 *
 * `TERABOX_NDUS` es la cookie de sesión. Se obtiene logueando en terabox.com;
 * expira en días. Si el listado falla, hay que renovarla y actualizar la
 * variable en EasyPanel.
 */

export interface TeraboxItem {
  name: string;
  isDir: boolean;
  fsId: string;
  path: string;
  size: number | null;
}

function getNdus(): string | null {
  return (process.env.TERABOX_NDUS || "").trim() || null;
}

/** Lista el contenido de una carpeta. `dir` vacío = raíz. */
export async function listarCarpetaTerabox(dir: string): Promise<TeraboxItem[]> {
  const ndus = getNdus();
  if (!ndus) throw new Error("TERABOX_NDUS no configurado");

  const { default: TeraBoxApp } = await import("terabox-api");
  const tb = new TeraBoxApp(ndus);

  const r = await tb.getRemoteDir(dir || "/", 1);
  if (r?.errno !== 0) {
    throw new Error(`Terabox list errno=${r?.errno} ${r?.errmsg || r?.show_msg || ""}`);
  }

  return (r.list || []).map((f: any) => ({
    name: f.server_filename || f.filename || f.path || "",
    isDir: !!f.isdir,
    fsId: String(f.fs_id ?? ""),
    path: f.path || "",
    size: typeof f.size === "number" ? f.size : null,
  }));
}

/** Genera un link de compartir para una o más rutas (ej. ["/Curso X"]). */
export async function crearLinkTerabox(paths: string[], pass = "", period = 0): Promise<{ shorturl: string; shareid: string }> {
  const ndus = getNdus();
  if (!ndus) throw new Error("TERABOX_NDUS no configurado");

  const { default: TeraBoxApp } = await import("terabox-api");
  const tb = new TeraBoxApp(ndus);

  const r = await tb.shareSet(paths, pass, period);
  if (r?.errno !== 0) {
    throw new Error(`Terabox share errno=${r?.errno} ${r?.show_msg || r?.errmsg || ""}`);
  }

  return {
    shorturl: r.shorturl || r.link || "",
    shareid: String(r.shareid ?? ""),
  };
}

/** Devuelve si la sesión de Terabox está activa. */
export async function teraboxConectado(): Promise<boolean> {
  const ndus = getNdus();
  if (!ndus) return false;
  try {
    const { default: TeraBoxApp } = await import("terabox-api");
    const tb = new TeraBoxApp(ndus);
    const r = await tb.checkLogin();
    return r?.errno === 0;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[Terabox] checkLogin falló");
    return false;
  }
}
