/**
 * Convierte lo que un modelo escribe como "entrega", "garantía" o "acceso"
 * en el objeto que `business-context.ts` sabe leer.
 *
 * Atlas manda seguido `"entrega": "3 a 5 días hábiles, envío incluido"` en
 * vez de `{ metodo, plazo }`. Guardar el string tal cual no rompe nada y por
 * eso nadie lo vio: `leerEntrega` devuelve null en silencio y el agente le
 * dice al cliente que no sabe cómo se entrega, mientras el admin leyó
 * "✅ Perfil actualizado: entrega". Acá se acepta el texto y se arma el objeto;
 * lo que no se pueda armar se devuelve null para que el llamador lo reporte.
 */

export interface EntregaPerfil { metodo: string; plazo: string; detalle?: string }
export interface GarantiaPerfil { dias?: number; descripcion?: string }
export interface AccesoPerfil { tipo: string; descripcion?: string }

const limpio = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** "3 a 5 días hábiles", "entre 2 y 4 dias", "24 horas", "inmediato". */
const PLAZO = /(?:entre\s+)?\d+\s*(?:a|y|-|–)\s*\d+\s*d[ií]as?(?:\s*h[aá]biles)?|\d+\s*d[ií]as?(?:\s*h[aá]biles)?|\d+\s*horas?|inmediat[oa]|al instante|el mismo d[ií]a/i;

export function entregaDesdeTexto(raw: unknown): EntregaPerfil | null {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const metodo = limpio(o.metodo ?? o.method);
    if (!metodo) {
      // Objeto sin método pero con texto en otro campo: se intenta igual.
      const texto = limpio(o.plazo ?? o.detalle ?? o.descripcion ?? o.texto);
      return texto ? entregaDesdeTexto(texto) : null;
    }
    return {
      metodo,
      plazo: limpio(o.plazo ?? o.timeframe) || (PLAZO.exec(metodo)?.[0] ?? "sin plazo definido"),
      detalle: limpio(o.detalle ?? o.details) || undefined,
    };
  }
  const texto = limpio(raw);
  if (!texto) return null;
  const plazo = PLAZO.exec(texto)?.[0]?.trim();
  return {
    // El texto entero es el método: es lo más honesto que se puede hacer sin
    // inventar. El plazo se saca del mismo texto cuando lo trae.
    metodo: texto,
    plazo: plazo || "sin plazo definido",
    detalle: undefined,
  };
}

export function garantiaDesdeTexto(raw: unknown): GarantiaPerfil | null {
  if (raw === null) return null;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const dias = Number(o.dias ?? o.days);
    const descripcion = limpio(o.descripcion ?? o.description);
    if (!(Number.isFinite(dias) && dias > 0) && !descripcion) return null;
    return { ...(Number.isFinite(dias) && dias > 0 ? { dias } : {}), ...(descripcion ? { descripcion } : {}) };
  }
  const texto = limpio(raw);
  if (!texto) return null;
  // "no hay garantía" / "no ofrecer garantías" NO es una garantía: es una
  // restricción. Guardarla como garantía haría que el agente la prometa.
  if (/^\s*(no|sin)\b/i.test(texto)) return null;
  const dias = Number(/(\d+)\s*d[ií]as?/i.exec(texto)?.[1]);
  return { ...(Number.isFinite(dias) && dias > 0 ? { dias } : {}), descripcion: texto };
}

export function accesoDesdeTexto(raw: unknown): AccesoPerfil | null {
  if (raw === null) return null;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const tipo = limpio(o.tipo ?? o.type);
    const descripcion = limpio(o.descripcion ?? o.description);
    if (!tipo) return descripcion ? { tipo: descripcion } : null;
    return { tipo, ...(descripcion ? { descripcion } : {}) };
  }
  const texto = limpio(raw);
  return texto ? { tipo: texto } : null;
}
