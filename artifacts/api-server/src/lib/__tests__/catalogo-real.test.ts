import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  findBestProductMatch,
  computeDecision,
  type ConversationMemory,
} from "../conversation-engine";

/**
 * El buscador de productos, contra el catálogo REAL.
 *
 * Por qué este archivo existe aparte de `product-matching.test.ts`:
 *
 * Ese test usa un catálogo inventado de 5 productos bien distintos entre sí
 * (guitarra, piano, excel...). Con eso pasaban 496 pruebas en verde mientras el
 * bot, en producción, le ofrecía INGLES a quien preguntaba por un curso de
 * cocina. El catálogo real tiene 83 productos que se pisan («CURSO DE
 * DESARROLLO WEB» y «DESARROLLO WEB», dos cursos distintos de Photoshop,
 * «MEGAPACK COMPLETO 81 EN 1» y «CURSO DE PIANO COMPLETO»), y esa densidad es
 * justamente la que rompía el algoritmo. Un catálogo de juguete no puede
 * encontrar estos fallos: hay que probar contra el de verdad.
 *
 * Los casos de abajo se midieron uno por uno el 2026-08-24. Todos los marcados
 * como regresión fallaban antes del arreglo.
 *
 * La regla que fija este archivo, y que vale más que cualquier acierto:
 * ANTES DE OFRECER EL PRODUCTO EQUIVOCADO, NO OFRECER NINGUNO. Un "no lo
 * manejo" pierde una venta que nunca existió; ofrecerle inglés a quien pide
 * cocina pierde al cliente.
 */

const catalogo = JSON.parse(
  readFileSync(new URL("../../../../../products-full.json", import.meta.url), "utf8")
).map((p: any) => ({
  id: p.id,
  name: p.name,
  description: p.description ?? null,
  category: p.category ?? null,
  categoryId: null,
  price: String(p.price),
  currency: p.currency || "COP",
  features: p.features || [],
  isActive: true,
}));

const sinCategorias = new Map<number, string>();

/** Nombre del producto elegido, o null si el buscador no eligió ninguno. */
async function elige(mensaje: string): Promise<string | null> {
  const r = await findBestProductMatch(mensaje, catalogo as any, sinCategorias);
  return r?.product.name ?? null;
}

describe("Catálogo real: el buscador acierta", () => {
  const ACIERTOS: Array<[string, string]> = [
    ["quiero el curso de piano", "CURSO DE PIANO COMPLETO"],
    ["me interesa el pack educa a tu perro", "PACK EDUCA A TU PERRO"],
    ["información del curso de mecanica de motos", "CURSO MECANICA DE MOTOS"],
    ["cuanto vale el pack canva", "PACK CANVA"],
    ["el megapack completo 81 en 1", "MEGAPACK COMPLETO 81 EN 1"],
    ["curso de hacking etico", "CURSO HACKING ÉTICO"],
    ["pack de contabilidad", "PACK CONTABILIDAD"],
    ["curso revit bim", "CURSO REVIT BIM"],
    ["presets de lightroom", "PRESETS LIGHTROOM"],
    ["curso de pilates", "CURSO PILATES PARA UN CUERPO DE 10"],
    ["quiero el pack de libros", "PACK DE LIBROS"],
    ["los 15 mil planos de carpinteria", "15 MIL PLANOS PARA MUEBLES DE CARPINTERIA"],
    ["gastronomia", "GASTRONOMÍA"],
    ["super memoria", "SÚPER MEMORIA"],
  ];

  it.each(ACIERTOS)('"%s" → %s', async (mensaje, esperado) => {
    expect(await elige(mensaje)).toBe(esperado);
  });

  // Los dos cursos de Photoshop son productos distintos con el mismo prefijo.
  // Confundirlos es venderle al cliente un curso que no compró.
  it("distingue los dos cursos de Photoshop, que comparten prefijo", async () => {
    expect(await elige("curso de photoshop para retoque de retratos")).toBe(
      "CURSO PHOTOSHOP PARA RETOQUE DE RETRATOS"
    );
    expect(await elige("photoshop para diseño web")).toBe("CURSO PHOTOSHOP PARA DISEÑO WEB");
  });
});

