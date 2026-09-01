import { describe, it, expect } from "vitest";
import { leerFicha, repartirPuntos, PRESUPUESTO_PIE_DE_FOTO } from "../ficha-del-producto";

/**
 * ============================================================
 * LA FICHA SINTETIZA; NUNCA DEJA UNA FRASE POR LA MITAD
 * ============================================================
 *
 * El admin lo dijo asi, mirando la ficha del curso de IA:
 *
 *   "no puede darle informacion a medias... debe sintetizar la informacion
 *    corta del producto, no recortar y dejar lo demas a medias. Y si el
 *    cliente pide mas informacion ya no le responde con eso, debe entender
 *    que busca el cliente."
 *
 * Dos defectos distintos detras de eso:
 *
 *   1. La ficha va como PIE DE FOTO, y WhatsApp corta a los ~1024 caracteres
 *      en seco, a mitad de palabra. No habia ningun control de largo, asi que
 *      un producto con descripcion rica se entregaba mutilado.
 *   2. Lo que si se controlaba era la CANTIDAD (5 puntos) y el sobrante se
 *      anunciaba como "➕ Y 3 cosas mas", que es exactamente la sensacion de
 *      informacion a medias que se estaba tratando de evitar.
 */

const NOMBRE_IA = "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS";

/** La del curso de IA, con la estructura que usa el catalogo. */
const DESC_IA = [
  "🤖 INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  "",
  "3 cursos de IA en uno: domina Claude, automatiza sin código y crea agentes que trabajen por ti 24/7.",
  "",
  "⚙️ MASTER EN AGENTES IA — 39 módulos: n8n sin código, APIs, webhooks y RAG desde cero hasta produccion.",
  "🎨 CURSO COMPLETO DE CLAUDE AI — 13 módulos: Claude Code, Claude Design, Excel, Chrome y conectores.",
  "🔮 CURSO DE GEMINI DE GOOGLE — todo el ecosistema, con ejemplos aplicados a negocios reales.",
  "🚀 Agentes con OpenClaw, hasta montarlos en un servidor propio y dejarlos corriendo 24/7.",
  "🔗 Conecta WhatsApp, Telegram, Slack y Google para que el agente trabaje donde ya trabajas.",
  "📦 Plantillas, flujos listos para importar y las bases de datos de ejemplo de cada clase.",
  "♾️ Acceso de por vida y todas las actualizaciones que se publiquen mas adelante.",
].join("\n");

describe("La ficha entra entera en el pie de foto", () => {
  const ficha = leerFicha(DESC_IA, NOMBRE_IA);

  it("lee los siete puntos del dueño, con sus emojis", () => {
    expect(ficha.emoji).toBe("🤖");
    expect(ficha.puntos.map((p) => p.emoji)).toEqual(["⚙️", "🎨", "🔮", "🚀", "🔗", "📦", "♾️"]);
  });

  it("los que muestra caben, y ninguno queda cortado", () => {
    const { entran } = repartirPuntos(ficha.puntos, PRESUPUESTO_PIE_DE_FOTO);
    const largo = entran.map((p) => `${p.emoji} ${p.texto}`).join("\n").length;
    expect(largo).toBeLessThanOrEqual(PRESUPUESTO_PIE_DE_FOTO);

    // Cada punto mostrado es IDENTICO al original: nada de "…" ni frases mochas.
    for (const p of entran) {
      const original = ficha.puntos.find((o) => o.texto === p.texto);
      expect(original, `punto cortado: ${p.texto}`).toBeDefined();
    }
  });

  it("con un presupuesto chico muestra menos, pero completos", () => {
    const { entran, resto } = repartirPuntos(ficha.puntos, 220);
    expect(entran.length).toBeGreaterThan(0);
    expect(entran.length).toBeLessThan(ficha.puntos.length);
    expect(entran.length + resto.length).toBe(ficha.puntos.length);
    for (const p of entran) expect(p.texto).not.toMatch(/…$/);
  });

  it("nunca devuelve la ficha vacia, aunque los puntos sean larguisimos", () => {
    const enorme = [{ emoji: "🤖", texto: "x".repeat(5000) }];
    const { entran } = repartirPuntos(enorme, 100);
    expect(entran).toHaveLength(1);
  });

  it("no pierde ni duplica ningun punto al repartir", () => {
    const { entran, resto } = repartirPuntos(ficha.puntos, 400);
    const todos = [...entran, ...resto].map((p) => p.texto);
    expect(todos).toEqual(ficha.puntos.map((p) => p.texto));
  });
});

describe("Si vuelve a preguntar, se le cuenta lo que falta", () => {
  const ficha = leerFicha(DESC_IA, NOMBRE_IA);

  it("el resto no repite nada de lo ya mostrado", () => {
    const { entran, resto } = repartirPuntos(ficha.puntos, 400);
    expect(resto.length).toBeGreaterThan(0);
    const mostrados = new Set(entran.map((p) => p.texto));
    for (const p of resto) expect(mostrados.has(p.texto)).toBe(false);
  });

  it("cuando todo entro, no queda resto que contar", () => {
    const corta = leerFicha("🎹 TITULO\n\nUn resumen.\n\n🎬 Un punto corto.", "TITULO");
    const { resto } = repartirPuntos(corta.puntos, PRESUPUESTO_PIE_DE_FOTO);
    expect(resto).toEqual([]);
  });
});
