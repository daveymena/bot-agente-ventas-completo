/**
 * Las plantillas de agente no pueden enseñarle al bot a inventar.
 *
 * ⚠️ Esto se encontró buscando otra cosa --el dueño pidió mejorar el FORMATO de
 * los mensajes-- y resultó más grave que el formato. Las plantillas que hereda
 * cada agente nuevo decían, textual:
 *
 *     5. Cierra con urgencia: "Solo quedan X unidades"
 *     Este producto se está agotando rápido. 🔥
 *     ✅ Envío en 24-48h a tu ciudad
 *     ✅ Garantía de 30 días
 *     ✅ Garantía de satisfacción o reembolso
 *     Día 7: "Última oportunidad — stock limitado"
 *
 * Nada de eso sale de la ficha del producto: son afirmaciones que el negocio
 * no puede sostener, dichas a un cliente real por WhatsApp. Y el propio repo
 * ya las BLOQUEA en los anuncios (ver INVENTOS en publicidad-persuasiva) --
 * pero un mensaje de WhatsApp no pasa por ese validador, así que la plantilla
 * se las estaba enseñando sin que nadie las frenara.
 *
 * Eran 11 lugares. La prueba existe para que no vuelvan.
 */
import { describe, it, expect } from "vitest";
import { AGENT_TEMPLATES } from "../agent-templates";

/** El texto completo de una plantilla: el prompt y los prompts de cada etapa. */
function textoDe(t: any): string {
  const etapas = (t.stages || []).map((e: any) => `${e.name || ""} ${e.prompt || ""}`).join("\n");
  return `${t.systemPrompt || ""}\n${etapas}`;
}

const TODAS: Array<[string, string]> = AGENT_TEMPLATES.map((t: any) => [t.name || t.type || "?", textoDe(t)]);

describe("ninguna plantilla enseña a inventar escasez", () => {
  it("hay plantillas para revisar", () => {
    expect(TODAS.length).toBeGreaterThan(0);
  });

  /**
   * Escasez inventada. Es la más tentadora y la que más rápido quema la
   * confianza: el cliente vuelve mañana, ve el mismo "últimas unidades", y ya
   * sabe que el negocio le miente.
   */
  it.each(TODAS)("%s no inventa stock ni cupos", (_nombre, texto) => {
    expect(texto).not.toMatch(/quedan\s+[X0-9]+\s*(unidades|cupos)/i);
    expect(texto).not.toMatch(/stock limitado|cupos limitados|últimas unidades|ultimas unidades/i);
    expect(texto).not.toMatch(/se está agotando|se esta agotando/i);
  });

  /**
   * Garantías y tiempos de envío. Peor que la escasez: son promesas
   * OPERATIVAS. Si el bot promete 30 días de garantía y el negocio no la da,
   * el problema pasa de marketing a reclamo.
   */
  it.each(TODAS)("%s no promete garantías ni plazos que no vienen del producto", (_nombre, texto) => {
    expect(texto).not.toMatch(/garant[ií]a de \d+ d[ií]as/i);
    expect(texto).not.toMatch(/garant[ií]a de satisfacci[oó]n|reembolso/i);
    expect(texto).not.toMatch(/env[ií]o en \d+-?\d*\s*h/i);
  });

  /**
   * Y la instrucción de fondo: "generá urgencia" es una orden de fabricarla.
   * Lo legítimo es explicar por qué conviene decidir, con datos reales.
   */
  it.each(TODAS)("%s no le ordena generar urgencia", (_nombre, texto) => {
    expect(texto).not.toMatch(/gener[aá]\w*\s+urgencia|crea\w*\s+urgencia|cierra con urgencia/i);
  });
});

describe("el formato es para leer en un teléfono", () => {
  const conFormato = TODAS.filter(([, t]) => t.includes("CÓMO SE ESCRIBE UN MENSAJE"));

  it("al menos una plantilla trae las reglas de formato", () => {
    expect(conFormato.length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ Decía "✅ Punto clave 1 / ✅ Punto clave 2": el mismo bug del emoji
   * uniforme, por tercera vez, ahora en el bot de WhatsApp. Si el producto
   * tiene 🤖 🔗 🎨 cargados, cuatro ✅ iguales borran esa información.
   */
  it.each(conFormato)("%s manda usar el emoji del producto, no ✅ para todo", (_n, texto) => {
    expect(texto).toMatch(/NO uses ✅ para todos los puntos/);
    expect(texto).toMatch(/emoji sale del producto/i);
  });

  /** Las rayas ocupan un renglón entero en un celular y no aportan nada. */
  it.each(conFormato)("%s prohíbe los muros de rayas dentro del mensaje", (_n, texto) => {
    expect(texto).toMatch(/NO mandes líneas de guiones o rayas/);
  });

  /** En un chat, las mayúsculas se leen como gritar. */
  it.each(conFormato)("%s prohíbe los títulos en mayúsculas", (_n, texto) => {
    expect(texto).toMatch(/NO uses TÍTULOS EN MAYÚSCULAS/);
  });
});
