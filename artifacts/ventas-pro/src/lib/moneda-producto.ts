/** Conserva una moneda explícita; para nuevos productos usa el catálogo del negocio. */
export function monedaDelCatalogo(productos: ReadonlyArray<{ currency?: string | null }>, explicita?: string | null): string {
  const normalizar = (v?: string | null) => /^[A-Z]{3}$/.test(String(v || "").trim().toUpperCase()) ? String(v).trim().toUpperCase() : null;
  const elegida = normalizar(explicita);
  if (elegida) return elegida;
  const conteo = new Map<string, number>();
  for (const p of productos) { const c = normalizar(p.currency); if (c) conteo.set(c, (conteo.get(c) || 0) + 1); }
  return [...conteo.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] || "COP";
}
