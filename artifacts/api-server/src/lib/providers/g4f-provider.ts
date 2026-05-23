import { logger } from "../logger";
import { G4F_ENABLED, G4F_PROVIDER, G4F_MODEL, G4F_TIMEOUT } from "../../config/g4f.config";

interface G4FMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface G4FResponse {
  content: string;
  provider?: string;
  model?: string;
}

let g4fInstance: any = null;

export async function initializeG4F(): Promise<boolean> {
  if (!G4F_ENABLED) {
    logger.debug("[G4F] G4F está deshabilitado en .env");
    return false;
  }
  try {
    if (!g4fInstance) {
      const g4fModule = await import("g4f");
      g4fInstance = new g4fModule.G4F();
    }
    logger.info("[G4F] Módulo g4f cargado exitosamente");
    return true;
  } catch (error) {
    logger.warn({ error }, "[G4F] No se pudo cargar el módulo g4f");
    return false;
  }
}

export async function getG4FResponse(
  messages: G4FMessage[],
  model: string = G4F_MODEL
): Promise<G4FResponse | null> {
  if (!G4F_ENABLED) return null;
  if (!g4fInstance) {
    const ok = await initializeG4F();
    if (!ok) return null;
  }

  try {
    logger.debug({ model, provider: G4F_PROVIDER, messageCount: messages.length }, "[G4F] Solicitando respuesta");
    const startTime = Date.now();

    const response = await Promise.race([
      g4fInstance.chatCompletion(messages, {
        model,
        provider: G4F_PROVIDER === "auto" ? undefined : G4F_PROVIDER,
      }),
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
      for (const key of ["text", "message", "content", "response"]) {
        if (key in response && typeof response[key] === "string") {
          content = response[key];
          break;
        }
      }
      if (!content) content = JSON.stringify(response);
    }

    if (!content) throw new Error("No content received from G4F");

    logger.info({ provider: G4F_PROVIDER, model, responseTime: `${responseTime}ms` }, "[G4F] Respuesta exitosa");
    return { content, provider: G4F_PROVIDER, model };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMsg, model, provider: G4F_PROVIDER }, "[G4F] Error al obtener respuesta");
    return null;
  }
}

export async function checkG4FHealth(): Promise<boolean> {
  if (!G4F_ENABLED) return false;
  try {
    const response = await getG4FResponse(
      [{ role: "user", content: "¿Estás disponible?" }],
      "gpt-4"
    );
    return response !== null && response.content.length > 0;
  } catch {
    return false;
  }
}

export async function* streamG4FResponse(
  messages: G4FMessage[],
  model: string = G4F_MODEL
): AsyncGenerator<string, void, unknown> {
  if (!G4F_ENABLED || !g4fInstance) return;
  try {
    const response = await g4fInstance.chatCompletion(messages, {
      model,
      provider: G4F_PROVIDER === "auto" ? undefined : G4F_PROVIDER,
      stream: true,
    });
    for await (const chunk of response) {
      if (chunk) yield chunk;
    }
  } catch (error) {
    logger.warn({ error }, "[G4F] Error en streaming");
  }
}

export async function getAvailableG4FProviders(): Promise<{ name: string; defaultModel: string; working: boolean }[]> {
  if (!g4fInstance) {
    const ok = await initializeG4F();
    if (!ok) return [];
  }
  try {
    return Object.entries(g4fInstance.providers)
      .filter(([_, p]: any) => p.type === "ChatCompletion")
      .map(([name, p]: any) => ({
        name,
        defaultModel: p.default_model || "unknown",
        working: p.working !== false,
      }));
  } catch {
    return [];
  }
}

export async function getG4FImage(
  prompt: string,
  options?: { width?: number; height?: number }
): Promise<{ image: string; provider: string } | null> {
  if (!G4F_ENABLED) return null;
  if (!g4fInstance) {
    const ok = await initializeG4F();
    if (!ok) return null;
  }

  const providers = Object.entries(g4fInstance.providers)
    .filter(([_, p]: any) => p.type === "ImageGeneration" && p.working !== false)
    .map(([name]) => name);

  if (providers.length === 0) {
    logger.warn("[G4F-Image] No hay proveedores de imagen disponibles");
    return null;
  }

  for (const provider of providers) {
    try {
      const startTime = Date.now();
      const result = await Promise.race([
        g4fInstance.imageGeneration(prompt, {
          provider,
          width: options?.width || 1024,
          height: options?.height || 1024,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("G4F image timeout")), (G4F_TIMEOUT || 60) * 1000)
        ),
      ]);

      const responseTime = Date.now() - startTime;

      if (result) {
        if (typeof result === "object" && result.images?.[0]) {
          logger.info({ provider, responseTime: `${responseTime}ms` }, "[G4F-Image] Imagen generada");
          return { image: result.images[0], provider };
        }
        if (typeof result === "object" && result.base64) {
          return { image: result.base64, provider };
        }
        if (typeof result === "string" && result.startsWith("http")) {
          logger.info({ provider, responseTime: `${responseTime}ms` }, "[G4F-Image] URL generada");
          return { image: result, provider };
        }
        if (typeof result === "string") {
          return { image: result, provider };
        }
        const json = JSON.stringify(result);
        if (json.length > 50) {
          return { image: json, provider };
        }
      }
    } catch (error) {
      logger.warn({ provider, error }, "[G4F-Image] Proveedor falló, probando siguiente");
    }
  }
  return null;
}

export async function getAvailableG4FImageProviders(): Promise<{ name: string; working: boolean }[]> {
  if (!g4fInstance) {
    const ok = await initializeG4F();
    if (!ok) return [];
  }
  try {
    return Object.entries(g4fInstance.providers)
      .filter(([_, p]: any) => p.type === "ImageGeneration")
      .map(([name, p]: any) => ({
        name,
        working: p.working !== false,
      }));
  } catch {
    return [];
  }
}
