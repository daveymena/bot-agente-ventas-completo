/**
 * Respaldo completo de la base, en Node (sin pg_dump: la imagen de producción
 * no lo trae). Exporta TODAS las tablas del esquema, comprimidas, con un
 * manifiesto de conteos para poder verificar que el archivo se puede leer.
 *
 * Retención: se conservan los N respaldos más recientes; los demás se borran.
 *
 * ⚠️ Un respaldo que vive en el mismo disco que la base no protege contra la
 * pérdida del disco. Para eso hay que copiar `BACKUP_DIR` a otro lugar (un
 * volumen aparte o almacenamiento externo) — ver RESPALDOS.md.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getTableName } from "drizzle-orm";
import { db } from "@workspace/db";
import * as esquema from "@workspace/db";

export const PREFIJO_RESPALDO = "base-";
const EXTENSION = ".json.gz";

export interface ManifiestoRespaldo {
  version: 1;
  creado: string;
  motor: "postgres" | "sqlite";
  tablas: Record<string, number>;
  /** Tablas exportadas en el esquema pero ausentes en la base real (discrepancia a revisar). */
  faltantes: string[];
}

export interface ResultadoRespaldo {
  ok: boolean;
  ruta?: string;
  tablas?: number;
  filas?: number;
  error?: string;
}

