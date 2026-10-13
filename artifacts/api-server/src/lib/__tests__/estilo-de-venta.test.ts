import { describe, it, expect } from "vitest";
import { proximoPaso } from "../embudo";
import type { MensajeHist } from "../estado-cognitivo";
import {
  ESTILO_POR_DEFECTO,
  PERFILES,
  comoSeVe,
  estiloDelNegocio,
  estiloElegido,
  perfilDe,
} from "../estilo-de-venta";
import { loQueFalta, cuantoFalta } from "../configuracion-guiada";

/**
 * Las perillas de "cómo vende este negocio".
 *
 * Lo que estas pruebas cuidan NO es que los tipos compilen: es que elegir algo
 * cambie la conversación. Una opción que el dueño elige y no cambia nada es
 * peor que no ofrecerla --le enseña que configurar no sirve-- y es el error que
 * este proyecto ya cometió con cuatro agentes de marketing que existían y a los
 * que no llamaba nadie.
 *
 * Por eso cada perilla se prueba por el LADO DEL EMBUDO: se arma la misma
 * conversación dos veces, cambiando solo la perilla, y se exige que el paso que
 * sale sea distinto.
 */

const cliente = (content: string): MensajeHist => ({ role: "customer", content });
const bot = (content: string): MensajeHist => ({ role: "assistant", content });

describe("el defecto no le cambia la venta a nadie", () => {
  it("sin estilo, el embudo hace exactamente lo mismo que antes de la perilla", () => {
    const historial = [cliente("hola"), bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"), cliente("me interesa el de piano")];
    const sinEstilo = proximoPaso({ etapa: "interesado", historial });
    const conDefecto = proximoPaso({ etapa: "interesado", historial, estilo: ESTILO_POR_DEFECTO });

    expect(sinEstilo.movimiento).toBe(conDefecto.movimiento);
    expect(sinEstilo.instruccion).toBe(conDefecto.instruccion);
  });

  it("el perfil recomendado ES el defecto: el que no elige nada ya está en la mejor opción", () => {
    const recomendado = PERFILES.find((p) => p.recomendado);
    expect(recomendado).toBeTruthy();
    expect(recomendado!.estilo).toEqual(ESTILO_POR_DEFECTO);
  });
});

describe("la perilla de calificación cambia el turno", () => {
  // Alguien que pregunta el precio. Con el defecto se le contesta -- es el
  // arreglo que este proyecto ya peleó una vez.
  const pidioPrecio = [cliente("hola"), bot("¡Hola! ¿Qué necesitas?"), cliente("cuánto vale el curso de piano?")];

  it('"siempre" (el defecto pro 2026-10-12) averigua primero, aunque le hayan pedido el precio', () => {
    const p = proximoPaso({ etapa: "interesado", historial: pidioPrecio, estilo: ESTILO_POR_DEFECTO });
    expect(p.movimiento).toBe("calificar");
  });

  it('"salvo_si_pidio_dato" (equilibrado) le contesta el precio en vez de interrogarlo', () => {
    const p = proximoPaso({ etapa: "interesado", historial: pidioPrecio, estilo: { calificacion: "salvo_si_pidio_dato", ganchoVideo: true, anteLaDuda: "algo_concreto" } });
    expect(p.movimiento).toBe("presentar");
  });

  it('"siempre" averigua primero, aunque le hayan pedido el precio (explícito)', () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: pidioPrecio,
      estilo: { ...ESTILO_POR_DEFECTO, calificacion: "siempre" },
    });
    expect(p.movimiento).toBe("calificar");
  });

  it('"nunca" presenta de una, sin preguntar nada antes', () => {
    // Sin esta perilla, este mismo caso califica: no se sabe para qué lo
    // quiere y el agente todavía no preguntó nada.
    const historial = [cliente("hola"), bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"), cliente("el curso de piano")];
    expect(proximoPaso({ etapa: "interesado", historial }).movimiento).toBe("calificar");

    const p = proximoPaso({
      etapa: "interesado",
      historial,
      estilo: { ...ESTILO_POR_DEFECTO, calificacion: "nunca" },
    });
    expect(p.movimiento).toBe("presentar");
  });
});

