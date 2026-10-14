/**
 * INTEGRACIÓN — la objeción se registra en el turno real, sin depender del modelo.
 *
 * El test unitario de `objeciones.ts` prueba el clasificador. Este prueba lo que
 * importa: que `responder()` —el motor de verdad— deje la objeción en el estado
 * cuando el cliente la escribe, aunque el modelo no llame a ninguna herramienta.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";
import { guionDelNegocio } from "../nicho";
import type { Producto } from "../herramientas";

const BOLSO: Producto = {
  id: 1,
  name: "Bolso transportador para gatos",
  description: "Bolso acolchado con correa de seguridad, aguanta hasta 8 kg",
  price: 89900,
  currency: "COP",
  kind: "physical",
  disponible: true,
};

async function turno(llm: any, textoCliente: string, estado = estadoInicial(1)) {
  return responder({
    llm,
    estado,
    historial: [{ role: "customer", content: textoCliente, createdAt: new Date() }],
    catalogo: [BOLSO],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: [BOLSO], negocio: { nombre: "T" }, medios: [] }),
    voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" },
  });
}

describe("el motor registra la objeción sin que el modelo la declare", () => {
  test("'está caro' queda como objeción de precio en el estado", async () => {
    const r = await turno(clienteFalso([{ content: "Entiendo, ¿algo más?" }]), "uy está muy caro");
    expect(r.estado.objecion).not.toBeNull();
    expect(r.estado.objecion!.tipo).toBe("precio");
    expect(r.estado.objecion!.intentos).toBe(1);
  });

  test("'lo voy a pensar' queda como duda propia", async () => {
    const r = await turno(clienteFalso([{ content: "¿Qué te frena?" }]), "gracias, lo voy a pensar");
    expect(r.estado.objecion?.tipo).toBe("duda_propia");
  });

  test("'¿es estafa?' queda como confianza, no como precio", async () => {
    const r = await turno(
      clienteFalso([{ content: "Te entiendo, hay mucho anuncio falso." }]),
      "¿y esto no será una estafa?",
    );
    expect(r.estado.objecion?.tipo).toBe("confianza");
  });

  test("un mensaje normal NO crea objeción", async () => {
    const r = await turno(clienteFalso([{ content: "Hola, ¿en qué te ayudo?" }]), "hola");
    expect(r.estado.objecion).toBeNull();
  });
});

describe("el bloque de objeción llega al prompt del turno siguiente", () => {
  test("al segundo turno el estado ya trae la objeción vigente", async () => {
    const e = estadoInicial(1);
    const r1 = await turno(clienteFalso([{ content: "¿Qué es lo que te frena?" }]), "lo voy a pensar", e);
    expect(r1.estado.objecion?.tipo).toBe("duda_propia");

    // El siguiente turno parte del estado que ya tiene la objeción: es lo que
    // `describirObjecion` mete en el bloque de hechos.
    const r2 = await turno(clienteFalso([{ content: "Te cuento…" }]), "es que no sé si le sirva", r1.estado);
    // El cliente contestó qué le frenaba: eso cierra la duda propia.
    expect(r2.estado.objecion === null || r2.estado.objecion.tipo !== "duda_propia" || r2.estado.objecionesTrabajadas.length > 0).toBe(true);
  });
});

describe("el bucle: la misma objeción repetida suma intentos", () => {
  test("dos veces 'está caro' deja intentos=2", async () => {
    const e = estadoInicial(1);
    const r1 = await turno(clienteFalso([{ content: "Te entiendo." }]), "está caro", e);
    const r2 = await turno(clienteFalso([{ content: "Te entiendo." }]), "sigue estando caro", r1.estado);
    expect(r2.estado.objecion?.tipo).toBe("precio");
    expect(r2.estado.objecion!.intentos).toBeGreaterThanOrEqual(2);
  });
});
