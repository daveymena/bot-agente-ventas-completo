/**
 * QUÉ MODELOS INTENTA ATLAS, Y EN QUÉ ORDEN.
 *
 * El problema, reportado el 2026-08-24 con el trace real: el turno se cortó a
 * los 135s habiendo intentado SEIS candidatos, dos sin crédito y cuatro
 * gratis lentos. El admin objetó, con razón: "tenemos github, tenemos opencode
 * zen, tenemos nvidia, imposible que ninguno sirva".
 *
 * Tenía razón, y la causa era esta: la cadena era una lista fija de cinco
 * candidatos más un respaldo. GitHub NO estaba en esa lista, así que por más
 * que su clave estuviera cargada, Atlas nunca lo intentaba. De OpenCode Zen
 * solo se usaba `big-pickle`. Los únicos que sí estaban eran los dos nemotron
 * de OpenRouter — justamente los que se comen 55s cada uno.
 *
 * Acá los candidatos que faltan se DESCUBREN del catálogo que OpenCode ya
 * devuelve en `/provider`, en vez de hardcodear ids de modelos que uno cree
 * que existen: un id inventado es un candidato más que quemar.
 *
 * Orden: primero los de la lista curada (medidos uno por uno, ver los
 * comentarios de operator-opencode.ts), después los descubiertos de
 * proveedores rápidos, y el respaldo gratis siempre último.
 */

export interface Candidato {
  providerID: string;
  modelID: string;
}

/**
 * Proveedores que valen la pena intentar antes que los gratis lentos, en
 * orden de rapidez esperada. Groq y Cerebras corren en hardware propio y
 * contestan en segundos; son exactamente lo que falta cuando el problema es
 * que todo lo demás se queda sin tiempo.
 *
 * Los que ya están en la lista curada no se repiten.
 */
export const PROVEEDORES_RAPIDOS = ["groq", "cerebras", "github", "nvidia_nim", "opencode_go"];

/**
 * Modelos que NO sirven para Atlas aunque el catálogo los ofrezca.
 *
 * Los de razonamiento gastan el presupuesto de tokens en `reasoning_content` y
 * devuelven `content` vacío (documentado en operator-opencode.ts). Los de
 * imagen/audio/embedding directamente no conversan.
 */
const NO_SIRVEN = /(embed|whisper|tts|audio|image|vision|guard|rerank|reasoner|thinking)/i;

/** ¿Este modelo puede llamar herramientas? Sin eso Atlas no ejecuta nada. */
function usaHerramientas(m: any): boolean {
  // El catálogo puede decirlo de varias formas según la versión; si NO dice
  // nada se asume que sí, porque descartar por un campo ausente dejaría fuera
  // a proveedores enteros. Solo se excluye cuando dice explícitamente que no.
  if (m?.tool_call === false || m?.toolCall === false || m?.supports_tools === false) return false;
  return true;
}

/**
 * Saca del catálogo de un proveedor el mejor modelo para conversar con
 * herramientas, o null si ninguno sirve.
 *
 * `modelos` puede venir como array de objetos, array de strings o mapa
 * id → definición: el shape cambió entre versiones de OpenCode y no se puede
 * verificar desde acá. Se aceptan las tres formas en vez de asumir una.
 */
export function elegirModelo(modelos: unknown): string | null {
  let entradas: Array<{ id: string; def: any }> = [];

  if (Array.isArray(modelos)) {
    entradas = modelos
      .map((m: any) => (typeof m === "string" ? { id: m, def: {} } : { id: String(m?.id ?? m?.name ?? ""), def: m }))
      .filter((e) => e.id);
  } else if (modelos && typeof modelos === "object") {
    entradas = Object.entries(modelos as Record<string, any>).map(([id, def]) => ({ id, def }));
  }

  const utiles = entradas.filter((e) => !NO_SIRVEN.test(e.id) && usaHerramientas(e.def));
  if (utiles.length === 0) return null;

  // Ante varios, el más chico suele ser el más rápido -- y acá el problema es
  // el tiempo, no la profundidad del razonamiento.
  const preferido = utiles.find((e) => /mini|small|fast|flash|instant|8b|7b/i.test(e.id));
  return (preferido || utiles[0]!).id;
}

/**
 * Arma la cadena completa de candidatos para el turno.
 *
 * Función pura: recibe lo que ya se sabe y devuelve la lista. Así se puede
 * probar sin levantar OpenCode.
 */
export function armarCadena(entrada: {
  /** La lista curada, en su orden de preferencia. */
  curados: Candidato[];
  /** Proveedores que OpenCode reporta como conectados. */
  conectados: Set<string>;
  /** ¿Tenemos nosotros la clave de este proveedor? */
  tenemosClave: (providerID: string) => boolean;
  /** Catálogo por proveedor, tal como lo devolvió OpenCode. */
  modelosPorProveedor: Map<string, unknown>;
  /** El gratis de siempre, que va último. */
  respaldo: Candidato;
}): Candidato[] {
  const { curados, conectados, tenemosClave, modelosPorProveedor, respaldo } = entrada;

  // Un candidato curado se intenta si está conectado O si tenemos su clave:
  // `connected` solo se enciende tras reiniciar el contenedor, así que una
  // clave recién cargada quedaría invisible (ya costó un turno el 2026-08-19).
  const disponibles = curados.filter((c) => conectados.has(c.providerID) || tenemosClave(c.providerID));

  const yaEstan = new Set(disponibles.map((c) => c.providerID));
  const descubiertos: Candidato[] = [];
  for (const providerID of PROVEEDORES_RAPIDOS) {
    if (yaEstan.has(providerID) || providerID === respaldo.providerID) continue;
    if (!conectados.has(providerID) && !tenemosClave(providerID)) continue;
    const modelID = elegirModelo(modelosPorProveedor.get(providerID));
    if (!modelID) continue;
    descubiertos.push({ providerID, modelID });
    yaEstan.add(providerID);
  }

  // Los rápidos descubiertos van ANTES que los gratis lentos de la lista
  // curada: si el pago no tiene saldo, lo que sigue tiene que ser algo que
  // conteste en segundos, no dos modelos que se comen 55s cada uno.
  const pagos = disponibles.filter((c) => !/:free$/i.test(c.modelID));
  const gratisLentos = disponibles.filter((c) => /:free$/i.test(c.modelID));

  return [...pagos, ...descubiertos, ...gratisLentos, respaldo];
}