describe("la perilla del video cambia lo que se le ofrece al cerrar", () => {
  // El saludo NO cuenta como pregunta --lo aprendió el embudo en vivo-- así
  // que la calificación tiene que ser la SEGUNDA cosa que dice el bot para que
  // acá ya estemos en el momento de presentar.
  const historial = [
    cliente("hola"),
    bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"),
    cliente("el curso de piano"),
    bot("¿Para qué lo querés?"),
    cliente("quiero aprender desde cero para tocar en la iglesia"),
  ];

  it("con el gancho puesto, la presentación ofrece el video", () => {
    const p = proximoPaso({ etapa: "interesado", historial, estilo: { ...ESTILO_POR_DEFECTO, ganchoVideo: true } });
    expect(p.movimiento).toBe("presentar");
    expect(p.instruccion).toMatch(/video/i);
  });

  it("sin el gancho, no lo menciona", () => {
    const p = proximoPaso({ etapa: "interesado", historial, estilo: { ...ESTILO_POR_DEFECTO, ganchoVideo: false } });
    expect(p.movimiento).toBe("presentar");
    expect(p.instruccion).not.toMatch(/video/i);
  });

  it("aun con el gancho, no promete un video que puede no existir", () => {
    // El temario inventado ya le costó una venta a este proyecto. La
    // instrucción tiene que condicionar el ofrecimiento a que el producto lo
    // tenga cargado, no darlo por hecho.
    const p = proximoPaso({ etapa: "interesado", historial, estilo: { ...ESTILO_POR_DEFECTO, ganchoVideo: true } });
    expect(p.instruccion).toMatch(/si el producto tiene video/i);
  });
});

describe("la perilla del “lo voy a pensar” cambia cómo se destraba", () => {
  // Ya vio la ficha y sigue ahí: el momento exacto donde se decide si el
  // negocio insiste, pregunta, o deja tranquilo.
  const base = {
    etapa: "interesado" as const,
    historial: [cliente("me interesa el de piano"), bot("Acá te va la ficha"), cliente("lo voy a pensar")],
    fichaEnviada: true,
  };

  it('"dar_espacio" no insiste ni pregunta', () => {
    const p = proximoPaso({ ...base, estilo: { ...ESTILO_POR_DEFECTO, anteLaDuda: "dar_espacio" } });
    expect(p.movimiento).toBe("destrabar");
    expect(p.instruccion).toMatch(/espacio|calma/i);
    expect(p.instruccion).toMatch(/no insistir|No preguntes/i);
  });

  it('"preguntar_que_frena" pregunta derecho qué lo frena', () => {
    const p = proximoPaso({ ...base, estilo: { ...ESTILO_POR_DEFECTO, anteLaDuda: "preguntar_que_frena" } });
    expect(p.instruccion).toMatch(/qué lo está frenando/i);
  });

  it('"preguntar_que_frena" (el defecto pro) pregunta qué lo frena', () => {
    const p = proximoPaso({ ...base, estilo: ESTILO_POR_DEFECTO });
    expect(p.instruccion).toMatch(/qué lo está frenando/i);
  });

  it('"algo_concreto" (equilibrado) le deja algo para pensar', () => {
    const p = proximoPaso({ ...base, estilo: { calificacion: "salvo_si_pidio_dato", ganchoVideo: true, anteLaDuda: "algo_concreto" } });
    expect(p.instruccion).toMatch(/una cosa concreta/i);
  });

  it("ninguna de las tres repite la ficha", () => {
    for (const anteLaDuda of ["dar_espacio", "algo_concreto", "preguntar_que_frena"] as const) {
      const p = proximoPaso({ ...base, estilo: { ...ESTILO_POR_DEFECTO, anteLaDuda } });
      expect(p.instruccion).toMatch(/NO la repitas/);
    }
  });
});

describe("lo guardado se lee sin romper la venta", () => {
  it("un negocio sin nada configurado vende con el defecto", () => {
    expect(estiloDelNegocio(null)).toEqual(ESTILO_POR_DEFECTO);
    expect(estiloDelNegocio({})).toEqual(ESTILO_POR_DEFECTO);
  });

  it("un valor inventado por la IA cae al defecto, campo por campo", () => {
    const e = estiloDelNegocio({ estiloDeVenta: { calificacion: "agresivo", ganchoVideo: "sí", anteLaDuda: "cerrar_duro" } });
    expect(e).toEqual(ESTILO_POR_DEFECTO);
  });

  it("respeta lo que sí es válido aunque lo demás venga mal", () => {
    const e = estiloDelNegocio({ estiloDeVenta: { calificacion: "nunca", anteLaDuda: "vender_mas" } });
    expect(e.calificacion).toBe("nunca");
    expect(e.anteLaDuda).toBe(ESTILO_POR_DEFECTO.anteLaDuda);
  });
});

