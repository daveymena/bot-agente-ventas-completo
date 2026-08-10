import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Patrones típicos de un error técnico crudo (excepción de red/parseo, no un
// mensaje pensado para mostrarse). Quien administra el panel no es
// programador -- "Failed to fetch" o "Unexpected token < in JSON" no le
// dicen nada, solo lo alarman como si la app estuviera rota.
const TECHNICAL_ERROR_PATTERN = /fetch|json|network|undefined|null|typeerror|referenceerror|\bat \w+|stack|\b[45]\d{2}\b|xhr|cors/i;

/**
 * Devuelve un mensaje de error seguro para mostrarle al admin: el mensaje
 * real SI ya suena pensado para un humano (ej. "El precio debe ser mayor a
 * cero", que el backend ya redactó a propósito), o el fallback genérico si
 * parece una excepción técnica cruda.
 */
export function describeError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg || TECHNICAL_ERROR_PATTERN.test(msg)) return fallback;
  return msg;
}