/** Tablas del esquema: los exports de @workspace/db que son tablas de drizzle. */
export function tablasDelEsquema(): Array<{ nombre: string; tabla: any }> {
  const vistas = new Set<unknown>();
  const out: Array<{ nombre: string; tabla: any }> = [];
  for (const [clave, valor] of Object.entries(esquema)) {
    if (!valor || typeof valor !== "object" || vistas.has(valor)) continue;
    let nombre: string | null = null;
    try {
      nombre = getTableName(valor as any);
    } catch {
      nombre = null;
    }
    if (!nombre) continue;
    vistas.add(valor);
    out.push({ nombre, tabla: valor });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function directorioRespaldos(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "data", "backups");
}

/** Error de "la tabla no existe" en SQLite o Postgres. */
function esTablaAusente(e: any): boolean {
  const msg = String(e?.message || e || "");
  return e?.code === "42P01" || /no such table|does not exist/i.test(msg);
}

/** Crea un respaldo completo y devuelve su ruta. Nunca borra nada. */
export async function crearRespaldoBase(motor: "postgres" | "sqlite" = "postgres"): Promise<ResultadoRespaldo> {
  try {
    const dir = directorioRespaldos();
    fs.mkdirSync(dir, { recursive: true });

    const tablas: Record<string, any[]> = {};
    const faltantes: string[] = [];
    for (const { nombre, tabla } of tablasDelEsquema()) {
      try {
        tablas[nombre] = await db.select().from(tabla);
      } catch (e: any) {
        // Tabla declarada en el esquema pero no creada en la base: no aborta el
        // respaldo del resto, pero queda escrito para que alguien lo revise.
        if (!esTablaAusente(e)) throw e;
        faltantes.push(nombre);
      }
    }
    const manifiesto: ManifiestoRespaldo = {
      version: 1,
      creado: new Date().toISOString(),
      motor,
      tablas: Object.fromEntries(Object.entries(tablas).map(([n, f]) => [n, f.length])),
      faltantes,
    };
    if (faltantes.length) console.warn(`[RESPALDO] tablas ausentes en la base: ${faltantes.join(", ")}`);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ruta = path.join(dir, `${PREFIJO_RESPALDO}${stamp}${EXTENSION}`);
    const cuerpo = JSON.stringify({ manifiesto, tablas });
    // Se escribe a un temporal y se renombra: un corte a mitad de escritura no deja
    // un respaldo corrupto que parezca válido.
    const tmp = `${ruta}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(cuerpo));
    fs.renameSync(tmp, ruta);

    const verificacion = verificarRespaldo(ruta);
    if (!verificacion.ok) {
      fs.rmSync(ruta, { force: true });
      return { ok: false, error: `El respaldo no se pudo releer: ${verificacion.error}` };
    }
    return {
      ok: true,
      ruta,
      tablas: Object.keys(tablas).length,
      filas: Object.values(manifiesto.tablas).reduce((a, b) => a + b, 0),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Relee un respaldo y compara sus filas con el manifiesto. */
export function verificarRespaldo(ruta: string): { ok: boolean; error?: string; manifiesto?: ManifiestoRespaldo } {
  try {
    const crudo = zlib.gunzipSync(fs.readFileSync(ruta)).toString("utf8");
    const { manifiesto, tablas } = JSON.parse(crudo) as { manifiesto: ManifiestoRespaldo; tablas: Record<string, any[]> };
    for (const [nombre, esperadas] of Object.entries(manifiesto.tablas)) {
      const reales = Array.isArray(tablas[nombre]) ? tablas[nombre].length : -1;
      if (reales !== esperadas) return { ok: false, error: `${nombre}: manifiesto ${esperadas}, archivo ${reales}` };
    }
    return { ok: true, manifiesto };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Lista los respaldos del directorio, del más nuevo al más viejo. */
export function listarRespaldosBase(): string[] {
  const dir = directorioRespaldos();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(PREFIJO_RESPALDO) && n.endsWith(EXTENSION))
    .sort()
    .reverse()
    .map((n) => path.join(dir, n));
}

/** Borra todo menos los `conservar` respaldos más recientes. Devuelve cuántos borró. */
export function aplicarRetencion(conservar: number): number {
  const rutas = listarRespaldosBase();
  const viejos = rutas.slice(Math.max(0, conservar));
  for (const r of viejos) fs.rmSync(r, { force: true });
  return viejos.length;
}

/**
 * Copia un respaldo fuera del servidor: HTTP PUT a `${RESPALDO_DESTINO_URL}/<archivo>`
 * con `Authorization: Bearer RESPALDO_DESTINO_TOKEN` si existe. Sirve para WebDAV, un
 * endpoint propio o un prefijo firmado de almacenamiento. Sin destino configurado, no hace nada.
 */
export async function copiarRespaldoFueraDelServidor(ruta: string): Promise<{ ok: boolean; omitido?: boolean; error?: string }> {
  const base = (process.env.RESPALDO_DESTINO_URL || "").replace(/\/+$/, "");
  if (!base) return { ok: true, omitido: true };
  try {
    const cuerpo = fs.readFileSync(ruta);
    const cabeceras: Record<string, string> = { "Content-Type": "application/gzip" };
    if (process.env.RESPALDO_DESTINO_TOKEN) cabeceras.Authorization = `Bearer ${process.env.RESPALDO_DESTINO_TOKEN}`;
    const destino = `${base}/${encodeURIComponent(path.basename(ruta))}`;
    const r = await fetch(destino, { method: "PUT", headers: cabeceras, body: cuerpo, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return { ok: false, error: `destino respondió HTTP ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Programa respaldos periódicos. Se apaga con RESPALDO_ACTIVO=false.
 * RESPALDO_CADA_HORAS (defecto 24) y RESPALDO_CONSERVAR (defecto 14).
 */
export function iniciarRespaldosPeriodicos(motor: "postgres" | "sqlite"): NodeJS.Timeout | null {
  if (process.env.RESPALDO_ACTIVO === "false") return null;
  const horas = Math.max(1, Number(process.env.RESPALDO_CADA_HORAS) || 24);
  const conservar = Math.max(1, Number(process.env.RESPALDO_CONSERVAR) || 14);

  const correr = async () => {
    const r = await crearRespaldoBase(motor);
    if (r.ok) {
      const borrados = aplicarRetencion(conservar);
      console.log(`[RESPALDO] ${r.filas} filas en ${r.tablas} tablas → ${r.ruta} (retención: -${borrados})`);
      const copia = await copiarRespaldoFueraDelServidor(r.ruta!);
      if (copia.omitido) console.warn("[RESPALDO] sin copia fuera del servidor: falta RESPALDO_DESTINO_URL");
      else if (!copia.ok) console.error(`[RESPALDO] la copia fuera del servidor FALLÓ: ${copia.error}`);
      else console.log("[RESPALDO] copia fuera del servidor OK");
    } else {
      console.error(`[RESPALDO] FALLÓ: ${r.error}`);
    }
  };
  // Primer respaldo a los 5 minutos del arranque, luego cada N horas.
  setTimeout(correr, 5 * 60 * 1000).unref();
  const t = setInterval(correr, horas * 60 * 60 * 1000);
  t.unref();
  return t;
}