describe("lo que el dueño elige es lo que se guarda", () => {
  it("el id del perfil se traduce a las perillas", () => {
    expect(estiloElegido("consultivo")).toEqual(ESTILO_POR_DEFECTO);
    expect(estiloElegido("equilibrado")!.calificacion).toBe("salvo_si_pidio_dato");
    expect(estiloElegido("directo")!.calificacion).toBe("nunca");
    expect(estiloElegido("consultivo")!.calificacion).toBe("siempre");
  });

  it("un estilo que no existe NO se guarda: se devuelve null para poder preguntar", () => {
    expect(estiloElegido("agresivo")).toBeNull();
    expect(estiloElegido("")).toBeNull();
    expect(estiloElegido(undefined)).toBeNull();
    expect(estiloElegido({ cualquier: "cosa" })).toBeNull();
  });

  it("se puede afinar una sola perilla sin cambiar de perfil", () => {
    const e = estiloElegido({ ganchoVideo: false });
    expect(e).toEqual({ ...ESTILO_POR_DEFECTO, ganchoVideo: false });
  });

  it("se guardan las perillas, no el id: cambiar un perfil no le cambia la venta a quien ya eligió", () => {
    const guardado = estiloElegido("directo")!;
    expect(guardado).not.toHaveProperty("id");
    expect(perfilDe(guardado)?.id).toBe("directo");
  });
});

describe("el dueño puede leer lo que eligió", () => {
  it("se explica en lo que va a pasar, no en nombres de campos", () => {
    const l = comoSeVe(ESTILO_POR_DEFECTO);
    expect(l).toHaveLength(3);
    for (const linea of l) {
      expect(linea).not.toMatch(/calificacion|anteLaDuda|ganchoVideo|true|false/);
    }
  });

  it("las tres perillas cambian el texto que se le muestra", () => {
    const defecto = comoSeVe(ESTILO_POR_DEFECTO).join("\n");
    for (const otro of [
      { ...ESTILO_POR_DEFECTO, calificacion: "nunca" as const },
      { ...ESTILO_POR_DEFECTO, ganchoVideo: false },
      { ...ESTILO_POR_DEFECTO, anteLaDuda: "dar_espacio" as const },
    ]) {
      expect(comoSeVe(otro).join("\n")).not.toBe(defecto);
    }
  });
});

describe("Atlas se la pregunta al dueño", () => {
  const catalogo = { digitales: 84, fisicos: 0, servicios: 0 };

  it("aparece como decisión pendiente mientras no esté elegida", () => {
    const d = loQueFalta({ perfil: {}, catalogo }).find((x) => x.campo === "estiloDeVenta");
    expect(d).toBeTruthy();
    expect(d!.opciones).toHaveLength(PERFILES.length);
    expect(d!.opciones.filter((o) => o.recomendada)).toHaveLength(1);
  });

  it("deja de preguntarse cuando ya se eligió", () => {
    const perfil = { estiloDeVenta: estiloElegido("directo") };
    expect(loQueFalta({ perfil, catalogo }).some((x) => x.campo === "estiloDeVenta")).toBe(false);
  });

  it("va última: primero los datos que el bot no puede inventar", () => {
    const pendientes = loQueFalta({ perfil: {}, catalogo });
    expect(pendientes[pendientes.length - 1].campo).toBe("estiloDeVenta");
  });

  it("con UN solo producto recomienda el directo, y lo justifica con ese dato", () => {
    const d = loQueFalta({ perfil: {}, catalogo: { digitales: 1, fisicos: 0, servicios: 0 } })
      .find((x) => x.campo === "estiloDeVenta")!;
    const rec = d.opciones.find((o) => o.recomendada)!;
    expect(rec.id).toBe("directo");
    expect(rec.porQue).toMatch(/un solo producto/i);
  });

  it("con catálogo grande recomienda el equilibrado, y nombra cuántos tiene", () => {
    const d = loQueFalta({ perfil: {}, catalogo })!.find((x) => x.campo === "estiloDeVenta")!;
    const rec = d.opciones.find((o) => o.recomendada)!;
    expect(rec.id).toBe("equilibrado");
    expect(rec.porQue).toMatch(/84/);
  });

  it("cuenta en el avance: elegirla mueve el porcentaje", () => {
    const perfil = { entrega: {}, garantia: {}, acceso: {}, tono: "cercano", negociaPrecio: false, noPuede: ["nada"] };
    const sinElegir = cuantoFalta({ perfil, catalogo });
    const elegido = cuantoFalta({ perfil: { ...perfil, estiloDeVenta: estiloElegido("directo") }, catalogo });
    expect(elegido.porcentaje).toBeGreaterThan(sinElegir.porcentaje);
    expect(elegido.porcentaje).toBe(100);
  });
});
