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
  try {
    // 1. Preferir la config guardada por el tenant (settings), como agent.ts.
    let config = null;
    if (opts.tenantId) {
      try {
        const settingsRow = (await db.select().from(settings).limit(1))[0] as any;
        if (settingsRow) config = getProviderConfigFromSettings(settingsRow);
      } catch { /* sin settings → fallback env */ }
    }

    // 2. Fallback: cadena de proveedores por env.
    const fallbackProviders = ["opencode", "groq", "github", "openrouter", "nvidia"];
    if (!config) {
      for (const p of fallbackProviders) {
        const c = getProviderConfig(p);
        if (c) { config = c; break; }
      }
    }
    if (!config) return null;

    const client = createAIClient(config);
    const completion = await client.chat.completions.create({
      model: config.model || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 900,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return null;
    if (!opts.json) return text as unknown as T;

    const parsed = tryParseJson(text);
    return parsed as T | null;
  } catch (err) {
    logger.warn({ err }, "[MarketingAI] Llamada a IA falló — el agente usará su fallback determinístico");
    return null;
  }
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
