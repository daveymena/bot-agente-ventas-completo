import { describe, it, expect } from "vitest";
import { promesasDe, promesasIncumplidas, sinLaPromesa } from "../promesas";

/**
 * El candado que cubre los cuatro defectos del 2026-09-01 de una sola vez:
 * nadie estaba comparando lo que el mensaje DICE contra lo que LLEVA.
 */

describe("Qué promete un texto", () => {
  it("reconoce la promesa de la ficha en las formas reales de producción", () => {
    expect(promesasDe("Te paso la ficha completa así lo miras con calma.")).toContain("ficha");
    expect(promesasDe("¡Buenísimo! Te mando la info completa")).toContain("ficha");
    expect(promesasDe("Aquí abajo te dejo todo lo que trae 👇")).toContain("ficha");
    expect(promesasDe("¡Sí! Mira 👇")).toContain("ficha");
  });

  it("reconoce video, precio, pago y tienda", () => {
    expect(promesasDe("¿Te muestro el video? 🎬")).toContain("video");
    expect(promesasDe("Te paso el precio enseguida")).toContain("precio");
    expect(promesasDe("Te mando los medios de pago")).toContain("pago");
    expect(promesasDe("Te comparto la tienda")).toContain("tienda");
  });

  it("no marca frases que sólo MENCIONAN la cosa sin prometerla", () => {
    // Un falso positivo borra una frase buena. Los patrones exigen el verbo de
    // entrega pegado al objeto.
    expect(promesasDe("La ficha que te mandé tiene el temario")).toEqual([]);
    expect(promesasDe("Te repaso lo importante")).toEqual([]);
    expect(promesasDe("El precio es de $60.000 COP")).toEqual([]);
    expect(promesasDe("¿Qué te gustaría lograr con el curso?")).toEqual([]);
    expect(promesasDe("")).toEqual([]);
  });
});

describe("Qué promesas NO cumple el turno", () => {
  it("el caso del 2026-09-01: promete la ficha y no sale ninguna", () => {
    const texto = "¡Buenísimo que preguntes por el de piano! 🎹 Te paso la ficha completa así lo miras con calma.";
    expect(promesasIncumplidas(texto, { hayFicha: false, seccion: null, mensajes: [texto] }))
      .toEqual(["ficha"]);
  });

  it("si la ficha SÍ sale, no hay nada que marcar", () => {
    const texto = "Te paso la ficha completa 👇";
    expect(promesasIncumplidas(texto, { hayFicha: true, seccion: "completa", mensajes: [texto] }))
      .toEqual([]);
  });

  it("promete el video y salen los medios de pago", () => {
    const texto = "¡Perfecto! Te muestro el video 🎬";
    const salida = { hayFicha: true, seccion: "pago", mensajes: [texto, "💰 $60.000 COP", "Nequi: 3136174267"] };
    expect(promesasIncumplidas(texto, salida)).toEqual(["video"]);
  });

  it("el video se cumple cuando sale un enlace", () => {
    const texto = "Te muestro el video 🎬";
    const salida = {
      hayFicha: true, seccion: "video",
      mensajes: [texto, "🎬 Mira cómo son las clases:\nhttps://drive.google.com/file/d/abc/view"],
    };
    expect(promesasIncumplidas(texto, salida)).toEqual([]);
  });

  it("prometer el precio exige que salga una cifra", () => {
    const texto = "Te paso el precio";
    expect(promesasIncumplidas(texto, { hayFicha: false, seccion: null, mensajes: [texto] })).toEqual(["precio"]);
    expect(promesasIncumplidas(texto, { hayFicha: false, seccion: null, mensajes: [texto, "$60.000 COP"] })).toEqual([]);
  });
});

describe("Quitar la promesa sin arruinar el mensaje", () => {
  it("conserva el saludo y borra sólo el anuncio de lo que no viene", () => {
    const texto = "¡Buenísimo que preguntes por el de piano! 🎹 Te paso la ficha completa así lo miras con calma.";
    const limpio = sinLaPromesa(texto, ["ficha"]);
    expect(limpio).toContain("Buenísimo");
    expect(limpio).not.toMatch(/te paso la ficha/i);
  });

  it("si el mensaje era SÓLO la promesa, devuelve vacío para que el llamador decida", () => {
    expect(sinLaPromesa("Te paso la ficha completa.", ["ficha"])).toBe("");
  });

  it("sin promesas incumplidas no toca nada", () => {
    const t = "El curso cuesta $60.000 COP y el acceso es de por vida.";
    expect(sinLaPromesa(t, [])).toBe(t);
  });
});
