import { describe, it, expect } from "vitest";
import { comoSeLee, yaLoDijo, sinLoQueYaLeyo } from "../no-repetir";

/**
 * El caso real del 2026-09-02, 07:51-07:54. El cliente pidió MÁS información y
 * recibió la misma ficha de dos minutos antes, seguida del mismo
 * "¿Te paso el precio? 💰" palabra por palabra.
 */
const CIERRE = "¿Te paso el precio? 💰";
const HISTORIAL = [
  { role: "customer", content: "Hola tenes el curso de inteligencia artificial?" },
  { role: "agent", content: "¡Sí, claro que sí! Tenemos el curso disponible. Te cuento rápido de qué se trata." },
  { role: "agent", content: CIERRE },
  { role: "customer", content: "Tienes más información?" },
];

describe("Lo que el cliente ya leyó no se vuelve a mandar", () => {
  it("el cierre repetido se reconoce, aunque cambie el emoji", () => {
    expect(yaLoDijo("¿Te paso el precio? 💰", HISTORIAL)).toBe(false); // corto: no aplica
    // Uno de largo real sí:
    const largo = "Te cuento rápido de qué se trata, es un curso completo desde cero.";
    const hist = [{ role: "agent", content: largo }];
    expect(yaLoDijo(largo + " 🔥", hist)).toBe(true);
  });

  it("una frase corta se puede repetir sin problema", () => {
    // "listo", "dale", "claro que sí" son respuestas normales, no un bot trabado.
    expect(yaLoDijo("Listo 👍", [{ role: "agent", content: "Listo 👍" }])).toBe(false);
  });

  it("da igual la tilde, el emoji y el espacio de más", () => {
    expect(comoSeLee("¡Sí, claro!  😊 ")).toBe("si claro");
    expect(
      yaLoDijo(
        "El acceso te llega por Google Drive apenas confirmes el pago",
        [{ role: "agent", content: "el acceso te llega por google drive apenas confirmes el pago." }],
      ),
    ).toBe(true);
  });

  it("un mensaje contenido dentro de otro también es repetir", () => {
    const hist = [{ role: "agent", content: "Mira, el curso trae 39 módulos en video y acceso de por vida." }];
    expect(yaLoDijo("el curso trae 39 módulos en video y acceso de por vida", hist)).toBe(true);
  });

  it("lo que dijo el CLIENTE no cuenta: el bot puede repetirle sus palabras", () => {
    const hist = [{ role: "customer", content: "quiero el curso de inteligencia artificial completo ya" }];
    expect(yaLoDijo("quiero el curso de inteligencia artificial completo ya", hist)).toBe(false);
  });
});

describe("Se limpian las partes repetidas, pero nunca se manda un vacío", () => {
  const hist = [{ role: "agent", content: "Tiene 39 módulos en video y el acceso te queda de por vida." }];

  it("saca la parte repetida y deja la nueva", () => {
    const partes = [
      { kind: "text", content: "Tiene 39 módulos en video y el acceso te queda de por vida." },
      { kind: "text", content: "Además incluye plantillas y ejercicios que no te había contado." },
    ];
    const r = sinLoQueYaLeyo(partes, hist);
    expect(r.quitadas).toBe(1);
    expect(r.partes.length).toBe(1);
    expect(r.partes[0].content).toMatch(/plantillas/);
  });

  it("si TODO es repetido, se conserva la última: algo hay que contestar", () => {
    const partes = [
      { kind: "text", content: "Tiene 39 módulos en video y el acceso te queda de por vida." },
      { kind: "text", content: "Tiene 39 módulos en video y el acceso te queda de por vida." },
    ];
    const r = sinLoQueYaLeyo(partes, hist);
    expect(r.partes.filter((p) => p.kind === "text").length).toBe(1);
  });

  it("las fichas y demás partes no se tocan acá", () => {
    const partes = [
      { kind: "text", content: "Tiene 39 módulos en video y el acceso te queda de por vida." },
      { kind: "card", productId: 124 },
    ];
    const r = sinLoQueYaLeyo(partes, hist);
    expect(r.partes.some((p) => p.kind === "card")).toBe(true);
  });

  it("sin historial no quita nada", () => {
    const partes = [{ kind: "text", content: "Hola, te cuento todo sobre el curso completo." }];
    expect(sinLoQueYaLeyo(partes, []).quitadas).toBe(0);
    expect(sinLoQueYaLeyo(partes, null).quitadas).toBe(0);
  });
});
