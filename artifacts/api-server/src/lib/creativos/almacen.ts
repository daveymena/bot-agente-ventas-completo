/**
 * Dónde viven los creativos: un JSON por creativo, por negocio, en el volumen.
 *
 * No es una tabla a propósito (por ahora): agregar una tabla obliga a tocar
 * el esquema de drizzle, la migración de Postgres y la de SQLite a la vez, y
 * esos archivos tenían cambios sin subir de otra sesión el 14-10. Un creativo
 * es un documento que se lee y se escribe entero, y el volumen /app/data ya
 * es persistente (easypanel.yml). Si algún día hace falta consultar
 * creativos por campos, se migra a tabla leyendo estos JSON.
 *
 * Los JSON van FUERA de la carpeta servida en /uploads: la escena de un
 * negocio no se puede leer por URL. Los PNG sí van a /uploads/creativos/,
 * porque Meta los tiene que poder bajar.
 */
import path from "node:path";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getImageStoreDir } from "../image-store";
import { normalizarEscena, type Escena } from "../estudio/escena";

export interface Creativo {
  id: string;
  tenantId: number;
  nombre: string;
  productId: number | null;
  maqueta: string | null;
  escena: Escena;
  /** Última exportación (ruta pública /uploads/...). */
  png: string | null;
  creado: string;
  actualizado: string;
  /** Quién lo hizo: "dueño" desde el estudio, "atlas" desde una herramienta. */
  autor: "dueno" | "atlas";
}

export function dirDeEscenas(): string {
  return process.env.CREATIVOS_DIR || path.resolve(getImageStoreDir(), "..", "creativos");
}

const ID_VALIDO = /^[a-z0-9-]{8,40}$/i;
const archivo = (tenantId: number, id: string) => path.join(dirDeEscenas(), String(Math.trunc(tenantId)), `${id}.json`);

export async function listarCreativos(tenantId: number): Promise<Creativo[]> {
  const dir = path.join(dirDeEscenas(), String(Math.trunc(tenantId)));
  let nombres: string[] = [];
  try { nombres = (await readdir(dir)).filter((n) => n.endsWith(".json")); } catch { return []; }
  const todos = await Promise.all(nombres.map(async (n) => {
    try { return JSON.parse(await readFile(path.join(dir, n), "utf8")) as Creativo; } catch { return null; }
  }));
  return todos.filter((c): c is Creativo => !!c).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

export async function leerCreativo(tenantId: number, id: string): Promise<Creativo | null> {
  if (!ID_VALIDO.test(id)) return null;
  try {
    const c = JSON.parse(await readFile(archivo(tenantId, id), "utf8")) as Creativo;
    return c.tenantId === tenantId ? c : null;
  } catch { return null; }
}

export async function guardarCreativo(tenantId: number, entrada: Partial<Creativo> & { escena: unknown }, autor: Creativo["autor"] = "dueno"): Promise<Creativo> {
  const ahora = new Date().toISOString();
  const previo = entrada.id ? await leerCreativo(tenantId, entrada.id) : null;
  const c: Creativo = {
    id: previo?.id || randomUUID(),
    tenantId,
    nombre: String(entrada.nombre ?? previo?.nombre ?? "Creativo").slice(0, 80) || "Creativo",
    productId: entrada.productId !== undefined ? (Number(entrada.productId) || null) : previo?.productId ?? null,
    maqueta: entrada.maqueta !== undefined ? (entrada.maqueta ? String(entrada.maqueta).slice(0, 40) : null) : previo?.maqueta ?? null,
    escena: normalizarEscena(entrada.escena),
    png: entrada.png !== undefined ? entrada.png : previo?.png ?? null,
    creado: previo?.creado || ahora,
    actualizado: ahora,
    autor: previo?.autor || autor,
  };
  await mkdir(path.dirname(archivo(tenantId, c.id)), { recursive: true });
  await writeFile(archivo(tenantId, c.id), JSON.stringify(c), "utf8");
  return c;
}

export async function borrarCreativo(tenantId: number, id: string): Promise<boolean> {
  if (!ID_VALIDO.test(id)) return false;
  const c = await leerCreativo(tenantId, id);
  if (!c) return false;
  await rm(archivo(tenantId, id), { force: true });
  return true;
}
