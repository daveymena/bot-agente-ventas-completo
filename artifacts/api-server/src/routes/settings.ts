import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { db, settings, tenants } from "@workspace/db";
import { getCopilotSessionToken, getCopilotDeviceCode, pollCopilotToken } from "../lib/copilot";
import { encryptionService } from "../lib/encryption-service";
import { providerValidator } from "../lib/provider-validator";
import { costTracker } from "../lib/cost-tracker";
import { logger } from "../lib/logger";
import { requirePlatformOwner, esDuenoDeLaPlataforma } from "../middleware/requirePlatformOwner";
import { esValorEnmascarado, enmascararSecreto } from "../lib/secretos";
import { tokensCopilotGuardados } from '../lib/copilot-modelos';

const router: IRouter = Router();

router.get("/", async (req: any, res, next) => {
  try {
    const row = await getOrCreate();
    const datos: any = GetSettingsResponse.parse(serialize(row));
    // `settings` es UNA fila de la plataforma: la URL del Ollama del servidor
    // (expuesto sin autenticación) no es asunto de cada cliente.
    if (!esDuenoDeLaPlataforma(req)) datos.ollamaUrl = datos.ollamaUrl ? "(configurado por la plataforma)" : datos.ollamaUrl;
    return res.json(datos);
  } catch (e) {
    return next(e);
  }
});

/** Campos que nunca vuelven completos al navegador (ver serializeSettings). */
const SECRETOS_DE_IA = ["githubToken", "copilotSessionToken", "nvidiaApiKey"] as const;

router.patch("/", requirePlatformOwner(), async (req, res, next) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);
    if (body.aiProvider === 'github') return res.status(410).json({ message: 'GitHub Models fue retirado. Selecciona GitHub Copilot u otro proveedor disponible.' });
    if (typeof body.githubModel === 'string') body.githubModel = body.githubModel.trim();
    // Como al leer se devuelven enmascarados, el navegador puede reenviar la
    // MÁSCARA al guardar cualquier otro campo. Sin este filtro, guardar el
    // nombre del negocio pisaría el token real con "••••1234" y dejaría la IA
    // sin credenciales. Vacío o enmascarado = no lo toques.
    for (const campo of SECRETOS_DE_IA) {
      const v = (body as any)[campo];
      if (typeof v === "string" && (esValorEnmascarado(v) || v.trim() === "")) {
        delete (body as any)[campo];
      }
    }
    const current = await getOrCreate();
    const [updated] = await db
      .update(settings)
      .set(body)
      .where(eq(settings.id, current.id))
      .returning();
    // La elección del modelo se aplica sin reiniciar el servidor.
    if (updated?.aiProvider === 'github_copilot_internal' && updated.githubModel) {
      process.env.GITHUB_MODEL = updated.githubModel;
    }
    return res.json(UpdateSettingsResponse.parse(serialize(updated!)));
  } catch (e) {
    return next(e);
  }
});

/**
 * ============================================================
 * VARIAS CUENTAS DE COPILOT, EN COLA
 * ============================================================
 *
 * El admin lo pidió el 2026-08-24: tiene varias cuentas propias y quiere que
 * cuando una se queda sin cuota el sistema siga con la siguiente.
 *
 * ⚠️ Y esto es lo que faltaba para que funcionara. La rotación ya estaba
 * escrita y probada (`copilot-cuentas.ts` + `cadena-modelos.ts`: aparta 1 hora
 * al candidato que devuelve "cuota agotada" y sigue con el próximo).
 * `ai-keys.ts` YA LEÍA `row.copilotTokens` desde ese mismo día.
 *
 * Pero la columna no existía, no había endpoint que la escribiera y no había
 * campo en el panel. O sea: `ai-keys` leía `undefined` en silencio,
 * `COPILOT_TOKENS` no se poblaba nunca, y `cuentasDeCopilot()` caía al token
 * único. Había UN candidato, así que no había nada que rotar.
 *
 * Es el mismo patrón que dejó a Landing Studio sin ejecutar: código correcto
 * leyendo algo que nadie creó. El admin lo resumió como "eso está implementado
 * pero no lo ejecutamos" -- y tenía razón, faltaba el último tramo.
 *
 * ── Por qué endpoint propio y no un campo más en PATCH /settings ──────────
 *
 * Porque `UpdateSettingsBody` es un esquema GENERADO desde la especificación
 * OpenAPI: un campo agregado a mano ahí se pierde en la próxima regeneración.
 * Y además esto tiene semántica propia -- agregar una cuenta, ver cuántas hay,
 * sacar una -- que no entra bien en un PATCH genérico.
 */
