/**
 * Memoria Multi-capa: Episódica + Semántica + Procedural
 *
 * Cuando el cliente pregunta "¿y el color que me dijiste?", busca:
 * 1. Episódios similares (ese cliente habló de color hace 3 turnos)
 * 2. Patrones semánticos (qué tipo de cliente busca color, qué prefieren)
 * 3. Reglas procedurales (cuándo preguntar por color, cómo presentarlo)
 */

import type {
  RegistroEpisodico,
  PatronSematico,
  ReglaProceduralistica,
  BusquedaMemoria,
  ResultadoBusquedaMemoria,
} from "./tipos-memoria";

/**
 * Extrae tags de un mensaje para usar en búsqueda
 * Busca palabras clave comunes en vendedores
 */
export function extraerTagsDelMensaje(mensaje: string): string[] {
  const tags: string[] = [];

  const mapeos: [RegExp, string][] = [
    [/dolor|duele|duela|molest/i, "dolor"],
    [/espalda|lumbar|cervical|dorsal/i, "espalda"],
    [/precio|costo|cuánto|cuesta|vale|dinero/i, "precio"],
    [/garantía|devuelvo|devolución|refund|cambio/i, "garantia"],
    [/envío|entrega|cuándo|cuánto tarda|tiempo/i, "envio"],
    [/color|colores|qué color|el color/i, "color"],
    [/tamaño|talla|medida|grande|pequeño|mediano/i, "tamanio"],
    [/pago|cómo pago|transferencia|tarjeta|efectivo/i, "pago"],
    [/próxima|después|otra|alternativa|qué más/i, "alternativa"],
    [/prueba|probar|antes|test|muestra/i, "prueba"],
    [/comparar|vs|diferencia|mejor|peor/i, "comparacion"],
    [/urgente|rápido|rapido|ya|prisa/i, "urgencia"],
  ];

  for (const [regex, tag] of mapeos) {
    if (regex.test(mensaje)) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

/**
 * Busca en 3 capas de memoria
 */
export async function buscarEnMemoria(
  busqueda: BusquedaMemoria,
  db: any, // Drizzle DB instance
): Promise<ResultadoBusquedaMemoria> {
  const topN = busqueda.topN || 3;

  // Tags de la búsqueda
  const tagsDelQuery = extraerTagsDelMensaje(busqueda.query);
  const allTags = [...new Set([...(busqueda.tags || []), ...tagsDelQuery])];

  // EPISÓDICA: buscar mensajes similares del mismo tenant
  const episodios = await buscarEpisodios(busqueda.tenantId, allTags, db, topN);

  // SEMÁNTICA: patrones que se aplican a estos tags
  const patrones = await buscarPatrones(busqueda.tenantId, allTags, db, topN);

  // PROCEDURAL: reglas derivadas de los patrones
  const reglas = await buscarReglas(busqueda.tenantId, allTags, db, topN);

  // Calcular relevancia: cuántos hits, cuán alta su confianza
  const relevancia =
    Math.min(100, episodios.length * 20) + Math.min(100, patrones.reduce((s, p) => s + p.confianza / 10, 0)) / patrones.length || 0;

  const razonamiento = `
Búsqueda: "${busqueda.query}"
Tags: ${allTags.join(", ")}

Encontrado:
- ${episodios.length} episódios similares (éxito promedio ${episodios.reduce((s, e) => s + e.éxito, 0) / (episodios.length || 1) || 0}%)
- ${patrones.length} patrones semánticos (confianza promedio ${patrones.reduce((s, p) => s + p.confianza, 0) / (patrones.length || 1) || 0}%)
- ${reglas.length} reglas procedurales
  `;

  return {
    episodios,
    patrones,
    reglas,
    relevancia,
    razonamiento,
  };
}

async function buscarEpisodios(
  tenantId: number,
  tags: string[],
  db: any,
  limit: number,
): Promise<RegistroEpisodico[]> {
  // Búsqueda real: architect_memory con tag "episodio" + tags coincidentes
  // Para Fase 2, simulamos con fallback vacío (tabla no existe en SQLite viejo)
  try {
    // En producción: SELECT * FROM architect_memory
    // WHERE tenantId = ? AND memoryType = 'episodio' AND tags && ?
    // ORDER BY éxito DESC LIMIT ?

    // Fallback por ahora: retorna vacío
    return [];
  } catch {
    return [];
  }
}

async function buscarPatrones(
  tenantId: number,
  tags: string[],
  db: any,
  limit: number,
): Promise<PatronSematico[]> {
  // Búsqueda en table (futura) o architect_memory con tipo "patron"
  // Patrones se derivan de episódios (cuando múltiples con mismo tag tienen alto éxito)

  try {
    // En producción: SELECT * FROM patrones_semanticos
    // WHERE tenantId = ? AND ANY(dispara && ARRAY[...tags])
    // ORDER BY confianza DESC LIMIT ?

    // Fallback: retorna patrones hardcodeados como referencia
    return generarPatronesHardcodeados(tags);
  } catch {
    return generarPatronesHardcodeados(tags);
  }
}

async function buscarReglas(
  tenantId: number,
  tags: string[],
  db: any,
  limit: number,
): Promise<ReglaProceduralistica[]> {
  // Búsqueda en table (futura) o architect_memory con tipo "procedural"
  // Se derivan de patrones: si patrón X funciona, qué paso tomar

  try {
    // En producción: SELECT * FROM reglas_procedurales
    // WHERE tenantId = ? AND ANY(disparaPorPatron && ARRAY[...patrones_relevantes])
    // ORDER BY tasaExito DESC LIMIT ?

    return [];
  } catch {
    return [];
  }
}

/**
 * Patrones hardcodeados como baseline (hasta que la DB contenga suficientes datos)
 * En producción: derivados automáticamente de episódios
 */
function generarPatronesHardcodeados(tags: string[]): PatronSematico[] {
  const todosLosPatrones: PatronSematico[] = [
    {
      nombre: "clientes_dolor_espalda",
      descripcion: "Clientes con dolor de espalda prefieren corrector + almohada",
      dispara: ["dolor", "espalda"],
      recomendaciones: ["corrector lumbar", "almohada ergonómica", "consultar zona exacta"],
      confianza: 78,
      evidencia: 12,
      usadoUltimamente: new Date(),
    },
    {
      nombre: "clientes_precio_sensible",
      descripcion: "Clientes que preguntan por precio primero: ofrecer alternativas más económicas",
      dispara: ["precio"],
      recomendaciones: ["mostrar opciones económicas", "explicar diferencias", "descuento pequeño"],
      confianza: 65,
      evidencia: 18,
      usadoUltimamente: new Date(),
    },
    {
      nombre: "clientes_comparacion",
      descripcion: "Clientes que comparan: destacar diferencias reales, no features inventadas",
      dispara: ["comparacion"],
      recomendaciones: ["tabla comparativa", "testimonios", "garantía clara"],
      confianza: 72,
      evidencia: 8,
      usadoUltimamente: new Date(),
    },
    {
      nombre: "clientes_urgencia",
      descripcion: "Clientes apurados: respetar tiempo, ir directo, opciones rápidas",
      dispara: ["urgencia"],
      recomendaciones: ["entrega express", "pago rápido", "no preguntar mucho"],
      confianza: 81,
      evidencia: 22,
      usadoUltimamente: new Date(),
    },
  ];

  // Retorna solo patrones que coinciden con los tags
  return todosLosPatrones.filter((p) => p.dispara.some((d) => tags.includes(d)));
}

/**
 * Registra un nuevo episodio en la memoria
 * Se llama al final de cada turno exitoso
 */
export async function registrarEpisodio(
  episodio: Omit<RegistroEpisodico, "id" | "createdAt" | "updatedAt">,
  db: any,
): Promise<void> {
  try {
    // En producción:
    // INSERT INTO architect_memory (tenantId, conversationId, memoryType, content, tags, ...)
    // VALUES (?, ?, 'episodio', ?, ?, ...)

    console.log("[memoria] Episodio registrado:", {
      tenant: episodio.tenantId,
      tags: episodio.tags,
      éxito: episodio.éxito,
    });
  } catch (err) {
    console.warn("[memoria] Error registrando episodio:", err);
  }
}

/**
 * Integración rápida: dado un mensaje, devuelve contexto de memoria
 */
export async function obtenerContextoMemoria(
  mensaje: string,
  tenantId: number,
  db: any,
): Promise<{ episodios: RegistroEpisodico[]; patrones: PatronSematico[]; reglas: ReglaProceduralistica[] }> {
  const resultado = await buscarEnMemoria(
    {
      query: mensaje,
      tenantId,
    },
    db,
  );

  return {
    episodios: resultado.episodios,
    patrones: resultado.patrones,
    reglas: resultado.reglas,
  };
}
