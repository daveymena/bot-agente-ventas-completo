/**
 * DEEPSEEK ES EL TRONCO. SIEMPRE.
 *
 * Orden del admin, 2026-09-03: "la IA por defecto principal siempre va a ser
 * DeepSeek".
 *
 * Y no lo era en un camino entero del código. `agent.ts` mira
 * `appSettings.aiProvider` --el proveedor elegido en la pantalla de
 * Configuración-- y, cuando hay uno, arma la cola con ESE SOLO:
 *
 *     } else if (isUserSelected) {
 *       rotationQueue.push({ config: dbConfig, source: activeProvider });  // exclusivo
 *
 * DeepSeek recién aparecía en la fase 2, o sea después de que el elegido
 * fallara y se gastara su tiempo. Con una clave paga cargada, medida en 1,16 s
 * y con saldo, el cliente de WhatsApp esperaba primero a otro.
 *
 * Es la tercera vez que aparece el mismo patrón en este proyecto: **que el
 * admin cargue una clave paga no significa que el código la use.** Ya pasó con
 * `connected` en operator-opencode y con `settings.aiProvider` en
 * marketing-team/ai. Por eso la regla vive acá, con pruebas, en vez de ser una
 * línea suelta adentro de una función de 400 renglones.
 *
 * ── Lo que esta regla NO hace ─────────────────────────────────────────────
 *
 * No borra la elección del admin: la deja JUSTO DETRÁS. Si DeepSeek se queda
 * sin saldo o se cae, lo que él eligió contesta igual. Poner algo primero y
 * sacar lo demás son dos decisiones distintas, y acá solo se toma la primera.
 *
 * Y no se mete con las claves propias del cliente (`clavesPropias` en
 * agent.ts): esas son la cuenta de OTRO negocio y siguen mandando sobre todo,
 * que es lo correcto -- es su plata.
 */

export interface EstadoDeDeepSeek {
  /** ¿Hay clave cargada? Puede venir del entorno o del panel: `ai-keys.ts` vuelca las dos a process.env. */
  hayClave: boolean;
  /** ¿El monitor de salud lo da por sano? Un proveedor apartado no encabeza nada. */
  sano: boolean;
  /** Lo que el admin eligió en Configuración ("none" si no eligió). */
  proveedorElegido: string;
}

/**
 * ¿Hay que poner a DeepSeek al frente de la cola de este turno?
 *
 * Devuelve false cuando el admin ya eligió DeepSeek: en ese caso ya está
 * primero y agregarlo otra vez sería intentar el mismo modelo dos veces
 * seguidas, que es tiempo del cliente tirado.
 */
export function deepseekVaPrimero(estado: EstadoDeDeepSeek): boolean {
  if (!estado.hayClave) return false;
  if (!estado.sano) return false;
  if (estado.proveedorElegido === "deepseek") return false;
  return true;
}
