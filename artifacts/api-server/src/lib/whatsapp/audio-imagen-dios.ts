/**
 * DIOS — Audio + Imagen del cliente (multimedia inbound)
 * Flag DIOS=1. Si no está, no-op (mantiene comportamiento actual).
 * - Audio: transcribe con Whisper (usa extensionDeAudio para mime correcto) → texto para motor.
 * - Imagen: guarda y pasa a consultar_conocimiento visual (stub: devuelve descripción para razonar).
 */
import { extensionDeAudio, transcribirAudio } from "../media-entrante";

export interface EntradaMultimedia {
  mime?: string | null;
  buffer?: Buffer | null;
  tipo: "audio"|"imagen";
}

export async function transcribirAudioDios(mimeRaw: string, buffer: Buffer): Promise<string | null> {
  if (process.env.DIOS !== "1") return null;
  if (!buffer?.length) return null;
  // delega a transcribirAudio existente (Groq Whisper) que ya maneja extensionDeAudio correctamente
  try { return await transcribirAudio(buffer, mimeRaw || "audio/ogg"); } catch { return null; }
}

export function descripcionImagenParaMotor(url: string): string {
  if (process.env.DIOS !== "1") return "";
  // stub: el motor ya razona con ficha + hechos; la imagen del cliente se menciona para que no la ignore
  return url ? `El cliente envió una imagen: ${url.slice(0,120)}. Si pregunta por talla/color del producto en la foto, usa guia_de_tallas + consultar_conocimiento antes de responder.` : "";
}
