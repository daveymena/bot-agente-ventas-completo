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
export const PROVEEDORES_RAPIDOS = [
  // Copilot primero: es la cuenta de PAGO del admin y la de mejor calidad del
  // resto. La cadena del bot de ventas ya lo tiene segundo (agent.ts:1625);
  // la de Atlas no lo tenia. Se listan varias grafias porque el id depende de
  // como lo nombre OpenCode, y no se puede verificar desde aca: el que no
  // exista simplemente no aparece en el catalogo y se ignora.
  "github-copilot", "github_copilot", "copilot",
  "groq", "cerebras", "nvidia_nim", "opencode_go",
  // "github" (GitHub Models) queda FUERA a proposito: GitHub lo esta
  // retirando. Verificado el 2026-08-19 contra los dos endpoints -- el viejo
  // devuelve 404 y el nuevo 410 "retirement brownout" -- y confirmado el
  // 2026-08-24 probando `github/gpt-4o-mini`, que da error de conexion. No es
  // configuracion del admin: el proveedor esta apagado. Lo que SI sirve es
  // Copilot, que es otra cosa y usa el token de la conexion, no GITHUB_TOKEN
  // de "Modelos de pago" (ver ai-keys.ts:180).
];

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

// ─── Memoria de fallos: que no reintente lo que ya se sabe que no anda ──────
//
// La rotación automática ya existía: por eso el trace del 2026-08-24 muestra
// SEIS candidatos probados en un turno. Lo que NO existía es memoria. Atlas
// reintentaba deepseek --sin saldo-- en CADA mensaje, para siempre. Barato por
// turno (1,2s), pero nunca aprende: el usuario lo dijo bien, "si uno no
// funciona que pruebe otro" tiene que incluir "y que se acuerde".
//
// El clasificador con enfriamientos ya estaba escrito y probado en
// optimized-rotation.ts (sin_credito 6h, cuota_agotada 1h, modelo_caido 30s),
// pero lo usaba solo el bot de ventas: el operador de Atlas no lo llamaba ni
// una vez. Acá se reutiliza, no se reescribe.

interface Castigo { hasta: number; motivo: string }

/** Clave por MODELO, no por proveedor: que un modelo esté muerto no significa
 *  que el proveedor lo esté (ya costó apartar DeepSeek entero por culpa de su
 *  modelo `vision-exp`, ver optimized-rotation.ts). */
const enPenitencia = new Map<string, Castigo>();

const claveDe = (c: Candidato) => `${c.providerID}|${c.modelID}`;

/** Registra que este candidato falló, con el enfriamiento que corresponda. */
export function anotarFallo(
  candidato: Candidato,
  error: string,
  clasificar: (e?: string) => { cooldownMs: number; inmediato: boolean },
  ahora = Date.now(),
): void {
  const { cooldownMs, inmediato } = clasificar(error);
  // Los no-terminales (un timeout suelto, un 500) no apartan a nadie: pueden
  // ser un mal momento del proveedor y castigarlo por eso deja a Atlas con
  // menos opciones de las que tiene.
  if (!inmediato) return;
  enPenitencia.set(claveDe(candidato), { hasta: ahora + cooldownMs, motivo: error.slice(0, 80) });
}

/** Saca los que están enfriándose, SIN dejar la cadena vacía. */
export function filtrarEnfriados(cadena: Candidato[], ahora = Date.now()): Candidato[] {
  const vivos = cadena.filter((c) => {
    const p = enPenitencia.get(claveDe(c));
    if (!p) return true;
    if (p.hasta <= ahora) { enPenitencia.delete(claveDe(c)); return true; }
    return false;
  });
  // Si TODOS están castigados, se intenta igual con la cadena completa: es
  // preferible perder unos segundos reintentando a dejar al admin sin ninguna
  // respuesta. El enfriamiento es una optimización, no un candado.
  return vivos.length > 0 ? vivos : cadena;
}

/** Para diagnóstico y para los tests. */
export function olvidarFallos(): void {
  enPenitencia.clear();
}