/**
 * Las cuentas de Copilot DEL INQUILINO que hace el pedido.
 *
 * ⚠️ Antes esto salía de `settings`, que es UNA fila para toda la plataforma:
 * todos los clientes compartían las cuentas del dueño y gastaban su cuota sin
 * saberlo. Ahora cada uno administra las suyas.
 *
 * Por eso además se sacó `requirePlatformOwner()` de estos tres endpoints: un
 * cliente TIENE que poder conectar su propia cuenta, que era justo lo que el
 * guard le impedía.
 */
async function cuentasDelInquilino(req: any): Promise<Array<{ token: string; cuenta?: string }>> {
  const tenantId = Number(req?.tenant?.id) || 0;
  if (!tenantId) return [];
  const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const lista = (fila as any)?.copilotTokens;
  return Array.isArray(lista) ? lista : [];
}

/**
 * Guarda la cola del inquilino.
 *
 * NO toca `process.env`: el entorno es global al proceso y escribir ahí las
 * cuentas de UN cliente se las daría a todos -- exactamente el problema que
 * este cambio resuelve. El agente las lee de la base por turno
 * (`cuentasDeCopilotDelCliente`), que es una consulta y siempre está al día.
 */
async function guardarCuentas(req: any, lista: Array<{ token: string; cuenta?: string }>): Promise<void> {
  const tenantId = Number(req?.tenant?.id) || 0;
  if (!tenantId) throw new Error("Sin inquilino en el pedido");
  await db.update(tenants).set({ copilotTokens: lista } as any).where(eq(tenants.id, tenantId));
}

