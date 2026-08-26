import { describe, it, expect } from "vitest";
import {
  responderPregunta, preguntasSinResponder, tieneConocimiento, aperturaPara,
} from "../conocimiento-producto";

/**
 * Cuando el cliente preguntaba algo que no estaba en la ficha, el modelo lo
 * respondía de memoria. De ahí salieron el "certificado de participación"
 * inventado, el "Portuñol" como idioma y los plazos de entrega imaginarios.
 *
 * Acá cada pregunta conocida tiene UNA respuesta escrita por el negocio.
 */
const PIANO = 123;
const PERRO = 76;

describe("las preguntas de siempre tienen respuesta verificada", () => {
  it("certificado: dice que NO, que es lo que declara el negocio", () => {
    const r = responderPregunta(PIANO, "y trae certificado?");
    expect(r?.texto).toMatch(/no emite certificado/i);
    expect(r?.sinResponder).toBe(false);
  });

  it("garantía: 7 días, como está en el perfil", () => {
    expect(responderPregunta(PIANO, "tiene garantia?")?.texto).toMatch(/7 d[ií]as/);
  });

  it("presencial: dice que es online, no inventa una sede", () => {
    // "¿Dónde es la academia?" fue el mensaje que costó un cliente real.
    const r = responderPregunta(PIANO, "donde es la academia?");
    expect(r?.texto).toMatch(/online/i);
    expect(r?.texto).toMatch(/no hay sede/i);
  });

  it("cómo llega: Google Drive, no un envío", () => {
    expect(responderPregunta(PERRO, "como me llega?")?.texto).toMatch(/drive/i);
  });
});

describe("cada producto responde lo suyo", () => {
  it("qué incluye el piano habla de partituras", () => {
    expect(responderPregunta(PIANO, "que incluye?")?.texto).toMatch(/partituras/i);
  });

  it("qué incluye educanino habla de conductas, no de partituras", () => {
    const r = responderPregunta(PERRO, "que incluye?")?.texto ?? "";
    expect(r).toMatch(/obediencia/i);
    expect(r).not.toMatch(/partitura/i);
  });

  it("la del producto le gana a la genérica", () => {
    // Las dos matchean "qué incluye"; tiene que ganar la del curso.
    expect(responderPregunta(PERRO, "que trae el curso")?.id).toBe("perro_incluye");
  });
});

describe("un problema concreto del perro encuentra su módulo", () => {
  it("mensajes reales de cliente", () => {
    for (const m of ["mi perro muerde", "ladra todo el dia", "es muy agresivo", "destruye todo cuando salgo"]) {
      const r = responderPregunta(PERRO, m);
      expect(r, m).not.toBeNull();
      expect(r!.texto, m).toMatch(/agresividad|conductas|ansiedad/i);
    }
  });
});

describe("las preguntas que frenan la venta ya están respondidas", () => {
  it("cuánto dura el piano: 19 módulos y 283 clases", () => {
    const r = responderPregunta(PIANO, "cuanto dura el curso?");
    expect(r?.sinResponder).toBe(false);
    expect(r?.texto).toMatch(/19 m[oó]dulos/i);
  });

  it("si necesita teclado: sí, y cualquiera sirve para empezar", () => {
    const r = responderPregunta(PIANO, "necesito un teclado?");
    expect(r?.sinResponder).toBe(false);
    expect(r?.texto).toMatch(/piano o teclado/i);
  });

  it("edad del piano: todas las edades", () => {
    expect(responderPregunta(PIANO, "sirve para mi hijo?")?.texto).toMatch(/todas las edades/i);
  });

  it("raza del perro: cualquiera, incluidos criollos", () => {
    expect(responderPregunta(PERRO, "sirve para un criollo?")?.texto).toMatch(/cualquier raza/i);
  });

  it("cachorro: desde cachorro hasta adulto mayor", () => {
    expect(responderPregunta(PERRO, "mi perro es cachorro, sirve?")?.texto).toMatch(/cachorro/i);
  });

  it("nunca devuelve una respuesta vacía", () => {
    for (const m of ["cuanto dura", "necesito teclado", "sirve para cachorros", "que raza"]) {
      const r = responderPregunta(PIANO, m) ?? responderPregunta(PERRO, m);
      if (r) expect(r.texto.length, m).toBeGreaterThan(10);
    }
  });

  it("se puede saber qué falta por responder", () => {
    // Hoy no falta ninguna. La función tiene que seguir existiendo para
    // cuando se agregue un producto nuevo con preguntas sin contestar.
    expect(Array.isArray(preguntasSinResponder())).toBe(true);
  });
});

describe("no finge saberlo todo", () => {
  it("una pregunta que no está en la lista devuelve null, y responde el modelo", () => {
    expect(responderPregunta(PIANO, "tu jefe como se llama?")).toBeNull();
    expect(responderPregunta(PIANO, "")).toBeNull();
  });

  it("sin producto en contexto igual responde lo común", () => {
    expect(responderPregunta(null, "tiene garantia?")).not.toBeNull();
  });

  it("solo hay conocimiento de los productos cargados", () => {
    expect(tieneConocimiento(PIANO)).toBe(true);
    expect(tieneConocimiento(999)).toBe(false);
    expect(tieneConocimiento(null)).toBe(false);
  });
});

describe("la apertura varía pero no promete nada", () => {
  it("no afirma nada del producto", () => {
    const prohibido = /excelente elecci[oó]n|te va a encantar|el mejor|buen[ií]simo que preguntes/i;
    for (const s of ["573001", "573002", "573003", "573004", "573005", "573006", ""]) {
      expect(aperturaPara(s)).not.toMatch(prohibido);
    }
  });

  it("dos clientes distintos no reciben siempre la misma", () => {
    const vistas = new Set(["1", "2", "3", "4", "5", "6"].map(aperturaPara));
    expect(vistas.size).toBeGreaterThan(1);
  });

  it("es corta: no puede comerse el mensaje", () => {
    expect(aperturaPara("573136174267").length).toBeLessThan(30);
  });
});

const IA = 124;

describe("curso de IA: solo lo que dice su propia descripción", () => {
  it("qué incluye lista los 4 módulos", () => {
    const r = responderPregunta(IA, "que incluye?")?.texto ?? "";
    expect(r).toMatch(/agentes aut[oó]nomos/i);
    expect(r).toMatch(/n8n/i);
  });

  it("preguntar por una herramienta concreta la encuentra", () => {
    for (const m of ["trae midjourney?", "enseña n8n?", "incluye chatgpt"]) {
      expect(responderPregunta(IA, m), m).not.toBeNull();
    }
  });

  it("si hay que programar: no, n8n es sin código", () => {
    expect(responderPregunta(IA, "hay que saber programar?")?.texto).toMatch(/no necesitas programar/i);
  });

  it("la duración NO se inventó: no está en su descripción", () => {
    // A diferencia del piano, este es un pack armado: no hay curso publicado
    // contra el cual verificar las horas.
    expect(responderPregunta(IA, "cuanto dura?")?.sinResponder).toBe(true);
  });

  it("cada curso responde lo suyo, sin mezclarse", () => {
    expect(responderPregunta(IA, "que incluye?")?.texto).not.toMatch(/partitura|perro/i);
    expect(responderPregunta(PIANO, "que incluye?")?.texto).not.toMatch(/n8n|chatgpt/i);
  });
});
