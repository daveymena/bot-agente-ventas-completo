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

class OptimizedProviderRotation {
  private providers: Map<string, ProviderStatus> = new Map();
  private blacklist: Set<string> = new Set();
  private lastSuccessfulProvider: string | null = null;
  
  // Timeouts ULTRA-AGRESIVOS para EasyPanel (OPTIMIZADO PARA PRODUCCIÓN)
  private timeouts = {
    opencode: 8000,
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
    const providerList = [
      "groq",
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
    const conocidos = ["opencode", "opencode_zen", "groq", "nvidia", "openrouter", "github"];
    const order = [...new Set([...configurado, ...conocidos])];
    
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
   */
  reportFailure(provider: string, error?: string) {
    const status = this.providers.get(provider);
    if (status) {
      status.failureCount++;
      status.lastFailTime = new Date();

      // Después de 2 fallos seguidos, ponerlo en cooldown
      if (status.failureCount >= 2) {
        this.skipProvider(provider);
        logger.warn(
          { provider, failureCount: status.failureCount, error },
          "[OptimizedRotation] ⏸️  Provider skipped (cooldown)"
        );
      } else {
        logger.warn(
          { provider, failureCount: status.failureCount, error },
          "[OptimizedRotation] ⚠️  Failure detected"
        );
      }
    }
  }

  /**
   * Pone un proveedor en cooldown temporal
   */
  private skipProvider(provider: string) {
    this.blacklist.add(provider);
    const status = this.providers.get(provider);
    if (status) {
      status.skipUntil = new Date(Date.now() + this.cooldownDuration);
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
