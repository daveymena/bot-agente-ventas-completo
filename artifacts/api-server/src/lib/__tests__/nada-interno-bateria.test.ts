/**
 * LO DE ADENTRO NO SALE: la bateria completa.
 *
 * El admin pidio el 2026-09-03 "endurecer las reglas para que no tengamos fuga
 * de informacion". En vez de suponer que faltaba, se le pasaron al guardia 20
 * frases que el bot podria llegar a decir.
 *
 * PASARON 19.
 *
 * Lo que habia cubria dos familias --nombres de proveedores ("GPT-4") y "estoy
 * hecho con"-- y dejaba afuera la mas comun: el asistente hablando de su propia
 * maquinaria SIN nombrar a ningun proveedor. "Como modelo de lenguaje", "mi
 * entrenamiento", "el administrador configuro", "tuve un error 500".
 *
 * Varias de esas hacen algo peor que filtrar: le avisan al cliente que del otro
 * lado hay un programa con fallas, justo cuando esta por pagar.
 *
 * La otra mitad de la prueba es igual de importante: el negocio TIENE que poder
 * hablar de lo que vende. Un candado que corta "aprendes a usar ChatGPT" en un
 * negocio que vende un curso de ChatGPT no protege nada, borra la venta.
 */
import { describe, it, expect } from "vitest";
import { delataLoInterno, vocabularioDelNegocio } from "../nada-interno";

/** Un negocio real de este SaaS: vende cursos de IA, piano y programacion. */
const VOCAB = vocabularioDelNegocio([
  { name: "Curso completo de IA", description: "Aprende a usar ChatGPT, Claude, Gemini y n8n para tu negocio. Incluye plantillas de prompts, bases de datos y hosting." },
  { name: "Curso de Piano", description: "De cero a nivel avanzado" },
  { name: "Curso de programacion", description: "Node, React, typescript y bases de datos desde cero" },
]);

describe("lo de adentro no sale", () => {
  const NO_DEBE_SALIR = [
  "Soy una inteligencia artificial entrenada por OpenAI.",
  "Mi entrenamiento llega hasta 2024.",
  "Como modelo de lenguaje, no puedo hacer eso.",
  "No tengo acceso a esa información en mi base de conocimientos.",
  "Segun mi contexto, el producto cuesta 60000.",
  "Voy a consultar el sistema para ver que dice.",
  "Deja reviso en el panel de administracion.",
  "El administrador configuro este catalogo.",
  "Mi configuracion no me permite dar descuentos.",
  "Un momento, estoy procesando tu solicitud con mi motor.",
  "Ese dato no esta en el prompt que me dieron.",
  "Trabajo con la plataforma VentasPro del dueno.",
  "Estoy usando el modelo mas rapido para contestarte.",
  "Perdon, tuve un error 500.",
  "Se me cayo la conexion con el servidor.",
  "Mi desarrollador me configuro asi.",
  "No puedo acceder a la base de datos ahora.",
  "Soy un asistente virtual basado en IA generativa.",
  "Estoy en fase de pruebas todavia.",
  "Mi version actual no soporta eso.",
];

  it.each(NO_DEBE_SALIR)("no deja pasar: %s", (frase) => {
    expect(delataLoInterno(frase)).toBe(true);
  });

  /**
   * REGRESION: el pronombre se mete en el medio ("se ME cayo la conexion"), y
   * una regex que no lo contempla falla justo con la forma en que la gente
   * escribe de verdad.
   */
  it("aguanta el pronombre en el medio", () => {
    expect(delataLoInterno("se me cayo la conexion con el servidor")).toBe(true);
    expect(delataLoInterno("se nos cayo el sistema")).toBe(true);
  });
});

describe("pero el negocio si puede hablar de lo que vende", () => {
  const SI_DEBE_SALIR = [
  "El curso te ensena a usar ChatGPT y Claude para tu negocio.",
  "Aprendes a crear agentes con n8n y OpenAI paso a paso.",
  "El modulo 3 es sobre bases de datos para principiantes.",
  "Incluye plantillas de prompts listas para copiar.",
  "Es un curso de programacion en Node y React.",
  "Te ensenamos a montar tu tienda con hosting incluido.",
  "El curso cuesta 60.000 y tiene acceso de por vida.",
  "Tenemos el de piano y el de inteligencia artificial.",
];

  it.each(SI_DEBE_SALIR)("deja pasar: %s", (frase) => {
    expect(delataLoInterno(frase, VOCAB)).toBe(false);
  });

  /**
   * El catalogo por si solo no alcanzaba: "aprendes a crear agentes con n8n y
   * OpenAI" quedaba bloqueado porque el dueno no habia escrito "OpenAI" en la
   * descripcion -- aunque la oracion diga con todas las letras que es lo que el
   * cliente va a APRENDER. Ahora la FRASE tambien puede enmarcarlo.
   */
  it("un proveedor dentro de una frase de catalogo no es fuga", () => {
    expect(delataLoInterno("Aprendes a crear agentes con n8n y OpenAI paso a paso.", VOCAB)).toBe(false);
  });

  /**
   * Y el limite de eso: nombrar el curso NO autoriza a hablar de la
   * maquinaria. "El curso corre en mi servidor" menciona el curso y sigue
   * siendo una fuga.
   */
  it("nombrar el curso no habilita a hablar del sistema", () => {
    expect(delataLoInterno("El curso corre en mi servidor de OpenAI", VOCAB)).toBe(true);
  });
});
