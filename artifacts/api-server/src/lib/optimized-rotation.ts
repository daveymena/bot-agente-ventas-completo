/**
 * ⚡ OPTIMIZED PROVIDER ROTATION SYSTEM
 * Auto-descarta proveedores muertos y rota entre disponibles
 * Sin cambios en código existente - Funciona transparentemente
 */

import { logger } from "./logger";

// ============================================================================
// 🔥 AGGRESSIVE TIMEOUT CONFIG - Sin perder tiempo
// ============================================================================

interface ProviderStatus {
  name: string;
  available: boolean;
  lastFailTime?: Date;
  failureCount: number;
  successCount: number;
  avgResponseTime: number;
  skipUntil?: Date;  // Skip temporalmente si falla
}

/** Por qué falló, y cuánto conviene no volver a molestarlo. */
export type ClaseDeFallo =
  | "sin_credito"     // no hay medio de pago / saldo: no se arregla solo
  | "cuota_agotada"   // límite del plan gratuito: vuelve cuando resetea la ventana
  | "modelo_caido"    // ese MODELO no existe o no está disponible; el proveedor sí
  | "sin_clave"       // no hay credencial configurada
  | "lento"           // timeout o red: transitorio de verdad
  | "desconocido";

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

/**
 * Clasifica el error que devolvió un proveedor.
 *
 * Por FORMA del mensaje y no por lista cerrada de proveedores: cada gateway
 * escribe distinto ("No payment method", "CreditsError", "FreeUsageLimitError",
 * "Rate limit exceeded"), pero todos dicen alguna de estas cinco cosas.
 *
 * Los tiempos salen de lo medido el 2026-08-22:
 *  · sin crédito → hasta que alguien pague. 6h y volvemos a mirar.
 *  · cuota agotada → las ventanas gratuitas suelen resetear por día; el propio
 *    admin reportó "hasta dentro de 21 horas". Se reintenta cada hora, que es
 *    barato, en vez de en cada mensaje.
 *  · modelo caído → NO se aparta el proveedor: puede tener otros modelos que
 *    sirven. Cooldown corto para que la rotación pruebe otro.
 */
