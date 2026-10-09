/**
 * ============================================================
 * ENCRYPTION SERVICE - Almacenamiento Seguro de API Keys
 * ============================================================
 * Encripta/desencripta API keys para almacenamiento seguro en BD
 */

import crypto from "crypto";
import { logger } from "./logger";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || crypto.randomBytes(16).toString("hex");

// Avisar si no está configurado en producción
if (process.env.NODE_ENV === "production" && !process.env.ENCRYPTION_KEY) {
  logger.warn(
    "⚠️ ENCRYPTION_KEY no configurada en producción. Usando clave temporal. Las keys no serán recuperables tras reinicio."
  );
}

export class EncryptionService {
  /**
   * Encriptar valor (ej: API key)
   */
  encrypt(plaintext: string): { encrypted: string; authTag: string; iv: string } {
    try {
      const key = Buffer.from(ENCRYPTION_KEY, "hex");
      const iv = Buffer.from(ENCRYPTION_IV, "hex");

      const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        authTag: authTag.toString("hex"),
        iv: ENCRYPTION_IV,
      };
    } catch (error) {
      logger.error({ error }, "❌ Encryption failed");
      throw new Error("No se pudo encriptar el valor");
    }
  }

  /**
   * Desencriptar valor
   */
  decrypt(encryptedData: { encrypted: string; authTag: string; iv: string }): string {
    try {
      const key = Buffer.from(ENCRYPTION_KEY, "hex");
      const iv = Buffer.from(encryptedData.iv, "hex");
      const authTag = Buffer.from(encryptedData.authTag, "hex");

      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error({ error }, "❌ Decryption failed");
      throw new Error("No se pudo desencriptar el valor");
    }
  }

  /**
   * Validar formato de API key según provider
   */
  validateApiKey(provider: string, apiKey: string): { valid: boolean; error?: string } {
    if (!apiKey || apiKey.length < 10) {
      return { valid: false, error: "API key muy corta" };
    }

    switch (provider.toLowerCase()) {
      case "openai":
        // OpenAI keys empiezan con sk-
        if (!apiKey.startsWith("sk-")) {
          return { valid: false, error: "OpenAI key debe empezar con 'sk-'" };
        }
        if (apiKey.length < 48) {
          return { valid: false, error: "OpenAI key demasiado corta" };
        }
        return { valid: true };

      case "claude":
        // Claude keys usualmente empiezan con sk-ant-
        if (!apiKey.startsWith("sk-ant-")) {
          return { valid: false, error: "Claude key debe empezar con 'sk-ant-'" };
        }
        return { valid: true };

      case "azure":
        // Azure keys son UUIDs típicamente
        if (apiKey.length < 32) {
          return { valid: false, error: "Azure key demasiado corta" };
        }
        return { valid: true };

      case "g4f":
        // G4F es local, no requiere key
        return { valid: true };

      default:
        return { valid: true }; // Permitir otros providers
    }
  }

  /**
   * Enmascarar API key para mostrar (últimos 4 caracteres)
   */
  maskApiKey(apiKey: string): string {
    // Solo los últimos 4 (antes también los 4 primeros: con un prefijo
    // conocido como "APP_USR-" eso es regalar parte de la clave).
    if (!apiKey || apiKey.length <= 8) {
      return "••••";
    }
    return `••••${apiKey.slice(-4)}`;
  }
}

export const encryptionService = new EncryptionService();