describe("Catálogo real: cómo escribe la gente de verdad", () => {
  // Nadie escribe el nombre exacto del producto. Escriben con saludo, con
  // apodos y con abreviaturas.
  const REALES: Array<[string, string]> = [
    ["hola quiero saber del curso de piano porfa", "CURSO DE PIANO COMPLETO"],
    ["el de educar perros", "PACK EDUCA A TU PERRO"],
    ["cuanto sale el de excel", "EXCEL"],
    ["info del de ingles oxford", "CURSO INGLES OXFORD"],
    ["el curso pa reparar celulares", "CURSO REPARACIÓN DE CELULARES"],
    ["algo de excel avanzado", "EXCEL"],
  ];

  it.each(REALES)('"%s" → %s', async (mensaje, esperado) => {
    expect(await elige(mensaje)).toBe(esperado);
  });

  // REGRESIÓN. El saludo no se descontaba antes de buscar, así que "hola" y
  // "porfa" contaban como términos específicos: con 3 términos el umbral pedía
  // 2 coincidencias en el nombre y "piano" era una sola. El producto correcto
  // no llegaba, y lo rescataba el fallback de nivel 1 — el mismo que hacía
  // contestar INGLES a quien preguntaba por cocina.
  it("el saludo no diluye la búsqueda", async () => {
    expect(await elige("hola buenas tardes quiero el curso de piano por favor")).toBe(
      "CURSO DE PIANO COMPLETO"
    );
  });
});

describe("Catálogo real: NO inventa un producto que no existe", () => {
  // REGRESIÓN, y el motivo por el que se revisó todo esto. Ninguno de estos
  // productos existe en el catálogo. Antes, TODOS devolvían un producto real
  // con total seguridad.
  const NO_EXISTEN = [
    "tienen curso de cocina?",          // devolvía INGLES
    "quiero un curso de derecho penal", // devolvía INGLES
    "tienen algo de veterinaria",       // devolvía PACK PROGRAMACIÓN
    "me interesa un curso de soldadura",// devolvía CURSO REPARACIÓN DE CELULARES
    "venden zapatillas nike?",
    "quiero un curso de enfermeria",
    "tienen algo de astronomia",
  ];

  it.each(NO_EXISTEN)('"%s" → no elige ninguno', async (mensaje) => {
    expect(await elige(mensaje)).toBeNull();
  });

  // La causa de "cocina → INGLES": el último recurso emparejaba por la palabra
  // "curso", que está marcada como genérica, contra los 83 productos; el
  // desempate elegía el nombre más corto y ganaba siempre el mismo.
  it('la palabra "curso" por sí sola no puede elegir un producto', async () => {
    expect(await elige("quiero un curso")).toBeNull();
    expect(await elige("tienen cursos?")).toBeNull();
    expect(await elige("me interesa un curso nuevo")).toBeNull();
  });

  // La causa de "veterinaria → PACK PROGRAMACIÓN": se comparaba con includes()
  // sobre el texto entero, y "algo" está dentro de "algoritmos".
  it("no empareja pedazos de palabras", async () => {
    expect(await elige("tienen algo de veterinaria")).toBeNull();
    expect(await elige("busco algo de jardineria")).toBeNull();
  });

  // Un adjetivo de tamaño no identifica un producto. "completo" daba nivel 4
  // (¡frase exacta!) contra CURSO DE PIANO COMPLETO, cuando quien dice "el
  // completo" casi siempre habla del MEGAPACK.
  it('"el completo" no resuelve solo al curso de piano', async () => {
    expect(await elige("quiero el completo")).toBeNull();
    expect(await elige("dame el pack completo")).toBeNull();
  });
});

describe("Catálogo real: mensajes que no piden nada", () => {
  // El texto que Meta autocompleta para todos los anuncios entra por acá. No
  // nombra producto: el bot tiene que preguntar, no suponer.
  const VAGOS = [
    "hola",
    "buenas, información por favor",
    "que precio tiene?",
    "me interesa",
    "buenos dias",
    "info",
  ];

  it.each(VAGOS)('"%s" → no elige ninguno', async (mensaje) => {
    expect(await elige(mensaje)).toBeNull();
  });
});

