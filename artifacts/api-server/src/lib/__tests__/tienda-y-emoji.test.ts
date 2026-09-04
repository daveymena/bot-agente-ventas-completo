import { describe, it, expect } from "vitest";
import { seccionQueCorresponde } from "../ficha-parcial";
import { emojiDeCaracteristica } from "../whatsapp";

/**
 * Dos pedidos del admin salidos de la misma conversación real (2026-08-27):
 *
 *   1. Preguntó "¿Tienes tienda?" y el bot contestó "¿de cuál producto querés
 *      que te cuente?" -- no respondió nada, teniendo la tienda publicada y el
 *      producto adentro. Un cliente que quiere VER antes de comprar se queda
 *      sin por dónde.
 *
 *   2. La ficha salía con el mismo ✅ en las cinco viñetas. Con cinco marcas
 *      iguales el ojo no distingue una de otra y todo se lee como un bloque.
 */

describe("pedir la tienda no es pedir el link de pago", () => {
  const seccion = (mensaje: string) =>
    seccionQueCorresponde({ mensaje, intent: "info", fichaYaEnviada: true });

  it("responde con la tienda a las formas en que se pregunta", () => {
    for (const m of [
      "tienes tienda?",
      "tienen tienda online",
      "me pasas el link del producto",
      "tienen catalogo?",
      "y la pagina web?",
      "donde lo puedo ver",
      "quiero verlo en la tienda",
    ]) {
      expect(seccion(m), m).toBe("tienda");
    }
  });

  it("pedir el link DE PAGO sigue yendo a pago, no a la tienda", () => {
    // Esta es la que se puede romper sin darse cuenta: "link" está en las dos
    // preguntas, y mandar a pagar a quien quería mirar es cobrarle antes de
    // tiempo.
    expect(seccion("me pasas el link para pagar")).toMatch(/^pago/);
  });

  it("preguntar el precio no cae en la tienda", () => {
    expect(seccion("cuanto vale?")).toBe("precio");
  });
});

describe("cada característica lleva el emoji que le corresponde", () => {
  it("elige por lo que dice, no por la posición", () => {
    const casos: Array<[string, string]> = [
      ["16 módulos de n8n: agente IA, APIs y webhooks", "⚙️"],
      ["Claude Code: MCP, apps web, Supabase y Render", "💻"],
      ["Claude Design (diseño gráfico)", "🎨"],
      ["Conecta WhatsApp, Telegram, Slack y Google", "🔗"],
      ["Partituras y ejercicios", "🎼"],
      ["Obediencia básica para tu perro", "🐶"],
      ["Acceso de por vida", "♾️"],
      ["Garantía de 7 días", "🛡️"],
      ["Soporte incluido", "🙌"],
      ["Te lo enviamos a tu dirección", "📦"],
    ];
    for (const [texto, emoji] of casos) {
      expect(emojiDeCaracteristica(texto), texto).toBe(emoji);
    }
  });

  it("cuando la frase no dice de qué habla, lo dice el producto", () => {
    // Una línea suelta del curso de piano sigue siendo del curso de piano.
    expect(emojiDeCaracteristica("Material de apoyo", "Curso de Piano Completo")).toBe("🎼");
    expect(emojiDeCaracteristica("Material de apoyo", "PACK EDUCA A TU PERRO")).toBe("🐶");
  });

  it("sin nada que lo diga usa un punto neutro, NO una chuleta de relleno", () => {
    // "no dejas de usar chuleta habiendo tanto emoji" (admin, 27/08). Con ✅ de
    // relleno la ficha vuelve a ser una columna de tildes iguales.
    expect(emojiDeCaracteristica("Lorem ipsum dolor")).toBe("•");
  });

  it("es estable: el mismo texto da siempre la misma cara", () => {
    // Si fuera al azar, la ficha del mismo producto cambiaría entre mensajes
    // y se vería descuidada.
    const t = "Agentes autónomos con OpenClaw";
    expect(emojiDeCaracteristica(t)).toBe(emojiDeCaracteristica(t));
  });

  it("una ficha real no sale toda con la misma marca", () => {
    const features = [
      "3 cursos: Agentes IA, Claude AI completo y Gemini",
      "n8n sin código: agente IA, APIs, webhooks y RAG",
      "Claude Code y Claude Design (diseño gráfico)",
      "Agentes con OpenClaw, hasta montarlos en un servidor",
      "Conecta WhatsApp, Telegram, Slack y Google",
    ];
    const distintos = new Set(features.map(emojiDeCaracteristica));
    expect(distintos.size).toBeGreaterThan(2);
  });
});
