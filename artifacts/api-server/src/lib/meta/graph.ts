/**
 * Cliente de Graph API con clasificación de errores y lectura de cuotas.
 *
 * Los códigos vienen de la documentación de errores de Meta. Antes de usar
 * esto en producción, confirmar la lista vigente en developers.facebook.com.
 */

export type CategoriaError =
  | "token_invalido"   // requiere que el negocio reconecte su cuenta
  | "limite_uso"       // cuota de la app o de la cuenta: reintentar más tarde
  | "transitorio"      // fallo temporal de Meta: reintentar
  | "permanente";      // error de la petición o de permisos: no reintentar

export interface ErrorMeta {
  categoria: CategoriaError;
  codigo?: number;
  subcodigo?: number;
  mensaje: string;
}

const CODIGOS_TOKEN = new Set([190, 102]);
const CODIGOS_LIMITE = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80007, 80008, 80009, 80014]);
const CODIGOS_TRANSITORIOS = new Set([1, 2]);

export function clasificarError(codigo: number | undefined, mensaje = ""): ErrorMeta {
  if (codigo !== undefined && CODIGOS_TOKEN.has(codigo)) return { categoria: "token_invalido", codigo, mensaje };
  if (codigo !== undefined && CODIGOS_LIMITE.has(codigo)) return { categoria: "limite_uso", codigo, mensaje };
  if (codigo !== undefined && CODIGOS_TRANSITORIOS.has(codigo)) return { categoria: "transitorio", codigo, mensaje };
  return { categoria: "permanente", codigo, mensaje };
}

export class MetaError extends Error {
  readonly categoria: CategoriaError;
  readonly codigo?: number;
  readonly subcodigo?: number;
  readonly estado: number;

  constructor(error: ErrorMeta, estado: number, subcodigo?: number) {
    super(`[Meta ${error.codigo ?? estado}] ${error.mensaje}`);
    this.name = "MetaError";
    this.categoria = error.categoria;
    this.codigo = error.codigo;
    this.subcodigo = subcodigo;
    this.estado = estado;
  }

  /** Solo estos errores justifican reintentar automáticamente. */
  get reintentable(): boolean {
    return this.categoria === "limite_uso" || this.categoria === "transitorio";
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Porcentajes de uso que Meta informa en las cabeceras de la respuesta. */
export interface UsoMeta {
  appPorcentaje?: number;
  cuentaPorcentaje?: number;
}

export function leerUso(cabeceras: Headers): UsoMeta {
  const uso: UsoMeta = {};
  const app = cabeceras.get("x-app-usage");
  if (app) {
    try {
      const j = JSON.parse(app) as { call_count?: number; total_time?: number; total_cputime?: number };
      uso.appPorcentaje = Math.max(j.call_count ?? 0, j.total_time ?? 0, j.total_cputime ?? 0);
    } catch { /* cabecera malformada: se ignora */ }
  }
  const cuenta = cabeceras.get("x-business-use-case-usage");
  if (cuenta) {
    try {
      const j = JSON.parse(cuenta) as Record<string, { call_count?: number; total_time?: number; total_cputime?: number }[]>;
      const valores = Object.values(j).flat().map((e) => Math.max(e.call_count ?? 0, e.total_time ?? 0, e.total_cputime ?? 0));
      if (valores.length) uso.cuentaPorcentaje = Math.max(...valores);
    } catch { /* ignorado */ }
  }
  return uso;
}

export interface ClienteGraphOpciones {
  version: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Se llama con el uso reportado en cada respuesta, para registrar cuota por cuenta. */
  alUso?: (uso: UsoMeta) => void;
}

export interface ClienteGraph {
  get(ruta: string, params: Record<string, string>, token: string): Promise<unknown>;
  post(ruta: string, cuerpo: Record<string, string>, token: string): Promise<unknown>;
}

export function crearClienteGraph(opciones: ClienteGraphOpciones): ClienteGraph {
  const fetchImpl: FetchLike = opciones.fetchImpl ?? ((url, init) => fetch(url, init));
  const base = `https://graph.facebook.com/${opciones.version}`;
  const timeoutMs = opciones.timeoutMs ?? 20_000;

  async function pedir(metodo: "GET" | "POST", ruta: string, datos: Record<string, string>, token: string): Promise<unknown> {
    const url = new URL(`${base}/${ruta.replace(/^\//, "")}`);
    const init: RequestInit = { method: metodo, signal: AbortSignal.timeout(timeoutMs) };
    if (metodo === "GET") {
      for (const [k, v] of Object.entries({ ...datos, access_token: token })) url.searchParams.set(k, v);
    } else {
      const cuerpo = new URLSearchParams({ ...datos, access_token: token });
      init.body = cuerpo;
      init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    }

    let respuesta: Response;
    try {
      respuesta = await fetchImpl(url.toString(), init);
    } catch (e) {
      throw new MetaError({ categoria: "transitorio", mensaje: `red: ${(e as Error).message}` }, 0);
    }

    opciones.alUso?.(leerUso(respuesta.headers));

    const texto = await respuesta.text();
    let cuerpo: unknown = null;
    try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = null; }

    if (!respuesta.ok) {
      const err = (cuerpo as { error?: { code?: number; error_subcode?: number; message?: string } } | null)?.error;
      const clasificado = clasificarError(err?.code, err?.message ?? `HTTP ${respuesta.status}`);
      // Un 5xx sin código de Meta es transitorio aunque no lo diga.
      if (!err && respuesta.status >= 500) {
        throw new MetaError({ categoria: "transitorio", mensaje: `HTTP ${respuesta.status}` }, respuesta.status);
      }
      throw new MetaError(clasificado, respuesta.status, err?.error_subcode);
    }
    return cuerpo;
  }

  return {
    get: (ruta, params, token) => pedir("GET", ruta, params, token),
    post: (ruta, cuerpo, token) => pedir("POST", ruta, cuerpo, token),
  };
}