export function clasificarFallo(error?: string): {
  clase: ClaseDeFallo;
  cooldownMs: number;
  /** Terminal: no hace falta un segundo fallo para apartarlo. */
  inmediato: boolean;
} {
  const e = String(error || "").toLowerCase();

  if (/no payment method|creditserror|billing|add a payment|insufficient (credit|balance|funds)|payment required|402/.test(e)) {
    return { clase: "sin_credito", cooldownMs: 6 * HORA, inmediato: true };
  }
  // `try again in <n>` entra acá aunque el mensaje no diga "rate limit": es
  // literalmente lo que contesta un limitador cuando te pasaste de la ventana.
  // Sin esto, "Please try again in 4 minutes" caía en la rama de modelo caído
  // y se reintentaba a los 30 s, dentro de la misma ventana que lo rechazó.
  if (/rate limit|freeusagelimit|quota|usage limit|too many requests|\b429\b|limit exceeded|try again (later|tomorrow|in [\d.]+)/.test(e)) {
    // ── No todo 429 dura lo mismo ──────────────────────────────────────
    //
    // Apartar UNA HORA a quien se pasó de un límite POR MINUTO es cambiar un
    // minuto malo por una hora mala. El tope de Groq son 8.000 tokens por
    // minuto y se recupera solo al minuto siguiente; con una hora de castigo,
    // un pico de tráfico dejaba al único proveedor vivo fuera de juego y TODOS
    // los turnos de esa hora caían en los modelos muertos de más abajo.
    //
    // Es lo que el admin veía una y otra vez: "poolside/laguna-xs-2.1:free is
    // temporarily rate-limited upstream" -- laguna es el SÉPTIMO candidato, y
    // el turno solo llega ahí si los seis de arriba no contestaron.
    //
    // Y la respuesta trae el dato: Groq contesta "Please try again in 5.3s",
    // OpenAI y OpenRouter usan la misma forma. Si el proveedor dice cuánto
    // esperar, se le hace caso -- con un mínimo de 60s para no volver a
    // golpear la misma ventana, y un techo de 10 min por si el número viene
    // raro.
    const dijoCuanto = e.match(/try again in ([\d.]+)\s*(ms|s|m|second|minute|hour)/);
    if (dijoCuanto) {
      const n = Number(dijoCuanto[1]);
      const unidad = dijoCuanto[2];
      const ms = unidad === "ms" ? n
        : unidad.startsWith("m") && unidad !== "ms" && unidad !== "minute" ? n * 60_000
        : unidad === "minute" ? n * 60_000
        : unidad === "hour" ? n * 60 * 60_000
        : n * 1000;
      if (Number.isFinite(ms) && ms > 0) {
        return { clase: "cuota_agotada", cooldownMs: Math.min(Math.max(ms, 60_000), 10 * 60_000), inmediato: true };
      }
    }
    // Un límite POR MINUTO declarado como tal también se reintenta pronto:
    // "tokens per minute", "TPM", "requests per minute". Es el tope de Groq.
    if (/per minute|per-minute|\btpm\b|\brpm\b/.test(e)) {
      return { clase: "cuota_agotada", cooldownMs: 90_000, inmediato: true };
    }
    // Y sin ninguna pista, LA HORA. Es deliberadamente conservador: las
    // ventanas gratuitas suelen resetear por día --el admin llegó a ver "hasta
    // dentro de 21 horas" en OpenCode Zen-- y reintentar cada 90 s algo que
    // vuelve mañana es gastar turnos de un cliente real esperando.
    //
    // O sea: se acorta el castigo solo cuando hay EVIDENCIA de que la ventana
    // es corta, no por sospecha.
    return { clase: "cuota_agotada", cooldownMs: 1 * HORA, inmediato: true };
  }
  // VA ANTES que el chequeo de credencial, y no es un detalle de estilo: el
  // gateway devuelve "401 Model ling-3.0-flash-free is not supported", y ese
  // 401 leído como "credencial inválida" apartaría al proveedor ENTERO por 6
  // horas — por UN modelo muerto de los 64 que tiene. Lo específico primero.
  if (/model (is )?(unavailable|not found)|does not exist|not supported|model_not_found|unknown model|respuesta vac[ií]a/.test(e)) {
    // El proveedor está vivo: se cayó ESE modelo. Apartarlo entero sería
    // tirar a la basura los otros modelos que sí responden.
    //
    // Entra acá también la "respuesta vacía" (200 sin una sola letra), que es
    // un modelo roto disfrazado de éxito. Medido el 2026-08-22 en la cuenta
    // real: `deepseek-v4-flash-vision-exp` contesta vacío siempre, mientras
    // `deepseek-v4-flash` y `deepseek-v4-pro` responden en ~293ms. Dejar que
    // el vision-exp aparte a DeepSeek sería perder el proveedor de PAGO por
    // culpa de uno de sus modelos.
    //
    // Pero dentro de esta clase hay dos cosas MUY distintas, y darles el mismo
    // enfriamiento de 30 segundos era tratar como pasajero algo que es
    // definitivo:
    //
    //   · "no existe / no tenés acceso" es PERMANENTE. Un modelo que la cuenta
    //     no puede usar no va a empezar a existir en 30 segundos. Medido contra
    //     la cuenta real (2026-08-25): `llama-3.1-8b-instant` y
    //     `llama-3.3-70b-versatile` devuelven 404 "does not exist or you do not
    //     have access to it" en TODOS los intentos. Con 30 s de enfriamiento se
    //     reintentan en cada turno, para siempre.
    //
    //   · "respuesta vacía" sí puede ser un mal momento del modelo.
    //
    // El enfriamiento largo es seguro porque la penitencia es por MODELO
    // (proveedor|modelo), no por proveedor: apartar 6 h a un modelo inexistente
    // no toca a los demás modelos de esa misma cuenta.
    // "unavailable" queda AFUERA a propósito: el mensaje real que se vio es
    // "Upstream request failed: Model is unavailable", que suena a tropiezo del
    // proveedor de arriba y puede volver solo. Acá van las que dicen, sin
    // ambigüedad, que ese modelo no está disponible para ESTA cuenta.
    const inexistente = /does not exist|do not have access|not supported|model_not_found|unknown model/.test(e);
    if (inexistente) {
      return { clase: "modelo_caido", cooldownMs: 6 * HORA, inmediato: true };
    }
    return { clase: "modelo_caido", cooldownMs: 30 * 1000, inmediato: false };
  }
  if (/no (api )?key|missing (api )?key|unauthorized|invalid api key|bad credentials|\b401\b/.test(e)) {
    return { clase: "sin_clave", cooldownMs: 6 * HORA, inmediato: true };
  }
  if (/timed out|timeout|etimedout|econnreset|enotfound|socket hang up|network|fetch failed/.test(e)) {
    // Acá había DOS fallos distintos con el mismo castigo, y no cuestan lo
    // mismo ni por asomo:
    //
    //   · Un tropiezo de red (ENOTFOUND, fetch failed, socket hang up) falla
    //     en el acto. Reintentarlo es barato, y suele ser de verdad pasajero:
    //     ese es el caso para el que se eligió el enfriamiento corto.
    //
    //   · Un TIMEOUT es lo contrario: el modelo se queda con la conexión toda
    //     la ventana --55 s medidos-- y no devuelve una letra. Es el fallo más
    //     caro que existe en la rotación, y tenía el castigo más blando de
    //     todos: un "sin crédito" se detecta en 0,3 s y aparta 6 horas.
    //
    // Trace del admin (2026-08-24): 131 de los 135 s del turno se fueron en
    // tres modelos que agotaron su ventana. Con 2 minutos de enfriamiento
    // volvían a estar disponibles antes de que terminara de leer la respuesta.
    //
    // Pasarse de castigo no es riesgoso: `filtrarEnfriados` nunca devuelve la
    // cadena vacía --si todos están apartados los intenta igual--, así que el
    // enfriamiento solo puede cambiar el ORDEN, nunca dejar a Atlas sin nada.
    const seColgo = /timed out|timeout|etimedout|abort/.test(e);
    return { clase: "lento", cooldownMs: seColgo ? 15 * MINUTO : 2 * MINUTO, inmediato: false };
  }
  return { clase: "desconocido", cooldownMs: 30 * 1000, inmediato: false };
}

