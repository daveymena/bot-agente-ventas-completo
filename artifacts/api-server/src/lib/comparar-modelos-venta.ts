/**
 * ============================================================
 * QUÉ MODELO ATIENDE MEJOR — comparación medida, no opinada
 * ============================================================
 *
 * De dónde sale: el 2026-08-27 se midió qué modelo contesta de verdad en el
 * bot de ventas. El panel decía `github_copilot_internal` (GPT-4o), pero el
 * que respondía era `opencode/laguna-s-2.1-free` -- tres veces seguidas.
 *
 * Eso explicaba cuatro rondas de QA en las que el bot ignoraba un formato ya
 * escrito, mezclaba el registro e inventaba capacidades del curso. No era el
 * prompt: era el tamaño del modelo.
 *
 * Y la eleccion no se puede hacer a ojo. Acá se le manda a CADA modelo el
 * mismo prompt y las mismas preguntas, y se miden señales objetivas:
 *
 *   · voseo -- lleva cuatro rondas sin caer, y es lo primero que delata a un
 *     modelo que no sostiene una instrucción;
 *   · largo -- el admin pidió respuestas proporcionales; un modelo que suelta
 *     600 caracteres a "¿precio?" no sirve por más que acierte;
 *   · invento -- si nombra algo que NO está en los datos que se le dieron,
 *     es la falla cara: suena bien y es mentira;
 *   · tiempo -- un cliente no espera 20 segundos.
 *
 * No decide nada solo: devuelve las respuestas completas para leerlas.
 */

import { restosDeVoseo } from "./hablar-colombiano";

export interface RespuestaDeModelo {
  modelo: string;
  proveedor: string;
  ms: number;
  texto: string;
  error?: string;
  /** Señales medibles, para ordenar sin leer los 40 textos. */
  senales: {
    voseo: string[];
    largo: number;
    /** Cosas que nombró y NO estaban en los datos que se le pasaron. */
    invento: string[];
    terminaPreguntando: boolean;
  };
}

/**
 * Lo que NO puede nombrar sobre este curso, porque no existe.
 *
 * Salen del anuncio viejo del producto 124: se anunciaban y no estaban en la
 * entrega, y el bot las repetía porque las leyó en la descripción. Es el
 * detector más honesto que hay acá -- no juzga estilo, juzga si dice algo que
 * el negocio no puede cumplir.
 */
const NO_EXISTE = [
  "midjourney", "dall-e", "dalle", "leonardo", "crewai", "langgraph",
  "autogpt", "stable diffusion", "certificado", "diploma",
];

/** Los datos REALES que se le dan al modelo. Nada más que esto. */
export const FICHA_DE_PRUEBA = `PRODUCTO EN CONTEXTO
Nombre: INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS
Precio: $60.000 COP (pago único, precio fijo, sin descuentos)
Tipo: digital · se entrega por un enlace de acceso tras confirmar el pago
Incluye: 3 cursos, 52 módulos en video
  · Agentes y automatización: n8n, OpenClaw y Claude Code
  · Claude AI completo: Design (diseño gráfico), Excel, Chrome y conectores
  · Curso de Gemini de Google
  · Conecta WhatsApp, Telegram, Slack y Google
Garantía: 7 días, devolución del 100%
Acceso: de por vida
NO emite certificado.`;

/** Las reglas de estilo que el admin pidió, en su versión corta. */
export const ESTILO_DE_PRUEBA = `Eres quien atiende por WhatsApp una tienda de cursos en Colombia.
- Habla en español COLOMBIANO ("puedes", "tienes", "quieres"). NUNCA voseo (podés, querés, tenés).
- El tamaño de la respuesta es proporcional a la pregunta: pregunta corta, respuesta corta.
- No uses listas si no hay varias cosas que enumerar. No pongas ✅ delante de cada renglón.
- No termines siempre preguntando.
- SOLO puedes afirmar lo que está en los datos de abajo. Si no está, di que lo confirmas.`;

/** Las preguntas: una factual, una de razonamiento, una de plata. */
export const PREGUNTAS_DE_PRUEBA = [
  "cuanto vale?",
  "tengo una panaderia, me sirve este curso para mi negocio?",
  "me lo dejas en 30 mil?",
];

export function medirSenales(texto: string, datos: string): RespuestaDeModelo["senales"] {
  const bajo = texto.toLowerCase();
  const enDatos = datos.toLowerCase();
  return {
    voseo: restosDeVoseo(texto),
    largo: texto.length,
    invento: NO_EXISTE.filter((t) => bajo.includes(t) && !enDatos.includes(t)),
    terminaPreguntando: /\?\s*$/.test(texto.trim()),
  };
}
