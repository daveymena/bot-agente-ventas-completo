/**
 * Backend de conteo para rate limiting, con Redis OPCIONAL.
 *
 * Por qué: el rate limiter guardaba los contadores en un Map en memoria. Eso
 * (a) se pierde en cada restart/deploy y (b) no se comparte entre instancias,
 * así que con varias réplicas cada una tiene su propio contador y el límite
 * real se multiplica (AUDIT_REPORT.md §1.2).
 *
 * Diseño sin dependencia dura: si `REDIS_URL` está configurado Y `ioredis`
 * está instalado, se usa Redis (contadores compartidos y persistentes). Si
 * no, se cae al Map en memoria (comportamiento actual). `ioredis` se carga con
 * import dinámico y está marcado como `external` en build.mjs, así que NO es
 * una dependencia obligatoria del bundle: para activarlo basta
 * `pnpm add ioredis` y definir REDIS_URL.
 */
import { logger } from "../lib/logger";

export interface RateLimitCount {
  totalHits: number;
  resetTime: Date;
}

// ── Fallback en memoria ───────────────────────────────────────────────────
const memStore = new Map<string, { count: number; resetTime: Date }>();

function incrementMemory(key: string, windowMs: number): RateLimitCount {
  const now = new Date();
  const existing = memStore.get(key);
  if (!existing || now > existing.resetTime) {
    const resetTime = new Date(now.getTime() + windowMs);
    memStore.set(key, { count: 1, resetTime });
    return { totalHits: 1, resetTime };
  }
  existing.count++;
  return { totalHits: existing.count, resetTime: existing.resetTime };
}

// Limpieza periódica del Map para que no crezca sin límite cuando no hay Redis.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memStore.entries()) {
    if (now > value.resetTime.getTime()) memStore.delete(key);
  }
}, 60_000).unref?.();

// ── Backend Redis (carga perezosa) ────────────────────────────────────────
let redisClient: any = null;
let redisResolved = false; // ya intentamos inicializar (con éxito o no)

async function getRedis(): Promise<any | null> {
  if (redisResolved) return redisClient;
  redisResolved = true;

  const url = process.env.REDIS_URL;
  if (!url) return null; // sin REDIS_URL, silenciosamente usamos memoria

  try {
    const mod: any = await import("ioredis");
    const Redis = mod.default || mod;
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    client.on("error", (err: any) =>
      logger.error({ err: err?.message }, "[RateLimit][Redis] error de conexión"),
    );
    redisClient = client;
    logger.info("[RateLimit] Redis conectado — contadores compartidos entre instancias");
    return client;
  } catch (err) {
    logger.warn(
      { err: (err as any)?.message },
      "[RateLimit] REDIS_URL está configurado pero no se pudo cargar ioredis — " +
        "usando memoria. Instala la dependencia con `pnpm add ioredis`.",
    );
    redisClient = null;
    return null;
  }
}

async function incrementRedis(
  client: any,
  key: string,
  windowMs: number,
): Promise<RateLimitCount> {
  const rlKey = `rl:${key}`;
  const count: number = await client.incr(rlKey);
  if (count === 1) {
    await client.pexpire(rlKey, windowMs);
  }
  let pttl: number = await client.pttl(rlKey);
  if (pttl < 0) {
    // La clave existe sin TTL (raro): reponemos la ventana.
    await client.pexpire(rlKey, windowMs);
    pttl = windowMs;
  }
  return { totalHits: count, resetTime: new Date(Date.now() + pttl) };
}

/**
 * Incrementa el contador de una clave dentro de su ventana y devuelve el total
 * de golpes y cuándo se reinicia. Usa Redis si está disponible; si Redis falla
 * en medio de una operación, cae a memoria para NO bloquear tráfico legítimo.
 */
export async function incrementRateLimit(
  key: string,
  windowMs: number,
): Promise<RateLimitCount> {
  const client = await getRedis();
  if (client) {
    try {
      return await incrementRedis(client, key, windowMs);
    } catch (err) {
      logger.error(
        { err: (err as any)?.message },
        "[RateLimit][Redis] fallo al incrementar — cayendo a memoria para esta petición",
      );
      return incrementMemory(key, windowMs);
    }
  }
  return incrementMemory(key, windowMs);
}