class OptimizedProviderRotation {
  private providers: Map<string, ProviderStatus> = new Map();
  private blacklist: Set<string> = new Set();
  private lastSuccessfulProvider: string | null = null;
  
  // Timeouts ULTRA-AGRESIVOS para EasyPanel (OPTIMIZADO PARA PRODUCCIÓN)
  private timeouts = {
    // De pago: responden rápido, y si tardan más que esto es que algo anda
    // mal — no conviene esperarlos con un cliente escribiendo del otro lado.
    deepseek: 12000,
    github_copilot_internal: 10000,
    opencode: 8000,
    opencode_go: 20000,
    opencode_zen: 15000,
    groq: 15000,
    github_copilot: 8000,
    ollama_local: 5000,
    nvidia: 8000,
    nvidia_nim_bridge: 8000,
    github_models: 8000,
  };

  // Cooldown muy corto para fallos (OPTIMIZADO)
  private cooldownDuration = 5 * 1000;  // 5 segundos (era 10)

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Si un proveedor no está en esta lista, `getAvailableProviders()` lo
    // descarta aunque el admin lo haya configurado: abajo se hace
    // `this.providers.get(provider)` y sin registro devuelve undefined.
    //
    // Es el mismo bug que dejó a groq afuera en agosto, repetido con los DOS
    // proveedores de pago del sistema: `deepseek` y `github_copilot_internal`
    // faltaban acá, faltaban en `conocidos` y faltaban en AI_FALLBACK_ORDER.
    // El admin pagó DeepSeek, `agent.ts` lo pone primero en su cola de
    // respaldo… y la primera fase igual se comía 6 proveedores muertos (~52s
    // medidos) antes de llegar a él.
    const providerList = [
      "deepseek",
      "github_copilot_internal",
      "groq",
      "opencode_go",
      "opencode_zen",
      "nvidia_nim_bridge",
      "opencode",
      "nvidia",
      "openrouter",
      "github",
    ];

