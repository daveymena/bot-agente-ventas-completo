import { describe, it, expect } from "vitest";
import {
  prometeEntregaFisica, sinLaPromesaFisica,
  lineasDeTemarioInventadas, sinElTemarioInventado, comoSeEntregaDeVerdad,
} from "../solo-lo-que-dice-la-ficha";

/** El producto REAL 124, con la descripción que escribió el dueño. */
const CURSO_IA = {
  id: 124,
  name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  kind: "digital",
  deliveryLink: "https://drive.google.com/drive/folders/abc",
  description:
    "3 cursos de IA en uno: domina Claude, automatiza sin código y crea agentes que trabajen por ti 24/7. " +
    "MASTER EN AGENTES IA — 39 módulos. CURSO COMPLETO DE CLAUDE AI — 13 módulos. Gemini. " +
    "n8n sin código: agente IA, APIs, webhooks y RAG. Claude Code y Claude Design. " +
    "Agentes con OpenClaw, hasta montarlos en un servidor. Conecta WhatsApp, Telegram, Slack y Google.",
};

const COJIN = { id: 55, name: "Cojín ortopédico para moto", kind: "physical", description: "Gel de alta densidad." };

/**
 * Lo que el bot le mandó de verdad a un cliente el 2026-09-02 a las 09:45.
 * Ese temario no existe: se lo inventó entero.
 */
const MENSAJE_REAL = `Te muestro el contenido completo del curso:

🤖 Módulo 1 – Fundamentos de IA
🛠️ Módulo 2 – Herramientas esenciales
⚙️ Módulo 3 – Agentes autónomos
📦 Módulo 4 – Proyectos prácticos

Pago contra entrega: pagas cuando recibes el material en tu WhatsApp
Entrega inmediata`;

describe("Un curso que llega por enlace no se paga contra entrega", () => {
  it("reconoce la promesa imposible del caso real", () => {
    expect(prometeEntregaFisica(MENSAJE_REAL, CURSO_IA)).toBe(true);
  });

  it("las otras formas de prometer una entrega física", () => {
    for (const t of [
      "Pagas cuando lo recibes en tu casa 😊",
      "Llega en 3 a 5 días hábiles a cualquier ciudad",
      "Envío a todo el país con transportadora",
      "El mensajero te lo entrega y ahí pagas",
    ]) {
      expect(prometeEntregaFisica(t, CURSO_IA), t).toBe(true);
    }
  });

  it("pero en un producto FÍSICO todo eso es verdad y no se toca", () => {
    expect(prometeEntregaFisica("Llega en 3 a 5 días hábiles y pagas contra entrega", COJIN)).toBe(false);
  });

  it("se saca la línea que miente y se conserva el resto", () => {
    const limpio = sinLaPromesaFisica(MENSAJE_REAL);
    expect(limpio).not.toMatch(/contra entrega/i);
    expect(limpio).toMatch(/Módulo 1/);
    expect(limpio).toMatch(/Entrega inmediata/);
  });

  it("y lo que corresponde decir sale de los datos del producto", () => {
    expect(comoSeEntregaDeVerdad(CURSO_IA)).toMatch(/enlace de acceso/i);
    expect(prometeEntregaFisica(comoSeEntregaDeVerdad(CURSO_IA), CURSO_IA)).toBe(false);
  });
});

