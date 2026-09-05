/**
 * VARIAS CUENTAS DE COPILOT, EN COLA.
 *
 * Pedido del admin (2026-08-24): tiene varias cuentas de Copilot propias y
 * activas, y quiere que cuando una se quede sin cuota el sistema siga con la
 * siguiente en vez de quedarse sin proveedor.
 *
 * Por qué no se podía antes: la configuración guarda UN token por proveedor
 * (`settings.githubToken`, que va a `process.env.GITHUB_TOKEN`). Conectar una
 * segunda cuenta pisaba la primera — había reemplazo, no cola.
 *
 * La parte difícil ya estaba hecha y no se toca: la rotación con memoria
 * (`cadena-modelos.ts` + `clasificarFallo`) ya aparta por 1 hora al candidato
 * que devuelve "cuota agotada" y sigue con el siguiente. Lo único que faltaba
 * era que hubiera MÁS DE UN candidato de Copilot que rotar.
 *
 * Acá cada token se convierte en su propio candidato con su propia clave. El
 * resto del sistema no se entera de que son la misma marca.
 */
import type { AIProviderConfig } from "@workspace/integrations-openai-ai-server";

/**
 * Normaliza lo que haya guardado en la configuración a una lista de tokens.
 *
 * Acepta varias formas porque la configuración vieja guardaba un solo string y
 * la nueva guarda una lista: mientras haya instalaciones con el formato viejo,
 * romper con él dejaría al admin sin Copilot justo al actualizar.
 *
 *  · `"tok"`                       → un token (formato viejo)
 *  · `["tok1","tok2"]`             → lista
 *  · `[{token:"tok1",cuenta:"a@b"}]` → lista con la cuenta de origen
 */
export function normalizarTokensDeCopilot(guardado: unknown): string[] {
  const salida: string[] = [];
  const agregar = (v: unknown) => {
    const t = typeof v === "string" ? v.trim() : "";
    // Sin duplicados: dos veces el mismo token no es una cuota más, es el
    // mismo límite pegándole dos veces a la misma cuenta.
    if (t && !salida.includes(t)) salida.push(t);
  };

  if (typeof guardado === "string") agregar(guardado);
  else if (Array.isArray(guardado)) {
    for (const item of guardado) {
      if (typeof item === "string") agregar(item);
      else if (item && typeof item === "object") agregar((item as any).token ?? (item as any).githubToken);
    }
  }
  return salida;
}

/**
 * Convierte un candidato de Copilot en uno por cada cuenta.
 *
 * `source` lleva el número de cuenta para que el desglose de tiempos que ve el
 * admin diga CUÁL se quedó sin cuota — "copilot" a secas no le sirve de nada
 * cuando tiene tres.
 *
 * El token NO se pone en `source` ni en ningún log: es una credencial.
 */
export function expandirPorCuenta(
  base: AIProviderConfig,
  tokens: string[],
): Array<{ config: AIProviderConfig; source: string }> {
  if (tokens.length === 0) return [];
  return tokens.map((apiKey, i) => ({
    config: { ...base, apiKey },
    source: `copilot#${i + 1}/${base.model}`,
  }));
}

/**
 * Lee las cuentas de Copilot configuradas.
 *
 * Sincrona y desde el entorno a proposito: se llama al armar la cadena de cada
 * turno, que no es un contexto async, y una consulta a la base por turno para
 * leer una credencial que ya esta en memoria seria puro costo.
 *
 * `cargarClavesEnEntorno()` (ai-keys.ts) es quien vuelca la configuracion
 * guardada al entorno, igual que hace con el resto de las claves.
 *
 * Devuelve [] si no hay ninguna, para que quien llame no agregue candidatos
 * vacios a la cadena: un candidato sin clave es un intento fallido garantizado
 * que igual se paga en segundos.
 */
export function cuentasDeCopilot(): string[] {
  let deLaLista: unknown = null;
  try {
    deLaLista = process.env.COPILOT_TOKENS ? JSON.parse(process.env.COPILOT_TOKENS) : null;
  } catch {
    // Un JSON mal formado no puede dejar sin Copilot: se cae al token unico.
    deLaLista = null;
  }
  const lista = normalizarTokensDeCopilot(deLaLista);
  return lista.length > 0 ? lista : normalizarTokensDeCopilot(process.env.GITHUB_TOKEN);
}

/**
 * ============================================================
 * LAS CUENTAS DE COPILOT SON DE CADA CLIENTE
 * ============================================================
 *
 * ⚠️ `cuentasDeCopilot()` (arriba) lee del ENTORNO, que es global al proceso.
 * O sea que devolvía las cuentas del DUEÑO para todos los clientes: cada
 * respuesta que el bot de cualquier cliente le daba a cualquier comprador
 * gastaba la cuota del dueño, y una sola cuenta agotada los dejaba a TODOS sin
 * IA al mismo tiempo.
 *
 * Y hay un riesgo más grande que la cuota: los términos de Copilot son para
 * asientos individuales o de empresa, no para dar servicio de IA a terceros
 * que pagan. Si GitHub lo lee como reventa, suspende la cuenta -- y con ella
 * caen todos los clientes de golpe.
 *
 * ── SIN RESPALDO A LA CUENTA DEL DUEÑO ────────────────────────────────────
 *
 * Decisión explícita del dueño (2026-09-05), y va contra la costumbre del
 * resto del archivo: los demás proveedores SÍ caen a la clave de la
 * plataforma cuando el cliente no puso la suya (ver ai-keys-tenant.ts). Acá
 * no. Un cliente que no conectó Copilot simplemente no lo tiene disponible y
 * usa otro proveedor -- DeepSeek responde en 1,7s medidos.
 *
 * El motivo es que el respaldo silencioso es justamente el problema: el dueño
 * termina pagando por quien no conecta, sin que nadie decida nada.
 */
export async function cuentasDeCopilotDelCliente(tenantId: number): Promise<string[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return [];
  try {
    const { db, tenants } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return normalizarTokensDeCopilot((fila as any)?.copilotTokens);
  } catch (e: any) {
    // Sin cuentas es el resultado correcto ante un error de lectura: es lo
    // mismo que "este cliente no conectó Copilot", y la cadena de modelos ya
    // sabe seguir con otro proveedor. Devolver las del dueño para "no dejarlo
    // sin IA" sería reintroducir en el catch justo lo que se quiso sacar.
    return [];
  }
}
