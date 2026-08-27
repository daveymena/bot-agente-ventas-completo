import { describe, it, expect } from "vitest";
import { supervisarRespuesta } from "../supervisor";

/**
 * De una conversación REAL de producción (2026-08-27, el admin probando de
 * punta a punta el curso de IA que salió en la campaña).
 *
 * El curso se entrega por Terabox. El bot escribió "Acceso inmediato por
 * Google Drive" y, tres mensajes después, "Enlace de descarga por Google
 * Drive". Nadie se lo preguntó: lo metió de adorno dentro de una ficha que él
 * mismo redactó.
 *
 * Eso importa porque el cliente paga esperando un Drive y recibe otra cosa --
 * y es el mismo patrón del certificado inventado: una promesa que después
 * alguien tiene que cumplir o devolver la plata.
 */

const IA = {
  id: 124,
  name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  price: 60000,
  kind: "digital",
  deliveryLink: "https://1024terabox.com/s/1h-tX0y5GdQYZwVNebtN_7Q",
};

// Este sí se entrega por Drive: nombrarlo es correcto y no se toca.
const INGLES = {
  id: 80,
  name: "CURSO INGLES OXFORD",
  price: 60000,
  kind: "digital",
  deliveryLink: "https://drive.google.com/drive/folders/1GUzgDNtq43nkJQYPc",
};

const revisar = (respuesta: string, ids: number[], productos = [IA, INGLES]) =>
  supervisarRespuesta({
    respuesta,
    mensajeCliente: "cuentame del curso",
    productos,
    idsEnContexto: ids,
    llevaCard: true,
  });

describe("no se promete una entrega por un servicio que no es", () => {
  it("saca 'Google Drive' de un producto que se entrega por Terabox", () => {
    const r = revisar("✅ Acceso inmediato por Google Drive", [124]);
    expect(r.texto).not.toMatch(/google\s*drive/i);
    // La frase útil sobrevive: "Acceso inmediato" es cierto y además vende.
    expect(r.texto).toMatch(/acceso inmediato/i);
    expect(r.hallazgos.map((h) => h.regla)).toContain("entrega-inventada");
  });

  it("agarra las DOS apariciones, no solo la primera", () => {
    // El caso real las tenía repetidas en la misma ficha. Con un regex /g mal
    // manejado (lastIndex movido por el .test previo) la primera se escapaba.
    const r = revisar(
      "✅ Acceso online por Google Drive, sin descarga\n✅ Enlace de descarga por Google Drive",
      [124],
    );
    expect(r.texto).not.toMatch(/google\s*drive/i);
  });

  it("no deja la preposición huérfana", () => {
    const r = revisar("Te llega vía Google Drive apenas confirmemos", [124]);
    expect(r.texto).not.toMatch(/\bv[ií]a\s*$|\bv[ií]a\s+apenas/i);
  });

  it("NO toca el producto que sí se entrega por Drive", () => {
    const r = revisar("✅ Acceso permanente vía Google Drive", [80]);
    expect(r.texto).toMatch(/google\s*drive/i);
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("entrega-inventada");
  });

  it("tampoco deja colar Dropbox ni MEGA", () => {
    for (const servicio of ["Dropbox", "onedrive", "WeTransfer"]) {
      const r = revisar(`Te lo mando por ${servicio} cuando confirmes`, [124]);
      expect(r.texto, servicio).not.toMatch(new RegExp(servicio, "i"));
    }
  });

  it("sin producto en contexto no adivina: deja el texto como está", () => {
    // Sin saber de qué producto se habla no hay contra qué comparar, y borrar
    // a ciegas sería peor que no hacer nada.
    const r = revisar("Te llega por Google Drive", []);
    expect(r.texto).toMatch(/google\s*drive/i);
  });

  it("un texto sin servicios pasa intacto", () => {
    const t = "Te llega por un enlace de acceso 📁 Apenas confirmemos el pago te lo paso.";
    expect(revisar(t, [124]).texto).toBe(t);
  });
});
