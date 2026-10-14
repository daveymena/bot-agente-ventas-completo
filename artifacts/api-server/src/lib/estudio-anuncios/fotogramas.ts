/**
 * Fotogramas del motor de vídeo antiguo (lib/video-anuncio.ts) SIN Chromium.
 *
 * Cuando puppeteer no puede arrancar (VPS sin Chromium, memoria, sandbox),
 * las escenas se pintan con las plantillas del Estudio (sharp + Inter) en
 * vez de abortar el vídeo. Misma salida: PNG 1080×1920 por escena.
 */
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { disenoDeEscena, type Contenido, type RolDeEscena } from "./diseno";
import { cargadorConCache, renderizarDiseno } from "./render";

export interface EscenaParaFotograma { texto: string }
export interface ContextoFotograma { color: string; marca: string; precio: string; cta: string }

export async function fotogramasSinNavegador(
  items: Array<{ e: EscenaParaFotograma; i: number; foto: string | null }>,
  total: number,
  ctx: ContextoFotograma,
  dir: string,
  rolDe: (e: any, i: number, total: number) => "gancho" | "producto" | "precio" | "cierre",
): Promise<string[]> {
  const cargar = cargadorConCache();
  const salidas: string[] = [];
  for (const it of items) {
    const rol: RolDeEscena = rolDe(it.e, it.i, total);
    const c: Contenido = { nombre: "", titular: it.e.texto, ganchos: [it.e.texto], puntos: [], precio: ctx.precio || null, sellos: [], cta: ctx.cta, marca: ctx.marca, color: ctx.color || "#4F46E5", fotos: it.foto ? [it.foto] : [] };
    const d = disenoDeEscena(rol, it.e.texto, c, 0);
    const archivo = path.join(dir, `escena-${it.i}.png`);
    await writeFile(archivo, await renderizarDiseno(d, { cargar }));
    salidas.push(archivo);
  }
  return salidas;
}
