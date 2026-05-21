import { logger } from "../logger";
import { G4F_ENABLED, G4F_PROVIDER, G4F_MODEL, G4F_TIMEOUT } from "../../config/g4f.config";

/**
 * G4F Provider Integration
 * Usa gpt4free para acceso a 111+ proveedores de IA
 * Respaldo final cuando todos los proveedores pagos se agotan
 */

interface G4FMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface G4FResponse {
  content: string;
  provider?: string;
  model?: string;
}

let g4fModule: any = null;

/**
 * Inicializa el módulo de G4F
 */
export async function initializeG4F(): Promise<boolean> {
  if (!G4F_ENABLED) {
    logger.debug("[G4F] G4F está deshabilitado en .env");
    return false;
  }

  try {
    if (!g4fModule) {
      g4fModule = await import("g4f");
    }
    logger.info("[G4F] Módulo g4f cargado exitosamente");
    return true;
  } catch (error) {
    logger.warn({ error }, "[G4F] No se pudo cargar el módulo g4f. ¿Está instalado? npm install g4f");
    return false;
  }
}

/**
 * Obtiene respuesta de G4F con manejo de errores
 */
export async function getG4FResponse(
  messages: G4FMessage[],
  model: string = G4F_MODEL
): Promise<G4FResponse | null> {
  if (!G4F_ENABLED) {
    return null;
  }

  if (!g4fModule) {
    const initialized = await initializeG4F();
    if (!initialized) return null;
  }

  try {
    logger.debug(
      { model, provider: G4F_PROVIDER, messageCount: messages.length },
      "[G4F] Solicitando respuesta"
    );

    const startTime = Date.now();

    const response = await Promise.race([
      g4fModule.ChatCompletion.create({
        model: model,
        messages: messages,
        provider: G4F_PROVIDER === "auto" ? undefined : G4F_PROVIDER,
        timeout: G4F_TIMEOUT || 30,
      }),
      // Timeout adicional como respaldo
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("G4F timeout")), (G4F_TIMEOUT || 30) * 1000)
      ),
    ]);

    const responseTime = Date.now() - startTime;

    let content = "";
    if (typeof response === "string") {
      content = response;
    } else if (response && typeof response === "object" && "content" in response) {
      content = response.content;
    } else if (typeof response === "object") {
      // Intenta obtener el contenido del objeto
      for (const key of ["text", "message", "content", "response"]) {
        if (key in response && typeof response[key] === "string") {
          content = response[key];
          break;
        }
      }
      if (!content) {
        content = JSON.stringify(response);
      }
    }

    if (!content) {
      throw new Error("No content received from G4F");
    }

    logger.info(
      { provider: G4F_PROVIDER, model, responseTime: `${responseTime}ms` },
      "[G4F] Respuesta exitosa"
    );

    return {
      content,
      provider: G4F_PROVIDER,
      model,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: errorMsg, model, provider: G4F_PROVIDER },
      "[G4F] Error al obtener respuesta"
    );
    return null;
  }
}

/**
 * Verifica si G4F está disponible
 */
export async function checkG4FHealth(): Promise<boolean> {
  if (!G4F_ENABLED) {
    return false;
  }

  try {
    const response = await getG4FResponse(
      [{ role: "user", content: "¿Estás disponible?" }],
      "gpt-3.5-turbo"
    );
    
    return response !== null && response.content.length > 0;
  } catch (error) {
    logger.warn({ error }, "[G4F] Health check falló");
    return false;
  }
}

/**
 * Streaming de respuesta de G4F (si se implementa en el futuro)
 */
export async function* streamG4FResponse(
  messages: G4FMessage[],
  model: string = G4F_MODEL
): AsyncGenerator<string, void, unknown> {
  if (!G4F_ENABLED || !g4fModule) {
    return;
  }

  try {
    const response = await g4fModule.ChatCompletion.create({
      model: model,
      messages: messages,
      provider: G4F_PROVIDER === "auto" ? undefined : G4F_PROVIDER,
      timeout: G4F_TIMEOUT || 30,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk) {
        yield chunk;
      }
    }
  } catch (error) {
    logger.warn({ error }, "[G4F] Error en streaming");
  }
}

/**
 * Obtiene lista de proveedores disponibles (para debugging)
 */
export async function getAvailableG4FProviders(): Promise<string[]> {
  if (!g4fModule) {
    const initialized = await initializeG4F();
    if (!initialized) return [];
  }

  try {
    const providers = g4fModule.Provider
      ? Object.keys(g4fModule.Provider).filter((p) => typeof p === "string")
      : [];
    return providers;
  } catch {
    return [];
  }
}
