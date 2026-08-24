/**
 * Los dos bugs de la conversación 13 (Samuel Antolinez, 2026-08-24).
 *
 * El cliente venía de un anuncio del curso de piano. Esto es lo que quedó
 * guardado, textual:
 *
 *   cliente: "¡Hola! Me gustaría conseguir más información sobre esto."
 *   agente:  "...te cuento todo sobre el piano desde cero..."
 *   cliente: "key"                                        ← nadie escribió eso
 *   agente:  "¡Aquí lo tienes! 👇  [CARD: LIQUID FIBRA \"DESINTOXICACION\"]"
 *   cliente: "Pero cuanto es el costo del curso?."
 *
 * Dos fallos encadenados, y los dos le llegaron al cliente:
 *  1. "key" es el campo `msg.key` de Baileys, no un mensaje. El rebusque de
 *     texto leía el JSON como cadena, así que capturaba NOMBRES DE CAMPO.
 *  2. El marcador con el nombre de un producto (y encima el equivocado) no
 *     matcheaba el patrón `[\w-]+`, así que ni se resolvía la ficha ni se
 *     limpiaba: se envió crudo, con corchetes.
 */
import { describe, it, expect } from "vitest";
import { pareceMensajeDePersona } from "../whatsapp";

// ─── Bug 1: nombres de campo colándose como mensaje del cliente ──────────────

/** El rebusque de whatsapp.ts, tal cual quedó: recorre VALORES, nunca claves. */
function textoDelMensaje(msgObj: any): string | null {
  const valores: string[] = [];
  const recolectar = (o: any, prof = 0): void => {
    if (prof > 8 || valores.length > 200) return;
    if (typeof o === "string") { valores.push(o); return; }
    if (o && typeof o === "object") for (const v of Object.values(o)) recolectar(v, prof + 1);
  };
  recolectar(msgObj);

  const hallado = valores
    .filter((s) => s.length > 2 && !s.includes("http") && !s.includes("@") && !/^\d+$/.test(s))
    .filter((s) => /\s/.test(s.trim()) || /^[a-záéíóúñ¿¡?!.,]{2,15}$/i.test(s.trim()))
    .find((s) => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s));

  return hallado && pareceMensajeDePersona(hallado) ? hallado : null;
}

describe("Al agente solo le llega lo que escribió una persona", () => {
  it("un mensaje sin texto NO produce 'key' ni ningún otro nombre de campo", () => {
    // Forma real de un mensaje de Baileys sin contenido de texto.
    const msg = {
      key: { remoteJid: "573144096147@s.whatsapp.net", fromMe: false, id: "3EB0C767D2" },
      messageTimestamp: 1787529942,
      status: "DELIVERY_ACK",
      reactionMessage: { key: { id: "3EB0" }, text: "👍" },
    };
    const t = textoDelMensaje(msg);
    expect(t).not.toBe("key");
    expect(t).not.toBe("status");
    expect(t).not.toBe("message");
  });

  it("recorrer valores no puede devolver una clave, sea cual sea el objeto", () => {
    // Claves que antes pasaban el filtro por ser de una sola palabra en
    // minúscula: el filtro de campo técnico exigía camelCase.
    const msg = { key: {}, status: {}, message: {}, url: {}, type: {}, media: {} };
    expect(textoDelMensaje(msg)).toBeNull();
  });

  it("pero un mensaje de verdad sí pasa", () => {
    const msg = { key: { id: "x" }, message: { conversation: "cuanto vale el curso?" } };
    expect(textoDelMensaje(msg)).toBe("cuanto vale el curso?");
  });

  it("y una palabra suelta real también", () => {
    const msg = { key: { id: "x" }, message: { conversation: "hola" } };
    expect(textoDelMensaje(msg)).toBe("hola");
  });
});

// ─── Bug 2: el marcador de ficha llegando crudo al cliente ───────────────────

const RE_CARD = /\[CARD:\s*([^\]]+?)\s*\]/gi;
const LIMPIEZA = /\[CARD:\s*[^\]]*\]/gi;

describe("El marcador de ficha nunca puede llegarle al cliente", () => {
  it("captura el marcador exacto que se envió crudo en producción", () => {
    const texto = '¡Aquí lo tienes! 👇\n\n[CARD: LIQUID FIBRA "DESINTOXICACION"]';
    const m = [...texto.matchAll(RE_CARD)];
    expect(m.length).toBe(1);
    expect(m[0]![1]).toBe('LIQUID FIBRA "DESINTOXICACION"');
  });

  it("y lo limpia del texto, con comillas y espacios incluidos", () => {
    const texto = '¡Aquí lo tienes! 👇\n\n[CARD: LIQUID FIBRA "DESINTOXICACION"]';
    expect(texto.replace(LIMPIEZA, "").trim()).toBe("¡Aquí lo tienes! 👇");
  });

  it("sigue tomando el marcador normal por id", () => {
    const m = [...'Te dejo la ficha [CARD: 123]'.matchAll(RE_CARD)];
    expect(m[0]![1]).toBe("123");
  });

  it("no se come el mensaje entero cuando hay varios", () => {
    const texto = "Mirá [CARD: 123] y también [CARD: Curso de Piano] listo";
    expect([...texto.matchAll(RE_CARD)].length).toBe(2);
    expect(texto.replace(LIMPIEZA, "").replace(/\s+/g, " ").trim()).toBe("Mirá y también listo");
  });
});

// ─── Resolver el nombre contra el catálogo ──────────────────────────────────

const CATALOGO = [
  { id: 123, name: "CURSO DE PIANO COMPLETO" },
  { id: 163, name: "Cojín Moto Viajero 3D" },
  { id: 87, name: "PACK CONTABILIDAD" },
  { id: 118, name: "EXCEL" },
  { id: 122, name: "MEGAPACK 81 EN 1" },
];

function resolverPorNombre(escritoRaw: string, productos: typeof CATALOGO): number | null {
  const norm = (t: string) => String(t || "").toLowerCase().replace(/["'*_]/g, "").trim();
  const escrito = norm(escritoRaw);
  if (escrito.length < 4) return null;
  const c = productos.filter((p) => {
    const n = norm(p.name);
    if (n === escrito) return true;
    if (escrito.length < 8) return false;   // una palabra genérica no identifica nada
    return n.includes(escrito) || escrito.includes(n);
  });
  return c.length === 1 ? c[0]!.id : null;
}

describe("Si la IA escribe el nombre, se resuelve el producto", () => {
  it("nombre exacto", () => {
    expect(resolverPorNombre("CURSO DE PIANO COMPLETO", CATALOGO)).toBe(123);
  });

  it("con comillas y asteriscos del modelo", () => {
    expect(resolverPorNombre('"Cojín Moto Viajero 3D"', CATALOGO)).toBe(163);
    expect(resolverPorNombre("**PACK CONTABILIDAD**", CATALOGO)).toBe(87);
  });

  it("un nombre que no existe NO inventa un producto", () => {
    // El caso real: ese producto no está en el catálogo.
    expect(resolverPorNombre('LIQUID FIBRA "DESINTOXICACION"', CATALOGO)).toBeNull();
  });

  it("ante la duda no elige: mandar la ficha equivocada es peor que no mandarla", () => {
    // "EXCEL" está contenido en dos nombres si se busca algo demasiado corto.
    expect(resolverPorNombre("a", CATALOGO)).toBeNull();
    expect(resolverPorNombre("curso", CATALOGO)).toBeNull();
  });
});
