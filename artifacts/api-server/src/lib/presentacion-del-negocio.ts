/**
 * CÓMO SE PRESENTA UN NEGOCIO EN SU PÁGINA PÚBLICA: tienda o servicios.
 *
 * 09-10-2026, el dueño: "para servicios y abogacía, que no venden productos
 * físicos, no necesitan tiendas así como estas sino otro tipo de páginas".
 * Hasta acá /tienda/:slug mostraba SIEMPRE la vitrina (carrito, ofertas,
 * departamentos) y la landing de un servicio usaba el molde "tienda-directa"
 * (precio arriba y formulario de pedido). Un abogado vende confianza y una
 * consulta: quién es, en qué casos ayuda, cómo trabaja y cómo agendar.
 *
 * La regla: lo que el dueño eligió manda; si no eligió, un negocio cuyos
 * productos activos son TODOS servicios se presenta como servicios.
 */

export type Presentacion = "tienda" | "servicios";

export function presentacionDelNegocio(
  perfil: { presentacion?: unknown } | null | undefined,
  lineas: Array<string | null | undefined>,
): Presentacion {
  const elegida = String(perfil?.presentacion || "");
  if (elegida === "tienda" || elegida === "servicios") return elegida;
  const activas = lineas.filter(Boolean);
  if (activas.length > 0 && activas.every((l) => l === "servicio")) return "servicios";
  return "tienda";
}

/** Lo del perfil que puede verse en público. Nada interno (tono, noPuede, notas del agente). */
export interface PerfilPublico {
  descripcion?: string;
  cobertura?: string;
  horario?: string;
  agenda?: string;
  direccion?: string;
  modalidad?: string;
  credenciales?: string[];
}

const texto = (v: unknown, max: number) => {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : undefined;
};

export function perfilPublico(perfil: Record<string, unknown> | null | undefined): PerfilPublico {
  const p = perfil || {};
  const credenciales = Array.isArray(p.credenciales)
    ? (p.credenciales as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 8).map((c) => c.slice(0, 160))
    : [];
  const salida: PerfilPublico = {
    descripcion: texto(p.descripcion, 600),
    cobertura: texto(p.cobertura, 200),
    horario: texto(p.horario, 200),
    agenda: texto(p.agenda, 300),
    direccion: texto(p.direccion, 200),
    modalidad: texto(p.modalidad, 120),
    ...(credenciales.length ? { credenciales } : {}),
  };
  for (const k of Object.keys(salida) as Array<keyof PerfilPublico>) if (salida[k] === undefined) delete salida[k];
  return salida;
}