router.get("/copilot-accounts", async (req: any, res, next) => {
  try {
    const lista = await cuentasDelInquilino(req);
    // NUNCA vuelve el token. Solo cuántas hay y de qué cuenta es cada una,
    // que es lo que el admin necesita para saber cuál recargar.
    return res.json({
      total: lista.length,
      cuentas: lista.map((c: any, i: number) => ({
        posicion: i + 1,
        cuenta: c?.cuenta || "(sin correo)",
        // Los últimos 4 alcanzan para distinguir una de otra sin exponerla.
        final: String(c?.token || "").slice(-4),
      })),
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/copilot-accounts", async (req: any, res, next) => {
  try {
    const { token, cuenta } = req.body || {};
    const t = String(token || "").trim();
    if (!t) return res.status(400).json({ error: "Falta el token de la cuenta" });

    // Se valida ANTES de guardarla: una cuenta que no sirve en la cola es un
    // intento fallido garantizado en cada turno, y se paga en segundos de
    // espera del cliente.
    const sesion = await getCopilotSessionToken(t);
    if (!sesion) {
      return res.status(401).json({
        error: "GitHub rechazó ese token para Copilot. Tiene que ser el que entrega la Autorización Inteligente, no un token personal (PAT).",
      });
    }

    const actuales = await cuentasDelInquilino(req);
    // Sin duplicados: dos veces la misma cuenta no es más cuota, es el mismo
    // límite pegándole dos veces al mismo lugar.
    if (actuales.some((c: any) => c?.token === t)) {
      return res.status(409).json({ error: "Esa cuenta ya está en la cola" });
    }

    const lista = [...actuales, { token: t, cuenta: String(cuenta || "").trim() || undefined }];
    await guardarCuentas(req, lista);

    logger.info({ total: lista.length }, "[Copilot] cuenta agregada a la cola");
    return res.json({ ok: true, total: lista.length });
  } catch (e) {
    return next(e);
  }
});

router.delete("/copilot-accounts/:posicion", async (req: any, res, next) => {
  try {
    const i = Number(req.params.posicion) - 1;
    const actuales = await cuentasDelInquilino(req);
    if (!Number.isInteger(i) || i < 0 || i >= actuales.length) {
      return res.status(404).json({ error: "No hay una cuenta en esa posición" });
    }
    const lista = actuales.filter((_: any, j: number) => j !== i);
    await guardarCuentas(req, lista);
    logger.info({ total: lista.length }, "[Copilot] cuenta sacada de la cola");
    return res.json({ ok: true, total: lista.length });
  } catch (e) {
    return next(e);
  }
});

router.post("/copilot-token", requirePlatformOwner(), async (req, res, next) => {
  try {
    const { githubToken } = req.body;
    if (!githubToken) {
      return res.status(400).json({ error: "Token de GitHub (PAT) requerido" });
    }

    const sessionToken = await getCopilotSessionToken(githubToken);
    if (!sessionToken) {
      // El mensaje decía "Verifica tu PAT", y un PAT es JUSTO lo que no sirve
      // acá: el intercambio va contra api.github.com/copilot_internal/v2/token,
      // el endpoint INTERNO de Copilot, que solo acepta un token OAuth emitido
      // al cliente autorizado de Copilot (el de VS Code, client_id
      // Iv1.b507a08c87ecfe98) y obtenido por el flujo de dispositivo.
      //
      // Un ghp_... clásico o uno de grano fino se rechazan siempre, hagas lo
      // que hagas con sus permisos. El admin perdió tiempo probando tokens
      // buenos contra una puerta que no los acepta (reportado 2026-08-24).
      const pareceePat = /^gh[pousr]_/.test(String(githubToken).trim());
      return res.status(401).json({
        error: pareceePat
          ? "Ese es un token personal (PAT) y Copilot no los acepta: su endpoint interno solo admite el token que entrega la autorización de GitHub. Usá el botón \"Autorización Inteligente\" de arriba — te da un código, lo pegás en github.com/login/device y listo."
          : "GitHub rechazó ese token para Copilot. La forma que funciona es el botón \"Autorización Inteligente\" de arriba, que hace la autorización por código.",
      });
    }

    // Guardar en DB
    const currentSettings = await getOrCreate();
    await db.update(settings)
      .set({ 
        githubToken,
        copilotSessionToken: sessionToken.token,
        copilotSessionExpiresAt: new Date(sessionToken.expiresAt * 1000).toISOString()
      })
      .where(eq(settings.id, currentSettings.id));

    // Mismo motivo que en /copilot-device-token: al entorno YA, si no el
    // token nuevo no se usa hasta el próximo reinicio.
    process.env.GITHUB_TOKEN = githubToken;

    // El token de sesión de Copilot volvía COMPLETO al navegador. Ya quedó
    // guardado en el servidor; el panel solo necesita saber que funcionó.
    return res.json({
      success: true,
      token: enmascararSecreto(sessionToken.token),
      expires_at: sessionToken.expiresAt
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/copilot-device-code", requirePlatformOwner(), async (_req, res, next) => {
  try {
    const data = await getCopilotDeviceCode();
    if (!data) {
      return res.status(502).json({ error: "No se pudo generar el código de dispositivo de GitHub" });
    }
    console.log("✅ [BACKEND] Código de dispositivo generado:", data.user_code);
    // El frontend debe mostrar user_code y verification_uri, y luego hacer polling
    return res.json(data);
  } catch (e) {
    console.error("💥 [BACKEND] Error en copilot-device-code:", e);
    return next(e);
  }
});

router.post("/copilot-device-token", requirePlatformOwner(), async (req, res, next) => {
  try {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: "device_code requerido" });

    const result = await pollCopilotToken(device_code);

    if (result.status === "pending") {
      // El `interval` viaja al panel: si GitHub pidió esperar más (slow_down),
      // el panel tiene que obedecerlo. Sin este dato seguía preguntando cada
      // 5 s, GitHub seguía respondiendo `slow_down`, y la pantalla no salía
      // nunca de "Sincronizando con GitHub...".
      return res.status(202).json({ status: "pending", interval: result.intervalS });
    }
    if (result.status === "error" || !result.accessToken) {
      // Los códigos de GitHub en crudo ("expired_token") no le dicen nada al
      // que está mirando la pantalla, y este flujo se hace una sola vez: si
      // falla, el mensaje tiene que decir qué hacer.
      const EXPLICACIONES: Record<string, string> = {
        expired_token: "El código venció (dura 15 minutos). Generá uno nuevo y pegalo en github.com/login/device.",
        access_denied: "La autorización fue rechazada en GitHub. Generá un código nuevo y aceptala para continuar.",
        incorrect_device_code: "El código ya no es válido. Generá uno nuevo desde el botón de arriba.",
      };
      return res.status(400).json({
        status: "error",
        error:
          EXPLICACIONES[String(result.error)] ||
          result.error ||
          "No se pudo obtener el token (código expirado o denegado).",
      });
    }

    // Autorizado: intercambiar el token OAuth por el token de sesión de Copilot y guardarlo
    const accessToken = result.accessToken;
    const sessionToken = await getCopilotSessionToken(accessToken);

    const currentSettings = await getOrCreate();
    await db.update(settings)
      .set({
        githubToken: accessToken,
        copilotSessionToken: sessionToken?.token || null,
        copilotSessionExpiresAt: sessionToken?.expiresAt
          ? new Date(sessionToken.expiresAt * 1000).toISOString()
          : null,
      })
      .where(eq(settings.id, currentSettings.id));

    // Al entorno YA, sin esperar un reinicio. `getProviderConfig(
    // "github_copilot_internal")` -- que es por donde Copilot entra a la
    // cadena del bot de ventas -- lee `process.env.GITHUB_TOKEN`, no la base.
    // Sin esto, el admin se autenticaba, veía "autorizado", y Copilot seguía
    // fallando con el token viejo hasta el próximo reinicio. Medido en vivo
    // el 2026-08-19: pasó exactamente eso.
    process.env.GITHUB_TOKEN = accessToken;

    // Y a OpenCode, que es de donde Atlas saca sus modelos. Sin esto el admin
    // vincula su cuenta, la app guarda el token, y OpenCode nunca se entera:
    // sus 36 modelos de Copilot fallan con "Unexpected server error" en 0,4 s
    // --los 36, medidos uno por uno el 2026-08-25-- porque no tiene ninguna
    // credencial para ese proveedor. No bloquea la respuesta.
    void import("../lib/opencode-provider-sync")
      .then(({ sincronizarCopilotConOpencode }) =>
        sincronizarCopilotConOpencode({
          refresh: accessToken,
          access: sessionToken?.token,
          expiraEnMs: sessionToken?.expiresAt ? sessionToken.expiresAt * 1000 : null,
        }),
      )
      .catch(() => {});

    console.log("✅ [BACKEND] Copilot autorizado y token guardado");
    return res.json({ status: "authorized", success: true });
  } catch (e: any) {
    console.error("❌ [BACKEND] Error en copilot-device-token:", e.message);
    return res.status(400).json({ error: e.message || "Error al obtener token" });
  }
});

async function getOrCreate() {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({}).returning();
  return created!;
}

function parseKeywords(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return val ? [val] : [];
    }
  }
  return [];
}

/** Deja ver que hay un secreto cargado, sin entregarlo. */
function enmascarar(valor: string | null | undefined): string {
  return enmascararSecreto(valor);
}

function serialize(row: typeof settings.$inferSelect) {
  return {
    businessName: row.businessName,
    businessDescription: row.businessDescription,
    timezone: row.timezone,
    workingHoursStart: row.workingHoursStart,
    workingHoursEnd: row.workingHoursEnd,
    autoReplyEnabled: row.autoReplyEnabled,
    offHoursMessage: row.offHoursMessage,
    escalationKeywords: parseKeywords(row.escalationKeywords),
    aiProvider: row.aiProvider,
    // Los tokens de IA salían COMPLETOS al navegador: el de GitHub (40
    // caracteres) y el de sesión de Copilot (395). Cualquier XSS o extensión
    // instalada se los llevaba. Las credenciales de cobro de esta misma app ya
    // se manejan bien (cifradas, y solo se muestran los últimos 4); acá no se
    // había aplicado el mismo criterio. Se enmascaran igual, y los flags
    // dicen si hay algo cargado sin revelar qué.
    githubToken: enmascarar(row.githubToken),
    hasGithubToken: tokensCopilotGuardados(row, process.env).length > 0,
    githubModel: row.githubModel,
    copilotSessionToken: enmascarar(row.copilotSessionToken),
    hasCopilotSessionToken: !!row.copilotSessionToken,
    copilotSessionExpiresAt: row.copilotSessionExpiresAt,
    nvidiaApiKey: enmascarar(row.nvidiaApiKey),
    hasNvidiaApiKey: !!row.nvidiaApiKey,
    nvidiaModel: row.nvidiaModel,
    ollamaUrl: row.ollamaUrl,
    ollamaModel: row.ollamaModel,
  };
}

// ============================================================
// PROVIDER CONFIGURATION ENDPOINTS
// ============================================================

/**
 * GET /api/settings/providers
 * Listar providers configurados (keys enmascaradas)
 */
/**
 * POST /api/settings/probar-modelos — prueba EN VIVO qué modelos de un
 * proveedor sirven de verdad.
 *
 * El catálogo que publica un proveedor no dice cuáles funcionan: de los 26 que
 * lista OpenCode Go, solo 4 sirven. Sin esto, el panel ofrece modelos que
 * fallan y el admin lo descubre cuando un cliente se queda sin respuesta.
 */
router.post("/probar-modelos", async (req, res, next) => {
  try {
    const proveedor = String(req.body?.proveedor || req.body?.provider || "").trim();
    if (!proveedor) return res.status(400).json({ message: "Falta 'proveedor'" });
    const { probarModelosDe } = await import("../lib/probar-modelos");
    const r = await probarModelosDe(proveedor, Number(req.body?.limite) || 30);
    return res.json(r);
  } catch (e) {
    return next(e);
  }
});

router.get("/providers", async (req, res, next) => {
  try {
    const currentSettings = await getOrCreate();

    // En memoria guardamos providers, por ahora retornar configurados en settings
    const providers = [];

    if (currentSettings.aiProvider) {
      providers.push({
        id: "default",
        provider: currentSettings.aiProvider,
        apiKey: "***CONFIGURED***",
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        isActive: true,
      });
    }

    return res.json({ ok: true, providers });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/settings/test-provider
 * Testear conexión a un provider
 */
router.post("/test-provider", async (req, res, next) => {
  try {
    const { provider, apiKey, resourceName } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        error: "provider y apiKey son requeridos",
      });
    }

    logger.info({ provider }, "🧪 Testing provider connection");

    const result = await providerValidator.validateProvider(provider, apiKey, resourceName);

    return res.json({
      ok: true,
      test: result,
    });
  } catch (e) {
    logger.error({ error: e }, "❌ Provider test failed");
    return next(e);
  }
});

/**
 * POST /api/settings/add-provider
 * Añadir nuevo provider con API key encriptada
 */
router.post("/add-provider", requirePlatformOwner(), async (req, res, next) => {
  try {
    const { provider, apiKey, model, resourceName } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        error: "provider y apiKey son requeridos",
      });
    }

    // Validar formato de key
    const validation = encryptionService.validateApiKey(provider, apiKey);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    // Testear conexión
    const testResult = await providerValidator.validateProvider(provider, apiKey, resourceName);
    if (!testResult.valid) {
      return res.status(400).json({
        error: `Provider test fallido: ${testResult.message}`,
        details: testResult.error,
      });
    }

    // Encriptar y guardar
    const encrypted = encryptionService.encrypt(apiKey);
    const currentSettings = await getOrCreate();

    // Por ahora, guardar en settings como aiProvider
    await db.update(settings)
      .set({
        aiProvider: provider,
        // Podríamos añadir campos adicionales a settings si es necesario
      })
      .where(eq(settings.id, currentSettings.id));

    logger.info({ provider, model }, "✅ Provider añadido");

    return res.json({
      ok: true,
      message: `Provider ${provider} configurado exitosamente`,
      provider: {
        id: "default",
        provider,
        apiKey: encryptionService.maskApiKey(apiKey),
        model: model || testResult.models?.[0] || "default",
        isActive: true,
      },
    });
  } catch (e) {
    logger.error({ error: e }, "❌ Add provider failed");
    return next(e);
  }
});

