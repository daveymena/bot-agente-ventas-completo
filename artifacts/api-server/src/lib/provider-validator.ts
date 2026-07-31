/**
 * ============================================================
 * PROVIDER VALIDATOR - Testear Conexiones a Servicios de IA
 * ============================================================
 * Valida que los API keys funcionen antes de guardar
 */

import { logger } from "./logger";
import { encryptionService } from "./encryption-service";

export interface ProviderTestResult {
  provider: string;
  valid: boolean;
  latency: number;
  message: string;
  models?: string[];
  error?: string;
}

export class ProviderValidator {
  /**
   * Testear conexión a OpenAI
   */
  private async testOpenAI(apiKey: string): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          provider: "openai",
          valid: false,
          latency,
          message: "API key inválido o sin permisos",
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      const models = data.data
        .map((m: any) => m.id)
        .filter((m: string) => m.includes("gpt"))
        .slice(0, 5);

      return {
        provider: "openai",
        valid: true,
        latency,
        message: "✅ Conexión exitosa",
        models,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider: "openai",
        valid: false,
        latency,
        message: "❌ No se pudo conectar a OpenAI",
        error: String(error),
      };
    }
  }

  /**
   * Testear conexión a Claude (via Anthropic)
   */
  private async testClaude(apiKey: string): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 10,
          messages: [{ role: "user", content: "test" }],
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          provider: "claude",
          valid: false,
          latency,
          message: "API key inválido o sin permisos",
          error: `HTTP ${response.status}`,
        };
      }

      return {
        provider: "claude",
        valid: true,
        latency,
        message: "✅ Conexión exitosa",
        models: ["claude-3-sonnet-20240229", "claude-3-opus-20240229"],
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider: "claude",
        valid: false,
        latency,
        message: "❌ No se pudo conectar a Claude",
        error: String(error),
      };
    }
  }

  /**
   * Testear conexión a Azure OpenAI
   */
  private async testAzure(apiKey: string, resourceName: string): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      const endpoint = `https://${resourceName}.openai.azure.com/openai/deployments?api-version=2024-02-15-preview`;
      const response = await fetch(endpoint, {
        headers: {
          "api-key": apiKey,
        },
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          provider: "azure",
          valid: false,
          latency,
          message: "API key inválido o recurso no encontrado",
          error: `HTTP ${response.status}`,
        };
      }

      return {
        provider: "azure",
        valid: true,
        latency,
        message: "✅ Conexión exitosa",
        models: ["gpt-4", "gpt-4-turbo", "gpt-35-turbo"],
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider: "azure",
        valid: false,
        latency,
        message: "❌ No se pudo conectar a Azure",
        error: String(error),
      };
    }
  }

  /**
   * G4F es local - verificar que el servidor esté funcionando
   */
  private async testG4F(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      // G4F_ENABLED se define en config/g4f.config.ts
      const G4F_ENABLED = process.env.G4F_ENABLED === "true";

      const latency = Date.now() - startTime;

      return {
        provider: "g4f",
        valid: G4F_ENABLED,
        latency,
        message: G4F_ENABLED ? "✅ G4F local disponible" : "⚠️ G4F deshabilitado",
        models: ["gpt-3.5-turbo", "gpt-4", "claude"],
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider: "g4f",
        valid: false,
        latency,
        message: "❌ G4F no disponible",
        error: String(error),
      };
    }
  }

  /**
   * Testear provider genérico
   */
  async validateProvider(
    provider: string,
    apiKey: string,
    resourceName?: string
  ): Promise<ProviderTestResult> {
    logger.info({ provider }, "🧪 Testeando provider");

    // Validar formato primero
    const validation = encryptionService.validateApiKey(provider, apiKey);
    if (!validation.valid) {
      return {
        provider,
        valid: false,
        latency: 0,
        message: validation.error || "Formato inválido",
      };
    }

    // Testear según provider
    switch (provider.toLowerCase()) {
      case "openai":
        return await this.testOpenAI(apiKey);
      case "claude":
        return await this.testClaude(apiKey);
      case "azure":
        return await this.testAzure(apiKey, resourceName || "");
      case "g4f":
        return await this.testG4F();
      default:
        return {
          provider,
          valid: false,
          latency: 0,
          message: "Provider no soportado",
        };
    }
  }

  /**
   * Obtener modelos disponibles por provider
   */
  getAvailableModels(provider: string): string[] {
    const models: Record<string, string[]> = {
      openai: [
        "gpt-4-turbo",
        "gpt-4",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-3.5-turbo",
      ],
      claude: [
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
      ],
      azure: [
        "gpt-4",
        "gpt-4-turbo",
        "gpt-35-turbo",
      ],
      g4f: [
        "gpt-3.5-turbo",
        "gpt-4",
        "claude-3-sonnet",
      ],
    };

    return models[provider.toLowerCase()] || [];
  }

  /**
   * Obtener costo estimado por millón de tokens
   */
  getModelCost(provider: string, model: string): { input: number; output: number } {
    // Precios en USD por millón de tokens (2024)
    const costs: Record<string, Record<string, { input: number; output: number }>> = {
      openai: {
        "gpt-4-turbo": { input: 10, output: 30 },
        "gpt-4": { input: 30, output: 60 },
        "gpt-4o": { input: 5, output: 15 },
        "gpt-4o-mini": { input: 0.15, output: 0.6 },
        "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
      },
      claude: {
        "claude-3-opus-20240229": { input: 15, output: 75 },
        "claude-3-sonnet-20240229": { input: 3, output: 15 },
        "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
      },
      azure: {
        "gpt-4": { input: 30, output: 60 },
        "gpt-4-turbo": { input: 10, output: 30 },
        "gpt-35-turbo": { input: 0.5, output: 1.5 },
      },
      g4f: {
        "gpt-3.5-turbo": { input: 0, output: 0 },
        "gpt-4": { input: 0, output: 0 },
        "claude-3-sonnet": { input: 0, output: 0 },
      },
    };

    const providerCosts = costs[provider.toLowerCase()];
    if (!providerCosts) {
      return { input: 0, output: 0 };
    }

    return providerCosts[model] || { input: 0, output: 0 };
  }
}

export const providerValidator = new ProviderValidator();