    for (const name of providerList) {
      this.providers.set(name, {
        name,
        available: true,
        failureCount: 0,
        successCount: 0,
        avgResponseTime: 0
      });
    }
  }

  /**
   * Obtiene lista de proveedores en orden de rotación
   * Automáticamente descarta los que están en cooldown
   */
  getAvailableProviders(): string[] {
    const now = new Date();
    const available: string[] = [];

    // Priorizar el último que funcionó
    if (this.lastSuccessfulProvider) {
      const status = this.providers.get(this.lastSuccessfulProvider);
      if (status && !this.isInCooldown(this.lastSuccessfulProvider)) {
        available.push(this.lastSuccessfulProvider);
      }
    }

    // El orden sale de AI_FALLBACK_ORDER, no de una lista fija.
    //
    // Estaba incrustado como ["opencode","nvidia","openrouter","github"] y
    // GROQ NO FIGURABA. Ese era el ultimo eslabon del bug del 2026-08-16: el
    // admin tenia groq configurado en AI_FALLBACK_ORDER, groq responde en
    // 620ms con el catalogo completo, y aun asi el bot contestaba "Estoy
    // teniendo problemas tecnicos" a todo. Nunca llegaba: se filtraba acá,
    // antes que en ningun otro lado. Da igual cuantas ramas se agreguen mas
    // arriba si esta lista no lo nombra.
    //
    // Se respeta lo que el admin configura y se completa con los conocidos,
    // para no perder un proveedor por no estar en la variable.
    const configurado = (process.env.AI_FALLBACK_ORDER || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const conocidos = ["opencode", "opencode_go", "opencode_zen", "groq", "nvidia", "openrouter", "github"];

    // Lo que el admin PAGA va primero, tenga o no tenga AI_FALLBACK_ORDER.
    //
    // Depender de esa variable para los proveedores de pago es lo que rompió
    // esto: la variable enumera gratuitos (`opencode_go,groq,openrouter,
    // opencode,nvidia,github`) y nadie la actualizó al cargar la clave paga
    // desde el panel. Resultado: se paga un proveedor que responde en ~800ms y
    // el cliente espera 52 segundos mientras se agotan los muertos.
    //
    // La clave puede venir del .env o del panel — `ai-keys.ts` vuelca lo
    // guardado a process.env al arrancar —, así que se mira process.env, que
    // es donde terminan las dos.
    const dePago = [
      process.env.DEEPSEEK_API_KEY ? "deepseek" : null,
      process.env.COPILOT_SESSION_TOKEN || process.env.GITHUB_TOKEN ? "github_copilot_internal" : null,
    ].filter(Boolean) as string[];

    const order = [...new Set([...dePago, ...configurado, ...conocidos])];
    
    for (const provider of order) {
      // Saltar si ya está en la lista o en cooldown
      if (available.includes(provider)) continue;
      if (this.isInCooldown(provider)) continue;

      const status = this.providers.get(provider);
      if (status && status.available) {
        available.push(provider);
      }
    }

    // Si no hay proveedores disponibles, resetear cooldowns y devolver todos
    if (available.length === 0) {
      logger.warn("[OptimizedRotation] No providers available, resetting cooldowns");
      this.blacklist.clear();
      return order;
    }

    return available;
  }

  /**
   * Registra un éxito - marca el proveedor como bueno
   */
  reportSuccess(provider: string, responseTime: number) {
    const status = this.providers.get(provider);
    if (status) {
      status.successCount++;
      status.available = true;
      status.avgResponseTime = 
        (status.avgResponseTime * (status.failureCount + status.successCount - 1) + responseTime) / 
        (status.failureCount + status.successCount);
      status.failureCount = Math.max(0, status.failureCount - 1);  // Reduce counter
      this.lastSuccessfulProvider = provider;
      this.blacklist.delete(provider);
      
      logger.info(
        { provider, responseTime, avgTime: Math.round(status.avgResponseTime) },
        "[OptimizedRotation] ✅ Success"
      );
    }
  }

  /**
   * Registra un fallo - marca para skipear temporalmente
   *
   * No todos los fallos son iguales, y tratarlos igual es lo que hacía que un
   * mensaje tardara 52 segundos. Medido el 2026-08-22: `opencode_go` estaba
   * SIN CRÉDITO ("No payment method") y `deepseek-v4-flash-free` con la cuota
   * gratuita agotada hasta dentro de 21 horas -- y aun así el bot los volvía a
   * intentar en CADA mensaje, porque el cooldown era de 5 segundos y recién
   * después de 2 fallos. Cada reintento se lleva su timeout con un cliente
   * esperando del otro lado.
   *
   * Un proveedor sin crédito no se arregla en 5 segundos. Uno con la cuota
   * diaria agotada, tampoco. Hay que sacarlos del camino y usar los que sí
   * tienen con qué responder.
   */
  reportFailure(provider: string, error?: string) {
    const status = this.providers.get(provider);
    if (!status) return;

    const { clase, cooldownMs, inmediato } = clasificarFallo(error);

    // Un modelo caído NO es un fallo del proveedor, así que ni siquiera le
    // cuenta: si contara, dos respuestas vacías del vision-exp bastarían para
    // apartar a DeepSeek entero — el proveedor de PAGO, el que responde en
    // 293ms — por culpa de uno solo de sus modelos. La rotación ya se encarga
    // de pasar al modelo siguiente.
    if (clase === "modelo_caido") {
      status.lastFailTime = new Date();
      logger.warn({ provider: clase, error }, "[OptimizedRotation] 🔀 Modelo caído — se prueba otro del mismo proveedor");
      return;
    }

    status.failureCount++;
    status.lastFailTime = new Date();

    // Los fallos terminales no necesitan una segunda opinión: si el proveedor
    // dice "no tenés medio de pago" o "se te acabó la cuota", el intento
    // siguiente va a decir exactamente lo mismo.
    if (inmediato || status.failureCount >= 2) {
      this.skipProvider(provider, cooldownMs);
      logger.warn(
        { provider, clase, minutos: Math.round(cooldownMs / 60000), failureCount: status.failureCount, error },
        "[OptimizedRotation] ⏸️  Proveedor apartado"
      );
    } else {
      logger.warn(
        { provider, clase, failureCount: status.failureCount, error },
        "[OptimizedRotation] ⚠️  Failure detected"
      );
    }
  }

  /**
   * Pone un proveedor en cooldown temporal
   */
  private skipProvider(provider: string, cooldownMs?: number) {
    this.blacklist.add(provider);
    const status = this.providers.get(provider);
    if (status) {
      status.skipUntil = new Date(Date.now() + (cooldownMs ?? this.cooldownDuration));
    }
  }

  /**
   * Verifica si un proveedor está en cooldown
   */
  private isInCooldown(provider: string): boolean {
    if (!this.blacklist.has(provider)) return false;

    const status = this.providers.get(provider);
    if (!status || !status.skipUntil) return true;

    // Checar si el cooldown expiró
    if (new Date() > status.skipUntil) {
      this.blacklist.delete(provider);
      status.skipUntil = undefined;
      status.failureCount = 0;
      return false;
    }

    return true;
  }

  /**
   * Obtiene timeout para un proveedor (para no perder tiempo)
   */
  getTimeout(provider: string): number {
    return (this.timeouts as any)[provider] || 3000;
  }

  /**
   * Obtiene estadísticas de salud
   */
  getHealth() {
    const health: any = {};
    
    for (const [name, status] of this.providers) {
      health[name] = {
        available: !this.isInCooldown(name),
        successCount: status.successCount,
        failureCount: status.failureCount,
        avgResponseTime: Math.round(status.avgResponseTime),
        inCooldown: this.isInCooldown(name)
      };
    }

    return health;
  }

  /**
   * Reset manual (en caso de necesidad)
   */
  reset() {
    this.blacklist.clear();
    this.lastSuccessfulProvider = null;
    
    for (const status of this.providers.values()) {
      status.failureCount = 0;
      status.available = true;
      status.skipUntil = undefined;
    }

    logger.info("[OptimizedRotation] 🔄 Reset manual executed");
  }
}

// ============================================================================
// 🌍 GLOBAL INSTANCE
// ============================================================================

export const optimizedRotation = new OptimizedProviderRotation();

// ============================================================================
// 📊 EXPORT PARA USAR EN agent.ts
// ============================================================================

/**
 * Obtiene proveedores en orden de rotación
 * Sin perder tiempo en proveedores muertos
 */
export function getOptimizedProviderOrder(): string[] {
  return optimizedRotation.getAvailableProviders();
}

/**
 * Reporta resultado de proveedor
 */
export function reportProviderResult(
  provider: string,
  success: boolean,
  responseTime?: number,
  error?: string
) {
  if (success && responseTime) {
    optimizedRotation.reportSuccess(provider, responseTime);
  } else {
    optimizedRotation.reportFailure(provider, error);
  }
}

/**
 * Obtiene timeout para proveedor (no perder tiempo)
 */
export function getProviderTimeout(provider: string): number {
  return optimizedRotation.getTimeout(provider);
}

/**
 * Obtiene salud del sistema
 */
export function getRotationHealth() {
  return optimizedRotation.getHealth();
}

/**
 * Reset del sistema
 */
export function resetProviderRotation() {
  optimizedRotation.reset();
}
