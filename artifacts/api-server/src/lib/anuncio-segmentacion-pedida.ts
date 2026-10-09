/**
 * La segmentación que el admin acordó con Atlas, en el formato del borrador
 * (strategy.ageMin/ageMax/ciudades/genders/interests, que la subida a Meta ya
 * sabe leer: ad-strategist.ts → createAdForProduct).
 *
 * Producción 07/08-10: Atlas conversó "25-55 años, Bogotá, Medellín, Cali,
 * Barranquilla, Bucaramanga y Cartagena" y lo confirmó, pero crear_anuncio no
 * tenía cómo recibirlo: el anuncio salió 18-65 a todo el país.
 */

export interface EstrategiaDeSegmentacion {
  ageMin?: number;
  ageMax?: number;
  ciudades?: string[];
  genders?: number[];
  interests?: string[];
}

const lista = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

export function segmentacionPedida(args: any): { estrategia: EstrategiaDeSegmentacion } {
  const e: EstrategiaDeSegmentacion = {};
  const min = Number(args?.edadMin), max = Number(args?.edadMax);
  if (Number.isFinite(min) && min >= 18 && min <= 65) e.ageMin = Math.round(min);
  if (Number.isFinite(max) && max >= 18 && max <= 65) e.ageMax = Math.round(max);
  if (e.ageMin && e.ageMax && e.ageMin > e.ageMax) [e.ageMin, e.ageMax] = [e.ageMax, e.ageMin];
  const ciudades = lista(args?.ciudades);
  if (ciudades.length) e.ciudades = [...new Set(ciudades)].slice(0, 25);
  const g = String(args?.generos || "").toLowerCase();
  if (/mujer|femen/.test(g)) e.genders = [2];
  else if (/hombre|mascul/.test(g)) e.genders = [1];
  const intereses = lista(args?.intereses);
  if (intereses.length) e.interests = intereses.slice(0, 10);
  return { estrategia: e };
}

/** Una línea para el admin con lo que QUEDÓ guardado. Vacía si no hay nada. */
export function describirSegmentacion(st: any): string {
  const partes: string[] = [];
  if (st?.ageMin || st?.ageMax) partes.push(`${st.ageMin ?? 18}–${st.ageMax ?? 65} años`);
  if (Array.isArray(st?.genders) && st.genders.length === 1) partes.push(st.genders[0] === 2 ? "mujeres" : "hombres");
  if (Array.isArray(st?.ciudades) && st.ciudades.length) partes.push(`en ${st.ciudades.join(", ")}`);
  if (Array.isArray(st?.interests) && st.interests.length) partes.push(`intereses: ${st.interests.join(", ")}`);
  return partes.join(" · ");
}
