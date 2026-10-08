import { describe, it, expect } from "vitest";
import { buildToolsDoc } from "../app-operator";

/**
 * Del informe de tiempos de un turno REAL de Atlas (2026-08-27), que el admin
 * pegó porque "está volviendo pesado":
 *
 *   gpt-oss-120b        descartado: pedido demasiado grande   0,5s
 *   laguna-xs-2.1:free  falló: se quedó sin tiempo           55,0s
 *   big-pickle          falló: se quedó sin tiempo           28,0s
 *   total                                                   135,0s
 *
 * No era lentitud: era que el prompt no entraba. Describir las 82 herramientas
 * cuesta ~30.000 caracteres (~7.500 tokens) y el límite de Groq es 8.000 POR
 * MINUTO -- o sea que el modelo bueno se descartaba en medio segundo y el
 * turno se iba a los que aceptan cualquier tamaño, que son los chicos.
 *
 * Con uno chico atendiendo, Atlas contestó "no encontré curso de programación"
 * teniendo DOS cargados (ID 57 y ID 72): ni siquiera llamó a list_products.
 */

const TOKENS = (t: string) => Math.round(t.length / 4);

describe("el prompt de Atlas entra en el límite del proveedor", () => {
  it("un pedido de anuncios NO manda las 82 herramientas", () => {
    const todas = buildToolsDoc();
    const recortado = buildToolsDoc("creemos el curso de programación y publiquemos en pausa una campaña de tráfico a WhatsApp");
    expect(recortado.length).toBeLessThan(todas.length);
    // El margen tiene que ser real: si apenas baja, sigue sin entrar.
    expect(TOKENS(recortado)).toBeLessThan(TOKENS(todas) * 0.75);
  });

  it("el recorte NO alcanza para Groq, y eso queda medido", () => {
    // Un pedido de anuncios baja de ~7.500 a ~5.000 tokens solo en
    // herramientas. Es una mejora real, pero el tope de Groq son 8.000 POR
    // MINUTO y encima van el system prompt, el perfil del negocio, el
    // catálogo y el historial.
    //
    // O sea: recortar ayuda, pero la conclusión medida es otra -- Atlas
    // necesita un proveedor SIN tope por minuto (Copilot, que además tiene
    // contexto grande). Groq sirve para el bot de ventas, cuyo prompt es una
    // fracción de este, no para el operador.
    //
    // Esta prueba deja el número a la vista para que nadie vuelva a suponer
    // que con recortar basta.
    //
    // Techo 5500 → 6150 el 01-10-2026: medido 5.949 SIN cambios (el techo ya
    // estaba roto por deriva previa, no por lo nuevo) y 6.112 con las
    // herramientas del día (audiencias fb_* ×4, metodo_de_venta,
    // oferta_2x_sugerir, integraciones_* ×4: +163). La conclusión no cambia:
    // sigue sin entrar en Groq con system + catálogo + historial.
    //
    // 6150 → 6250 el 08-10-2026: medido 6.199. crear_anuncio ahora recibe
    // formato/edades/ciudades/géneros/intereses (sin ellos el carrusel 25-55
    // en seis ciudades salía como imagen 18-65 a todo el país) + la
    // herramienta fb_segmentacion_editar. Misma conclusión sobre Groq.
    //
    // 6250 → 6300 el mismo día: fb_borrar_borrador (el dueño pidió borrar
    // borradores y Atlas no tenía cómo). Misma conclusión sobre Groq.
    const tokens = TOKENS(buildToolsDoc("hazme una campaña en facebook"));
    expect(tokens).toBeLessThan(6300);
    expect(tokens).toBeGreaterThan(3000);
  });

  it("SIEMPRE puede mirar el catálogo antes de decir que algo no existe", () => {
    // Este es el caso exacto que falló: dijo "no encontré curso de
    // programación" con dos cursos cargados. Sin list_products no puede ni
    // comprobarlo.
    for (const pedido of [
      "hazme una campaña de facebook",
      "cambia el color de la tienda",
      "revisa los pagos pendientes",
      "",
    ]) {
      expect(buildToolsDoc(pedido), pedido).toMatch(/- list_products:/);
    }
  });

  it("un pedido de anuncios conserva las herramientas de anuncios", () => {
    const doc = buildToolsDoc("publica una campaña de tráfico a WhatsApp en pausa");
    expect(doc).toMatch(/fb_/);
  });

  it("un pedido que no se reconoce manda todas: perder una herramienta es peor", () => {
    expect(buildToolsDoc("xyzzy qwerty").length).toBe(buildToolsDoc().length);
  });
});