describe("Catálogo real: parecido no es lo mismo", () => {
  // Cuando la coincidencia está solo en la descripción, el producto NO es lo
  // que el cliente pidió: es lo más parecido que hay. La diferencia tiene que
  // llegar hasta el prompt, porque de ella depende que el bot ofrezca ("¿te
  // sirve esto?") en vez de afirmar ("acá está lo que pediste").
  it("marca como NO fiel la coincidencia hallada solo en la descripción", async () => {
    const r = await findBestProductMatch("algo para mi negocio", catalogo as any, sinCategorias);
    expect(r).not.toBeNull();
    expect(r!.fiel).toBe(false);
    expect(r!.reasoning).toContain("SIN coincidencia fiel");
    expect(r!.reasoning).not.toContain("Producto seleccionado");
  });

  it("marca como fiel la coincidencia por nombre", async () => {
    const r = await findBestProductMatch("curso de piano", catalogo as any, sinCategorias);
    expect(r!.fiel).toBe(true);
    expect(r!.reasoning).toContain("Producto seleccionado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function memoriaCon(partial: Partial<ConversationMemory> = {}): ConversationMemory {
  return {
    history: [],
    hasGreeted: true,
    currentStage: "presentation",
    currentProductId: null,
    currentProductName: null,
    sentProductIds: new Set<number>(),
    lastCustomerMessage: "",
    lastAgentMessage: "",
    messageCount: 3,
    isNewSession: false,
    sessionStartedAt: null,
    paymentStatus: null,
    paymentMethod: null,
    paymentAmount: null,
    paidAt: null,
    ...partial,
  };
}

describe("Motor de decisión: lo que se le dice a la IA", () => {
  // El daño real no pasaba por `productToShow` — el llamador ya descartaba el
  // nivel 1 — sino por el TEXTO. El razonamiento de la búsqueda se inyecta en
  // el prompt, y decía "✅ Producto seleccionado: INGLES" aunque el cliente
  // hubiera preguntado por cocina. Con un producto en contexto, además, el
  // bloque remataba con "Contestá sobre ESE producto".
  it("pedir algo inexistente no le nombra otro producto a la IA", async () => {
    const decision = await computeDecision(
      memoriaCon({
        currentProductId: 123,
        currentProductName: "CURSO DE PIANO COMPLETO",
        sentProductIds: new Set([123]),
      }),
      "tienen curso de cocina?",
      catalogo,
      sinCategorias,
      null
    );

    expect(decision.productoDelMensaje).toBeNull();
    expect(decision.contextBlock).not.toContain("INGLES");
    expect(decision.contextBlock).not.toContain("Producto seleccionado");
  });

  it("no convierte en producto una coincidencia de descripción", async () => {
    const decision = await computeDecision(
      memoriaCon(),
      "me interesa un curso de soldadura",
      catalogo,
      sinCategorias,
      null
    );

    expect(decision.productoDelMensaje).toBeNull();
    expect(decision.contextBlock).not.toContain("CURSO REPARACIÓN DE CELULARES");
  });

  // Lo de arriba no puede lograrse volviendo mudo al bot: cuando el cliente SÍ
  // nombra un producto del catálogo, tiene que identificarlo.
  it("cuando el producto sí existe, lo identifica para la IA", async () => {
    const decision = await computeDecision(
      memoriaCon(),
      "quiero el curso de mecanica de motos",
      catalogo,
      sinCategorias,
      null
    );

    expect(decision.productoDelMensaje).not.toBeNull();
    expect(decision.productoDelMensaje?.name).toBe("CURSO MECANICA DE MOTOS");
  });

  // El cliente cambia de tema: nombra un producto distinto al que se venía
  // hablando. Gana el del mensaje, no el del historial.
  //
  // Según la intención, el motor deja el producto en un campo o en el otro
  // (`productToShow` cuando hay intención de pago, `productoDelMensaje` cuando
  // es consulta). Lo que importa acá es de cuál producto va a hablar el bot.
  const productoElegido = (d: Awaited<ReturnType<typeof computeDecision>>) =>
    d.productToShow?.name ?? d.productoDelMensaje?.name ?? null;

  it("nombrar otro producto desplaza al que venía en foco", async () => {
    const decision = await computeDecision(
      memoriaCon({
        currentProductId: 123,
        currentProductName: "CURSO DE PIANO COMPLETO",
        sentProductIds: new Set([123]),
      }),
      "me interesa mas el curso de ingles oxford",
      catalogo,
      sinCategorias,
      null
    );

    expect(productoElegido(decision)).toBe("CURSO INGLES OXFORD");
  });

  // REGRESIÓN. "cuánto vale" se clasifica como intención de PAGO, y esa guarda
  // cancelaba la búsqueda de producto por completo: el cliente preguntaba el
  // precio del inglés y el bot le contestaba —y le mandaba la ficha de pago—
  // del PIANO, que era lo anterior. Preguntar el precio de otro producto es de
  // los mensajes más frecuentes que existen.
  it("preguntar el precio de OTRO producto no cobra el anterior", async () => {
    const decision = await computeDecision(
      memoriaCon({
        currentProductId: 123,
        currentProductName: "CURSO DE PIANO COMPLETO",
        sentProductIds: new Set([123]),
      }),
      "y el curso de ingles oxford cuanto vale?",
      catalogo,
      sinCategorias,
      null
    );

    expect(productoElegido(decision)).toBe("CURSO INGLES OXFORD");
  });

  // La contracara: una pregunta sobre el producto en foco NO debe moverlo.
  // Ese era el motivo por el que existían las guardas, y tiene que seguir en pie.
  it("preguntar por el producto en foco no lo cambia", async () => {
    for (const mensaje of ["¿qué incluye?", "¿cómo pago?", "¿qué contenido trae?", "¿cuánto dura?"]) {
      const decision = await computeDecision(
        memoriaCon({
          currentProductId: 123,
          currentProductName: "CURSO DE PIANO COMPLETO",
          sentProductIds: new Set([123]),
        }),
        mensaje,
        catalogo,
        sinCategorias,
        null
      );

      const elegido = productoElegido(decision);
      expect(elegido === null || elegido === "CURSO DE PIANO COMPLETO").toBe(true);
    }
  });
});
