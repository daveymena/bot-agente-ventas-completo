/**
 * El blindaje tiene que tapar lo interno y NO tocar una venta legítima.
 *
 * Pedido del dueño (2026-09-24). El riesgo no es que Atlas hable raro: es que
 * suelte claves, rutas o endpoints. Pero el vendedor de WhatsApp pasa por acá
 * en cada mensaje, así que un falso positivo llega a un cliente real.
 */
import { describe, it, expect } from "vitest";
import { blindarSalida, hayFugaDeInformacion } from "../blindaje-de-informacion";

describe("tapa lo que jamás debe salir", () => {
  it("una clave de API", () => {
    const { texto, fugas } = blindarSalida("Tu clave es sk-abcdefghijklmnop123456 y ya quedó.");
    expect(texto).not.toContain("sk-abcdefghijklmnop123456");
    expect(texto).toContain("[dato reservado]");
    expect(fugas.length).toBeGreaterThan(0);
  });

  it("un token JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const { texto } = blindarSalida(`Bearer ${jwt}`);
    expect(texto).not.toContain(jwt);
  });

  it("una variable de entorno", () => {
    const { texto } = blindarSalida("Se configura con OPENAI_API_KEY en el sistema.");
    expect(texto).not.toContain("OPENAI_API_KEY");
    expect(texto).toContain("[dato interno]");
  });

  it("una ruta del código", () => {
    const { texto } = blindarSalida("El arreglo está en artifacts/api-server/src/lib/whatsapp.ts");
    expect(texto).not.toContain("whatsapp.ts");
    expect(texto).toContain("[ruta interna]");
  });

  it("un bloque de código", () => {
    const { texto } = blindarSalida("Mirá:\n```\nconst secreto = process.env.JWT_SECRET;\n```\nlisto");
    expect(texto).not.toContain("process.env");
    expect(texto).toContain("[código omitido por seguridad]");
  });

  it("un endpoint interno", () => {
    const { texto } = blindarSalida("Pegale a POST /api/internal/mcp/atlas para registrarte.");
    expect(texto).not.toContain("/api/internal/mcp/atlas");
    expect(texto).toContain("[endpoint interno]");
  });

  it("un host de infraestructura", () => {
    const { texto } = blindarSalida("Corre en https://opencode1-opencode-clean.2xs2bu.easypanel.host");
    expect(texto).not.toContain("easypanel.host");
    expect(texto).toContain("[infraestructura]");
  });

  it("una marca interna del motor", () => {
    const { texto } = blindarSalida("Cierro con [[herramientas: fb_status, list_products]] y sigo.");
    expect(texto).not.toContain("[[herramientas");
    expect(texto).not.toContain("fb_status");
    expect(hayFugaDeInformacion("[[partes: a; b]]")).toBe(true);
  });

  it("hablar del código fuente", () => {
    const { texto } = blindarSalida("Te paso el código fuente del módulo cuando quieras.");
    expect(texto).not.toContain("código fuente");
    expect(texto).toContain("[dato interno]");
  });
});

describe("no rompe una conversación normal (ni una venta)", () => {
  const ventas = [
    "El curso de piano cuesta $60.000 y lo recibís por WhatsApp. Aprovechá el código DESCUENTO10.",
    "Te comparto el programa del curso: son 12 módulos con acceso de por vida.",
    "Manejamos pago contra entrega en toda Colombia, llega en 3 a 5 días hábiles.",
    "El producto es un iPhone 15 y su número de serie es ABC123.",
    "Gracias por escribirnos, en un momento te ayudo con tu pedido.",
  ];

  for (const t of ventas) {
    it(`intacto: "${t.slice(0, 40)}…"`, () => {
      const { texto, fugas } = blindarSalida(t);
      expect(texto).toBe(t);
      expect(fugas).toEqual([]);
    });
  }

  it("no confunde 'código de descuento' con 'código fuente'", () => {
    const t = "Usá el código de descuento BIENVENIDA y te queda más barato.";
    expect(blindarSalida(t).texto).toBe(t);
  });
});

describe("no se cuelga con vacío", () => {
  it("vacío y no-string", () => {
    expect(blindarSalida("").texto).toBe("");
    expect(blindarSalida(undefined as any).texto).toBe("");
    expect(hayFugaDeInformacion("")).toBe(false);
  });
});