describe("El temario tiene que estar en la ficha del dueño", () => {
  it("los módulos inventados del caso real se detectan", () => {
    const malas = lineasDeTemarioInventadas(MENSAJE_REAL, CURSO_IA);
    expect(malas.length).toBeGreaterThan(0);
    expect(malas.join(" ")).toMatch(/Fundamentos/);
  });

  it("un temario que SÍ está en la ficha pasa entero", () => {
    const bueno = `Módulo 1 – Master en Agentes IA
Módulo 2 – Claude AI completo
Módulo 3 – n8n sin código`;
    expect(lineasDeTemarioInventadas(bueno, CURSO_IA)).toEqual([]);
  });

  it("cae el temario entero, y el mensaje remite a la ficha", () => {
    // Sacar solo los inventados dejaba una lista con huecos --"Nivel 2" suelto,
    // sin 1, 3 ni 4-- que se lee peor que ninguna. Y si el modelo invento parte
    // del plan, la lista entera dejo de ser confiable.
    const limpio = sinElTemarioInventado(MENSAJE_REAL, CURSO_IA);
    expect(limpio).not.toMatch(/Fundamentos de IA/);
    expect(limpio).not.toMatch(/Módulo 4/);
    expect(limpio).toMatch(/Te muestro el contenido/);
    expect(limpio).toMatch(/ficha completa/i);
  });

  it("sin ficha no se acusa a nadie", () => {
    expect(lineasDeTemarioInventadas(MENSAJE_REAL, { id: 9, name: "X", description: "" })).toEqual([]);
    expect(lineasDeTemarioInventadas(MENSAJE_REAL, null)).toEqual([]);
  });

  it("el texto normal de una venta no se toca", () => {
    const normal = "El curso cuesta $60.000 y el acceso es de por vida. ¿Te lo dejo listo?";
    expect(lineasDeTemarioInventadas(normal, CURSO_IA)).toEqual([]);
    expect(sinElTemarioInventado(normal, CURSO_IA)).toBe(normal);
  });
});

/**
 * El caso del curso de piano (2026-09-02, 10:42) que se le escapo a la primera
 * version: el mensaje llego casi entero en UNA sola linea, y midiendo por
 * renglon el temario inventado quedaba mezclado con texto que si esta
 * respaldado. El renglon entero pasaba.
 */
describe("Da igual si el modelo escribe en renglones o de corrido", () => {
  const PIANO = {
    id: 123, kind: "digital",
    name: "Curso de Piano Completo: De Cero a Nivel Avanzado",
    description:
      "Tocar piano: independencia y coordinacion de ambas manos, lectura de partituras y dominio del " +
      "instrumento. 19 modulos en video con teoria y lenguaje musical, lectura ritmica, fraseo y expresion. " +
      "Repertorio: 5 valses de Alberto Martinez, baladas, pop, blues y jazz, e improvisacion con progresiones " +
      "y escalas. Tecnicas de acompanamiento y musica clasica moderna. Partituras y ejercicios.",
  };

  const UNA_SOLA_LINEA =
    "Te paso el contenido completo del curso de piano: 🎼 Nivel 1 – Fundamentos ✅ Conoce el teclado y las " +
    "notas ✅ Postura correcta de manos y cuerpo 🎵 Nivel 2 – Lectura musical ✅ Lee partituras desde cero " +
    "🎶 Nivel 3 – Tecnica intermedia ✅ Acordes mayores y menores Nivel 4 – Avanzado ✅ Repertorio completo";

  it("el temario inventado se detecta aunque venga todo en una linea", () => {
    expect(lineasDeTemarioInventadas(UNA_SOLA_LINEA, PIANO).length).toBeGreaterThan(0);
  });

  it("y no queda ningun nivel suelto en el mensaje", () => {
    const limpio = sinElTemarioInventado(UNA_SOLA_LINEA, PIANO);
    expect(limpio).not.toMatch(/Nivel \d/);
    expect(limpio).toMatch(/Te paso el contenido/);
  });

  it("pero un temario sacado de la ficha sale completo", () => {
    const bueno =
      "Modulo 1: lectura de partituras y coordinacion de ambas manos. " +
      "Modulo 2: repertorio con valses de Alberto Martinez, blues y jazz.";
    expect(lineasDeTemarioInventadas(bueno, PIANO)).toEqual([]);
    expect(sinElTemarioInventado(bueno, PIANO)).toBe(bueno);
  });
});
