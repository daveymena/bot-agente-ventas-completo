/**
 * Límite de peticiones para las rutas PÚBLICAS que cuestan plata.
 *
 * Encontrado en la auditoría previa al lanzamiento (2026-08-22): la app no
 * tenía ningún rate-limit, y hay dos endpoints públicos --sin sesión, sin
 * nada-- que llaman a modelos de IA:
 *
 *   POST /api/public/generate-image   genera una imagen con IA
 *   POST /api/public/help-chat        conversa con un modelo
 *
 * Cualquiera que encuentre esas URLs puede dispararlas en bucle desde un
 * script. No hace falta ser sofisticado: con DeepSeek de pago al frente, eso
 * es una factura creciendo sola, y con la generación de imágenes es peor
 * porque cada llamada cuesta bastante más que un mensaje de texto.
 *
 * Se implementa en memoria a propósito, sin dependencia nueva ni Redis: el
 * objetivo es frenar el abuso obvio desde una IP, no construir un sistema
 * distribuido. Si el proceso reinicia se pierde el conteo, y está bien -- el
 * abusador tiene que empezar de nuevo igual.
 */
import type { Response, NextFunction } from "express";
import type { Request } from "express";
import { logger } from "../lib/logger";

interface Ventana {
  hasta: number;
  cuenta: number;
}

const ventanas = new Map<string, Ventana>();

// Limpieza periódica: sin esto el Map crece para siempre con IPs que pasaron
// una vez y no volvieron.
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, v] of ventanas) {
    if (v.hasta < ahora) ventanas.delete(clave);
  }
}, 10 * 60 * 1000).unref?.();

function ipDe(req: Request): string {
  // Detrás del proxy de EasyPanel la IP real viene en X-Forwarded-For. Se toma
  // la PRIMERA, que es la del cliente; las siguientes son los proxies.
  const reenviada = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return reenviada || req.ip || req.socket?.remoteAddress || "desconocida";
}

/**
 * @param maxPorVentana cuántas peticiones se permiten
 * @param ventanaMs en qué lapso
 */
export function rateLimitPublico(maxPorVentana: number, ventanaMs: number, nombre: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clave = `${nombre}:${ipDe(req)}`;
    const ahora = Date.now();
    const actual = ventanas.get(clave);

    if (!actual || actual.hasta < ahora) {
      ventanas.set(clave, { hasta: ahora + ventanaMs, cuenta: 1 });
      next();
      return;
    }

    actual.cuenta++;
    if (actual.cuenta > maxPorVentana) {
      const faltan = Math.ceil((actual.hasta - ahora) / 1000);
      // Se loguea para poder detectar un abuso sostenido, pero solo al cruzar
      // el límite -- si no, un bucle de mil peticiones genera mil líneas de log
      // y el ataque termina siendo también contra el disco.
      if (actual.cuenta === maxPorVentana + 1) {
        logger.warn({ ruta: nombre, ip: ipDe(req) }, "[RateLimit] límite superado en ruta pública");
      }
      res.status(429).json({
        error: "Demasiadas solicitudes",
        message: `Esperá ${faltan} segundo(s) y volvé a intentar.`,
      });
      return;
    }
    next();
  };
}
