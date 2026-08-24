import { describe, it, expect } from "vitest";
import { simular, type ResultadoTurno } from "./simulacion-conversacion";

/**
 * Conversaciones completas, turno por turno — no mensajes sueltos.
 *
 * Por qué hace falta esto además de `catalogo-real.test.ts`: el bot no pierde
 * al cliente en el primer mensaje. Lo pierde en el cuarto, cuando arrastra el
 * producto anterior, repite una ficha que ya mandó, o vuelve a preguntar algo
 * que el cliente ya contestó. Un test de un solo mensaje no puede ver nada de
 * eso, porque el daño está en cómo se encadenan los turnos.
 *
 * Acá se simula el MOTOR (determinista), no la redacción de la IA. Ver la
 * cabecera de `simulacion-conversacion.ts`: dice exactamente qué es fiel a
 * producción y cuál es el único supuesto que hace sobre el modelo.
 *
 * Los dos fallos que encontró esta simulación, y que antes no veía ningún test:
 *
 *  1. "¿qué cursos tienen?" caía en la rama de "pidió algo que NO existe", y el
 *     modelo recibía la orden de contestar que no está disponible — a alguien
 *     que solo quería ver la oferta. Las seis formas más comunes de preguntar
 *     por el catálogo terminaban ahí.
 *  2. "ese quiero" se marcaba como mensaje que NO nombra producto, y el modelo
 *     recibía "no supongas que sigue interesado en el producto anterior". O
 *     sea: el cliente decidía comprar y el bot volvía a preguntarle qué
 *     buscaba. Justo el interrogatorio que hay que evitar.
 */

/** Atajo legible: el producto del que habla el bot en ese turno. */
const prod = (t: ResultadoTurno) => t.producto;

describe("Conversación A · llega de un anuncio y compra", () => {
  it("no supone producto, lo identifica, no repite la ficha y cierra", async () => {
    const c = await simular([
      // El texto que Meta autocompleta igual para TODOS los anuncios.
      { cliente: "¡Hola! Quiero más información" },
      { cliente: "el curso de piano" },
      { cliente: "que incluye?" },
      { cliente: "me interesa, como pago?" },
    ]);

    // 1. No pidió nada todavía: no puede suponer un producto.
    expect(c[0].decision.mensajeSinProducto).toBe(true);
    expect(prod(c[0])).toBeNull();
    expect(c[0].fichaEnviada).toBe(false);

    // 2. Nombra el producto: lo identifica y manda la ficha.
    expect(prod(c[1])).toBe("CURSO DE PIANO COMPLETO");
    expect(c[1].fichaEnviada).toBe(true);

    // 3. Pregunta un detalle: sigue en el mismo producto y NO repite la ficha.
    //    Repetirla es lo que lo hace sonar a robot: precio y beneficios que ya
    //    tiene a la vista.
    expect(c[2].decision.stage).toBe("details");
    expect(c[2].fichaEnviada).toBe(false);
    expect(c[2].focoAlCerrar).toBe("CURSO DE PIANO COMPLETO");

    // 4. Cierra sobre el producto correcto.
    expect(c[3].decision.stage).toBe("closing");
    expect(prod(c[3])).toBe("CURSO DE PIANO COMPLETO");
  });

  // En ningún turno puede aparecer un producto que el cliente no nombró.
  it("nunca nombra un producto ajeno a la conversación", async () => {
    const c = await simular([
      { cliente: "¡Hola! Quiero más información" },
      { cliente: "el curso de piano" },
      { cliente: "que incluye?" },
      { cliente: "cuanto dura?" },
      { cliente: "me interesa, como pago?" },
    ]);

    for (const turno of c) {
      const p = prod(turno);
      expect(p === null || p === "CURSO DE PIANO COMPLETO").toBe(true);
    }
  });
});

describe("Conversación B · cambia de producto a mitad", () => {
  it("sigue al cliente al producto nuevo y cierra sobre ese", async () => {
    const c = await simular([
      { cliente: "hola quiero info del curso de piano" },
      { cliente: "y el curso de ingles oxford cuanto vale?" },
      { cliente: "ese quiero" },
    ]);

    expect(prod(c[0])).toBe("CURSO DE PIANO COMPLETO");

    // REGRESIÓN: "cuánto vale" es intención de PAGO, y esa guarda cancelaba la
    // búsqueda. El cliente preguntaba por el inglés y recibía el precio —y la
    // ficha de pago— del PIANO.
    expect(prod(c[1])).toBe("CURSO INGLES OXFORD");
    expect(c[1].focoAlCerrar).toBe("CURSO INGLES OXFORD");

    // Y el "ese quiero" final tiene que cerrar sobre el inglés, no volver al piano.
    expect(c[2].decision.stage).toBe("closing");
    expect(c[2].focoAlCerrar).toBe("CURSO INGLES OXFORD");
  });
});

