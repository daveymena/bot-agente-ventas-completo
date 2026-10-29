/**
 * Valida ciudad y departamento contra la geografía de Dropi ANTES de crear
 * una orden. Dropi rechaza el pedido si el departamento no existe ("El
 * departamento no existe o está deshabilitado") y eso llegó a pasar con un
 * pedido real (16-10): la orden salió con el departamento vacío y Atlas lo
 * presentó como listo.
 *
 * Función pura: no toca red ni base. La lista llega de geografiaDeDropi().
 */

export type GeografiaDropi = Array<{ nombre: string; ciudades: string[] }>;

export type ResultadoDestino =
  | { ok: true; city: string; state: string }
  | { ok: false; motivo: string; sugerencias: string[] };

export function normalizarParaComparar(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validarDestinoDropi(geo: GeografiaDropi, ciudad: string, departamento: string): ResultadoDestino {
  const c = normalizarParaComparar(ciudad);
  const d = normalizarParaComparar(departamento);
  if (!d) return { ok: false, motivo: "Falta el departamento de envío.", sugerencias: [] };
  if (!c) return { ok: false, motivo: "Falta la ciudad de envío.", sugerencias: [] };

  // Coincidencia exacta del departamento; si no, un único nombre que empiece
  // con lo escrito ("Valle" → "Valle del Cauca"). Ambiguo = no se adivina.
  let dep = geo.find((x) => normalizarParaComparar(x.nombre) === d);
  if (!dep) {
    const parecidos = geo.filter((x) => normalizarParaComparar(x.nombre).startsWith(d + " "));
    if (parecidos.length === 1) dep = parecidos[0];
  }
  if (!dep) {
    const sugerencias = geo.map((x) => x.nombre).filter((n) => normalizarParaComparar(n).includes(d)).slice(0, 5);
    return { ok: false, motivo: `El departamento "${departamento}" no existe en Dropi. Usa el nombre oficial.`, sugerencias };
  }

  const ciudadOficial = dep.ciudades.find((x) => normalizarParaComparar(x) === c);
  if (!ciudadOficial) {
    const sugerencias = dep.ciudades.filter((x) => {
      const nx = normalizarParaComparar(x);
      return nx.includes(c) || c.includes(nx);
    }).slice(0, 5);
    return { ok: false, motivo: `La ciudad "${ciudad}" no está en ${dep.nombre} según Dropi.`, sugerencias };
  }

  return { ok: true, city: ciudadOficial, state: dep.nombre };
}
