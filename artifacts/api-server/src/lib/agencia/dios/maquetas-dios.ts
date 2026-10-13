/**
 * DIOS — Maquetas Dios para motor nuevo
 * Cuando el cliente pide fotos/video, si DIOS=1 y el producto no tiene galería real suficiente,
 * se inyectan las 3 niveles (L1/L2/L3) en 4:5+1:1. No rompe herramientas.ts: es helper que el adaptador puede llamar.
 */
export function fotosDiosParaMostrar(galeriaReal: string[], promptsDios: string[]): string[] {
  if (process.env.DIOS !== "1") return galeriaReal;
  if (galeriaReal.length >= 3) return galeriaReal;
  // completa hasta 3 con prompts Dios (urls generadas luego)
  const faltan = 3 - galeriaReal.length;
  return [...galeriaReal, ...promptsDios.slice(0, faltan)];
}

export function esGaleriaPobre(fotos: string[] | null | undefined): boolean {
  if (!fotos || fotos.length < 3) return true;
  return fotos.some(f => !f || f.includes("placeholder"));
}
