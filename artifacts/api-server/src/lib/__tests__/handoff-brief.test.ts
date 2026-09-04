import { describe, it, expect } from "vitest";
import { resumenParaHumano, type DatosDelBrief } from "../handoff-brief";

const base: DatosDelBrief = {
  etapa: "presentation",
  estadoDePago: null,
  clienteEscribioUltimo: false,
  horasSinEscribir: 1,
  productosVistos: 1,
  objecionAbierta: null,
  seguimientoSinRespuesta: false,
  nombre: "Valentina Ruiz",
  telefono: "573001234567",
  productoEnFoco: "Curso de Piano Completo",
  ultimoMensajeDelCliente: "¿el curso tiene certificado?",
};

describe("el resumen que recibe el vendedor humano", () => {
  it("abre con la urgencia y el nombre del cliente", () => {
    const r = resumenParaHumano({ ...base, clienteEscribioUltimo: true });
    expect(r.startsWith("🔥 ATENDER YA — Valentina Ruiz")).toBe(true);
  });

  it("si el cliente puede esperar, lo dice en la primera línea", () => {
    const r = resumenParaHumano({ ...base, horasSinEscribir: 72, productosVistos: 0, objecionAbierta: null });
    expect(r.split("\n")[0]).toContain("📋 Puede esperar");
  });

  it("lleva teléfono y producto en foco", () => {
    const r = resumenParaHumano(base);
    expect(r).toContain("📱 573001234567");
    expect(r).toContain("🛒 Le interesa: Curso de Piano Completo");
  });

  it("dice que no vio producto si todavía no se le mostró ninguno", () => {
    const r = resumenParaHumano({ ...base, productosVistos: 0, productoEnFoco: null });
    expect(r).toContain("Todavía no vio ningún producto");
  });

  it("recuerda la ciudad para no volver a preguntarla", () => {
    const r = resumenParaHumano({ ...base, ciudad: "Bogotá" });
    expect(r).toContain("🏙️ Está en Bogotá — no se lo vuelvas a preguntar");
  });

  it("deja ver la objeción abierta si hay una", () => {
    const r = resumenParaHumano({ ...base, objecionAbierta: "price" });
    expect(r).toContain("🧱 Objeción sin resolver: price");
  });

  it("si ya pagó, eso va arriba de todo", () => {
    const r = resumenParaHumano({ ...base, estadoDePago: "confirmed" });
    expect(r).toContain("✅ YA PAGÓ");
  });

  it("recorta el último mensaje del cliente, no lo transcribe entero", () => {
    const largo = "a".repeat(500);
    const r = resumenParaHumano({ ...base, ultimoMensajeDelCliente: largo });
    const match = r.match(/💬 Lo último que dijo: "(.+)"/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(160);
  });

  it("si el cliente escribió último, lo cuenta como que sigue esperando", () => {
    const r = resumenParaHumano({ ...base, clienteEscribioUltimo: true, horasSinEscribir: 2 });
    expect(r).toContain("Escribió él último");
  });

  it("termina con la próxima acción, que es lo que tiene que hacer el que toma el chat", () => {
    const r = resumenParaHumano(base);
    expect(r.endsWith("👉 Qué hacer: Falta saber qué quiere lograr para poder argumentar.")).toBe(true);
  });

  it("ningún dato razonable produce un resumen vacío", () => {
    const variaciones: DatosDelBrief[] = [
      { ...base, nombre: null, telefono: null },
      { ...base, estadoDePago: "pending", objecionAbierta: "shipping" },
      { ...base, productosVistos: 0, ultimoMensajeDelCliente: null },
      { ...base, etapa: "closing", horasSinEscribir: 0 },
      { ...base, seguimientoSinRespuesta: true, horasSinEscribir: 72 },
    ];
    for (const v of variaciones) {
      const r = resumenParaHumano(v);
      expect(r.trim().length).toBeGreaterThan(10);
      expect(r).toContain("👉 Qué hacer:");
    }
  });
});