describe("Conversación C · pide algo que no existe y después el catálogo", () => {
  it("dice la verdad sin inventar, y al pedir el catálogo NO dice que no hay", async () => {
    const c = await simular([
      { cliente: "hola tienen curso de cocina?" },
      { cliente: "y de reposteria?" },
      { cliente: "bueno y que cursos tienen?" },
      { cliente: "el de canva" },
      { cliente: "ese quiero" },
    ]);

    // 1 y 2: no existen. Se admite, sin ofrecer un producto cualquiera.
    expect(c[0].decision.productSearchFailed).toBe(true);
    expect(prod(c[0])).toBeNull();
    expect(c[1].decision.productSearchFailed).toBe(true);
    expect(prod(c[1])).toBeNull();

    // 3. REGRESIÓN: pedir el catálogo NO es pedir algo que no existe.
    expect(c[2].decision.pidioVerCatalogo).toBe(true);
    expect(c[2].decision.productSearchFailed).toBe(false);
    expect(c[2].decision.contextBlock).not.toContain("NO existe en el catálogo");

    // 4 y 5: elige, y el "ese quiero" cierra sobre lo que eligió.
    expect(prod(c[3])).toBe("PACK CANVA");
    expect(c[4].decision.stage).toBe("closing");
    expect(c[4].focoAlCerrar).toBe("PACK CANVA");
  });
});

describe("No interrogar al cliente", () => {
  // El cliente ya decidió. Marcarlo como "no nombra producto" hace que el
  // modelo reciba "NO supongas que sigue interesado en el producto anterior",
  // y ahí es donde vuelve a preguntar lo que el cliente ya contestó.
  const CIERRES = [
    "ese quiero",
    "quiero ese",
    "ese me sirve",
    "dale ese",
    "lo quiero",
    "si ese",
  ];

  it.each(CIERRES)('"%s" cierra sobre el producto en foco', async (mensaje) => {
    const c = await simular([{ cliente: "quiero el curso de piano" }, { cliente: mensaje }]);
    const t = c[1];

    expect(t.decision.mensajeSinProducto).toBe(false);
    expect(t.decision.stage).toBe("closing");
    expect(t.focoAlCerrar).toBe("CURSO DE PIANO COMPLETO");
  });

  // Pedir ver la oferta es un pedido concreto. Devolverle la pregunta
  // ("¿qué estás buscando?") es el interrogatorio, y decirle que no hay es peor.
  const CATALOGO = [
    "que cursos tienen?",
    "bueno y que cursos tienen?",
    "que tienen?",
    "cuales cursos manejan",
    "que mas tienen",
    "muestrame el catalogo",
  ];

  it.each(CATALOGO)('"%s" muestra opciones, no niega ni interroga', async (mensaje) => {
    const c = await simular([{ cliente: mensaje }]);
    const d = c[0].decision;

    expect(d.pidioVerCatalogo).toBe(true);
    expect(d.productSearchFailed).toBe(false);
    expect(d.contextBlock).not.toContain("NO existe en el catálogo");
    expect(d.contextBlock).toContain("mostrale");
  });
});

describe("El cliente que vuelve días después", () => {
  // `sentProductIds` vale por sesión (4 h). Quien vuelve al otro día no tiene
  // la ficha a la vista — y esa ficha lleva los enlaces de pago vigentes.
  it("le manda la ficha de nuevo aunque ya se la haya mandado antes", async () => {
    const c = await simular(
      [{ cliente: "hola, quiero info del curso de piano" }],
      {
        // Sesión anterior: el foco existe, pero sentProductIds ya se vació.
        currentProductId: 123,
        currentProductName: "CURSO DE PIANO COMPLETO",
        sentProductIds: new Set<number>(),
        hasGreeted: true,
        isNewSession: true,
      }
    );

    expect(prod(c[0])).toBe("CURSO DE PIANO COMPLETO");
    expect(c[0].fichaEnviada).toBe(true);
  });
});