/**
 * GET /api/settings/costs
 * Obtener dashboard de costos
 */
router.get("/costs", async (req, res, next) => {
  try {
    const period = (req.query.period as "today" | "week" | "month") || "month";
    const tenantId = (req as any).tenant?.id;

    const report = costTracker.getReport(period, tenantId);

    return res.json({
      ok: true,
      report,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/settings/provider-models
 * Obtener modelos disponibles por provider
 */
router.get("/provider-models", async (req, res, next) => {
  try {
    const providers = ["openai", "claude", "azure", "g4f"];
    const models: Record<string, string[]> = {};

    for (const provider of providers) {
      models[provider] = providerValidator.getAvailableModels(provider);
    }

    return res.json({
      ok: true,
      models,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/settings/provider-costs
 * Obtener tabla de costos por modelo
 */
router.get("/provider-costs", async (req, res, next) => {
  try {
    const { provider, model } = req.query;

    if (!provider || !model) {
      return res.status(400).json({
        error: "provider y model son requeridos",
      });
    }

    const cost = providerValidator.getModelCost(String(provider), String(model));

    return res.json({
      ok: true,
      provider,
      model,
      cost,
      perMillionTokens: {
        input: cost.input,
        output: cost.output,
      },
      perThousandTokens: {
        input: (cost.input / 1000).toFixed(6),
        output: (cost.output / 1000).toFixed(6),
      },
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
