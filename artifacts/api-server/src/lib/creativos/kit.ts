/**
 * Dónde vive el kit de marca de cada negocio: un JSON en el volumen, junto a
 * los creativos pero en su propia carpeta (`_kits/`), para que nunca se
 * confunda con un creativo al listarlos.
 *
 * El logo, si el kit no trae uno, sale del perfil del negocio
 * (`tenants.brand_logo`): ese sí es una elección del dueño. Los colores del
 * perfil NO se usan (suelen ser los del sistema; ver estudio/kit.ts).
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, tenants } from "@workspace/db";
import { dirDeEscenas } from "./almacen";
import { normalizarKit, type KitDeMarca } from "../estudio/kit";

const archivo = (tenantId: number) => path.join(dirDeEscenas(), "_kits", `${Math.trunc(tenantId)}.json`);

export async function leerKit(tenantId: number): Promise<{ kit: KitDeMarca; definido: boolean; logoDelPerfil: string | null }> {
  let guardado: KitDeMarca = {};
  try { guardado = normalizarKit(JSON.parse(await readFile(archivo(tenantId), "utf8"))); } catch { /* sin kit */ }
  let logoDelPerfil: string | null = null;
  try {
    const [t] = await db.select({ logo: tenants.brandLogo }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    logoDelPerfil = t?.logo ? String(t.logo) : null;
  } catch { logoDelPerfil = null; }
  const definido = Object.keys(guardado).length > 0;
  const kit = normalizarKit({ ...guardado, logo: guardado.logo || logoDelPerfil });
  return { kit, definido, logoDelPerfil };
}

export async function guardarKit(tenantId: number, entrada: unknown): Promise<KitDeMarca> {
  const kit = normalizarKit(entrada);
  await mkdir(path.dirname(archivo(tenantId)), { recursive: true });
  await writeFile(archivo(tenantId), JSON.stringify(kit), "utf8");
  return kit;
}
