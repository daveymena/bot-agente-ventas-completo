import { describe, it, expect } from "vitest";
import {
  opcionesDe,
  opcionesPendientes,
  opcionesElegidas,
  valorElegido,
  preguntaPorLaOpcion,
  hayStock,
} from "../opciones-del-producto";
import type { MensajeHist } from "../estado-cognitivo";

/**
 * Talla, color, cantidad: lo que una tienda necesita y este sistema no tenía.
 *
 * El admin: *"si un cliente nuevo entra al negocio tenés que tener habilitado
 * todo eso, como lo hace WordPress"*.
 *
 * Lo que se cuida acá tiene dos caras, y las dos duelen:
 *
 *   · cerrar el pedido SIN la talla  -> llega la prenda equivocada, hay
 *     devolución, y el negocio paga el envío dos veces;
 *   · preguntar la talla a quien ya la dijo -> el "no tiene memoria de lo que
 *     pasa" que el admin viene reportando.
 *
 * Y una tercera que es la más fácil de romper sin darse cuenta: que nada de
 * esto le cambie una coma al negocio que NO usa opciones, o sea a los 84
 * cursos que hoy están vendiendo.
 */

const cliente = (content: string): MensajeHist => ({ role: "customer", content });
const bot = (content: string): MensajeHist => ({ role: "assistant", content });

const CAMISA = {
  name: "Camisa de lino",
  opciones: [
    { nombre: "Talla", valores: ["S", "M", "L", "XL"], obligatoria: true },
    { nombre: "Color", valores: ["Blanco", "Negro", "Azul"], obligatoria: true },
    { nombre: "Mensaje de regalo", valores: ["Sí", "No"], obligatoria: false },
  ],
};

const CURSO = { name: "Curso de Piano", opciones: null };

describe("un negocio SIN opciones no cambia en nada", () => {
  it("un curso no tiene nada pendiente", () => {
    expect(opcionesDe(CURSO)).toEqual([]);
    expect(opcionesPendientes(CURSO, [cliente("me interesa")])).toEqual([]);
  });

  it("y tampoco si el campo viene vacío o corrupto", () => {
    for (const raro of [undefined, "", "no-es-json", "{}", 42, [{ sinNombre: true }]]) {
      expect(opcionesDe({ opciones: raro }), String(raro)).toEqual([]);
    }
  });
});

describe("una tienda SÍ tiene que elegir antes de comprar", () => {
  it("al principio faltan las dos obligatorias", () => {
    const p = opcionesPendientes(CAMISA, [cliente("quiero la camisa")]);
    expect(p.map((o) => o.nombre)).toEqual(["Talla", "Color"]);
  });

  it("la opcional NUNCA bloquea la compra", () => {
    // Un mensaje de regalo es un extra; una talla no.
    const p = opcionesPendientes(CAMISA, [cliente("quiero la camisa talla M color negro")]);
    expect(p).toEqual([]);
  });

  it("si ya lo dijo tres mensajes atrás, no se le vuelve a preguntar", () => {
    // Repreguntar es el "no tiene memoria de lo que pasa" que el admin reportó.
    const historial = [
      cliente("quiero la camisa en M"),
      bot("¡Buenísimo! ¿De qué color?"),
      cliente("mmm déjame ver"),
      bot("Sin problema 🙌"),
      cliente("la negra"),
    ];
    expect(opcionesPendientes(CAMISA, historial)).toEqual([]);
    expect(opcionesElegidas(CAMISA, historial)).toEqual([
      { nombre: "Talla", valor: "M" },
      { nombre: "Color", valor: "Negro" },
    ]);
  });

  it("lo que dice el BOT no cuenta como elección del cliente", () => {
    // El bot nombra las tallas al ofrecerlas. Si eso contara, quedaría elegida
    // sola y el pedido saldría con la primera que el bot mencionó.
    const historial = [cliente("quiero la camisa"), bot("¿En qué talla? Tengo S, M, L, XL")];
    expect(opcionesPendientes(CAMISA, historial).map((o) => o.nombre)).toContain("Talla");
  });
});

describe("reconocer el valor sin adivinar", () => {
  const talla = CAMISA.opciones[0];

  it("gana el valor MÁS LARGO: 'la XL' no es 'L'", () => {
    expect(valorElegido(talla, "quiero la XL")).toBe("XL");
    expect(valorElegido(talla, "dame la L")).toBe("L");
  });

  it("no elige una talla escondida dentro de otra palabra", () => {
    // "s" está dentro de "sí", "gracias" y casi cualquier frase. Con un
    // `includes` suelto, cualquier mensaje elegiría la talla S -- es el mismo
    // atajo que ya salió caro en el chequeo del teléfono del admin.
    for (const frase of ["sí", "gracias", "listo", "sale", "buenas"]) {
      expect(valorElegido(talla, frase), frase).toBeNull();
    }
  });

  it("los acentos, el género y las mayúsculas no importan", () => {
    // En castellano el cliente NO repite la etiqueta del catálogo: el negocio
    // carga "Negro" y la persona escribe "la negra", porque habla de una
    // camisa. Sin esto, una tienda de ropa no reconocería casi ninguna
    // respuesta y volvería a preguntar el color en cada turno.
    const color = CAMISA.opciones[1];
    expect(valorElegido(color, "la NEGRA porfa")).toBe("Negro");
    expect(valorElegido(color, "azul porfa")).toBe("Azul");
    expect(valorElegido(color, "las blancas")).toBe("Blanco");
  });

  it("si nombró DOS colores, no adivina: prefiere volver a preguntar", () => {
    // "la blanca no, la negra" menciona los dos, y entender la negación es
    // donde un sistema se equivoca en silencio. Elegir mal acá no es un
    // detalle de conversación: es despachar el color equivocado y pagar una
    // devolución. Preguntar de más cuesta un mensaje; acertar de menos cuesta
    // un envío.
    const color = CAMISA.opciones[1];
    expect(valorElegido(color, "la BLANCA no, la NEGRA")).toBeNull();
  });
});

describe("la pregunta", () => {
  it("muestra los valores para que no tenga que adivinar", () => {
    const q = preguntaPorLaOpcion(CAMISA.opciones[0]);
    expect(q).toContain("S, M, L, XL");
    expect(q.toLowerCase()).toContain("talla");
  });

  it("con muchos valores no vuelca la lista entera", () => {
    const q = preguntaPorLaOpcion({ nombre: "Talla", valores: ["34","36","38","40","42","44","46","48"] });
    expect(q).toContain("…");
  });
});

describe("stock", () => {
  it("sin control de stock, se vende igual", () => {
    // `null` significa "este negocio no lleva control", no "se agotó". Sin esta
    // distinción, los 84 cursos aparecerían agotados el día que se agrega la
    // columna.
    expect(hayStock({ stock: null }).hay).toBe(true);
    expect(hayStock({}).hay).toBe(true);
  });

  it("con unidades, se vende; en cero, no", () => {
    expect(hayStock({ stock: 3 }).hay).toBe(true);
    expect(hayStock({ stock: 0 }).hay).toBe(false);
    expect(hayStock({ stock: 0 }).porQue).toContain("no queda");
  });

  it("un stock corrupto NO frena la venta", () => {
    // Ante la duda se vende: un dato malo no puede costarle ventas al negocio.
    expect(hayStock({ stock: "muchos" }).hay).toBe(true);
  });
});
