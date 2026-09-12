/**
 * MARKETING TEAM — AI HELPER
 * 
 * Invoca al proveedor de IA configurado por el tenant (mismo mecanismo que
 * agent.ts: settings → fallback por env) para los agentes del equipo.
 *
 * Filosofía del repo: NUNCA fallar la petición del usuario por un problema de
 * IA. Si no hay proveedor disponible o el modelo no responde JSON, devuelve
 * null y el agente cae a su plantilla determinística (fallback).
 */

import {
  getProviderConfig,
  getProviderConfigFromSettings,
  createAIClient,
} from "@workspace/integrations-openai-ai-server";
import { db, settings } from "@workspace/db";
import { logger } from "../logger";

export interface AiCallOptions {
  tenantId?: number;
  systemPrompt: string;
  userPrompt: string;
  /** Si true, se le pide al modelo responder SOLO JSON y se parsea. */
  json?: boolean;
  maxTokens?: number;
}

export async function callMarketingAI<T = unknown>(
  opts: AiCallOptions,
): Promise<T | null> {
  // ── Candidatos EN ORDEN, no un único proveedor ───────────────────────────
  // Antes se elegía UNO solo y, si fallaba, toda la llamada devolvía null.
  // Medido en vivo el 2026-08-19: el ciclo de anuncio moría en 388ms con
  // "El modelo no devolvió un copy utilizable" -- un fallo instantáneo, no un
  // timeout -- y el admin se quedaba sin anuncio con la key paga ya cargada.
  //
  // La causa es que `settings.aiProvider` es el campo VIEJO de un solo
  // proveedor, anterior a la pantalla de "Modelos de pago"
  // (`businessConfig.aiProviders`, que es donde el admin carga sus claves hoy).
  // Mientras ese campo apunte a un proveedor gratis caído, esta función lo
  // sigue usando y ni mira las claves pagas: el mismo problema que ya tenía la
  // cadena de Atlas en operator-opencode.ts.
  //
  // Los pagos van PRIMERO porque son los que el admin configuró a propósito y
  // los que responden rápido (deepseek-chat: 807ms medidos contra la API real).
  const candidatos: { nombre: string; cfg: any }[] = [];
  const sumar = (nombre: string, cfg: any) => {
    if (cfg && !candidatos.some((c) => c.cfg?.baseUrl === cfg.baseUrl && c.cfg?.model === cfg.model)) {
      candidatos.push({ nombre, cfg });
    }
  };

  // 0. Lo que cargó ESTE cliente va primero que nada: es su cuenta y su plata.
  //    Se arma sin tocar process.env -- eso es lo que mantiene separados a dos
  //    clientes que corren en el mismo proceso. Ver lib/ai-keys-tenant.ts.
  if (opts.tenantId) {
    try {
      const { clavesDelTenant } = await import("../ai-keys-tenant");
      const { getProviderConfigConClave } = await import("@workspace/integrations-openai-ai-server");
      const suyas = await clavesDelTenant(opts.tenantId);
      for (const [proveedor, datos] of Object.entries(suyas)) {
        if (datos?.apiKey) sumar(`${proveedor} (del cliente)`, getProviderConfigConClave(proveedor, datos.apiKey, datos.model));
      }
    } catch { /* sin claves propias -> siguen las de abajo */ }
  }

  // 1. Proveedores de pago del sistema (la clave llega a process.env vía
  //    cargarClavesEnEntorno() apenas el admin la guarda). Con TODOS sus
  //    modelos: la cuota se agota por modelo, no por cuenta, así que perder el
  //    proveedor entero al primer 429 es tirar modelos que sí responden.
  const { getProviderRotation } = await import("@workspace/integrations-openai-ai-server");
  for (const p of ["deepseek", "mistral", "openai", "anthropic"]) {
    const rot = getProviderRotation(p);
    if (rot.length) rot.forEach((cfg) => sumar(`${p}/${cfg.model}`, cfg));
    else sumar(p, getProviderConfig(p));
  }

  // 2. La elección guardada del tenant (campo viejo, pero es una elección).
  if (opts.tenantId) {
    try {
      const settingsRow = (await db.select().from(settings).limit(1))[0] as any;
      if (settingsRow) sumar("settings", getProviderConfigFromSettings(settingsRow));
    } catch { /* sin settings → siguen los de abajo */ }
  }

  // 3. Último recurso: los gratis por env.
  // `ollama_cloud` va antes que los gratuitos de Zen (medidos muertos el
  // 03-09): corre en la nube de Ollama con la clave ya cargada, sin RAM del
  // VPS, y es el mismo que hoy lee las imágenes de los productos.
  for (const p of ["ollama_cloud", "opencode", "groq", "github", "openrouter", "nvidia"]) sumar(p, getProviderConfig(p));

  if (candidatos.length === 0) {
    logger.warn("[MarketingAI] No hay ningún proveedor de IA configurado");
    return null;
  }

  let ultimoError = "";
  for (const { nombre, cfg } of candidatos) {
    try {
      const client = createAIClient(cfg);
      const completion = await client.chat.completions.create({
        model: cfg.model || "gpt-5.6-luna",
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 900,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      });

      const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
      // Texto vacío es un fallo REAL, no una respuesta: es justo lo que hacen
      // los modelos de razonamiento cuando gastan el presupuesto de tokens
      // "pensando" (ya medido dos veces en este proyecto). Rotar en vez de
      // devolver null deja que el siguiente candidato conteste de verdad.
      if (!text) { ultimoError = `${nombre}: respondió vacío`; continue; }
      if (!opts.json) return text as unknown as T;

      const parsed = tryParseJson(text);
      if (parsed == null) { ultimoError = `${nombre}: no devolvió JSON parseable`; continue; }
      return parsed as T;
    } catch (err: any) {
      ultimoError = `${nombre}: ${err?.message || "error desconocido"}`;
      logger.warn({ proveedor: nombre, err: err?.message }, "[MarketingAI] Candidato falló, rotando al siguiente");
    }
  }

  logger.warn(
    { intentados: candidatos.map((c) => c.nombre), ultimoError },
    "[MarketingAI] Ningún proveedor pudo responder — el agente usará su fallback determinístico",
  );
  return null;
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // El modelo a veces envuelve el JSON en ```json ... ```.
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        return JSON.parse(m[1]!.trim());
      } catch { /* sigue abajo */ }
    }
    // O agrega texto antes/después del primer { ... último }.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch { /* nada */ }
    }
    return null;
  }
}
