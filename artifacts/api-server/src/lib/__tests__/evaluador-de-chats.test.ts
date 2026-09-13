/**
 * El evaluador tiene que ver, solo, los fallos que el dueño vio a mano en
 * sus dos chats reales del 12-09-2026. Si estos casos no dan hallazgo, el
 * evaluador no sirve para lo que existe.
 */
import { describe, it, expect } from "vitest";
import { evaluarChat, type TurnoEvaluado } from "../evaluador-de-chats";

const CATALOGO = [
  { id: 123, name: "Curso de Piano Completo: De Cero a Nivel Avanzado", price: 60000, kind: "digital" },
  { id: 118, name: "EXCEL", price: 60000, kind: "digital" },
  { id: 87, name: "PACK CONTABILIDAD", price: 60000, kind: "digital" },
  { id: 42, name: "PACK IDIOMAS", price: 60000, kind: "digital" },
  { id: 170, name: "RUEDAS PARA MUEBLES", price: 58000, kind: "physical" },
];

const t = (mensaje: string, texto: string, extra: Partial<TurnoEvaluado> = {}): TurnoEvaluado =>
  ({ mensaje, texto, tarjetas: [], agente: "Atlas", ...extra });

describe("el chat del dueño (12-09, conversación 1) tal como salió", () => {
  const turnos: TurnoEvaluado[] = [
    t("Hola me interesa el curso de piano", "", { tarjetas: [{ productId: 123, seccion: "completa" }] }),
    t("cuanto vale el curso de Excel?", "💰 $60.000 COP", { tarjetas: [{ productId: 123, seccion: "precio" }] }),
    t("si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?", "💰 $60.000 COP", { tarjetas: [{ productId: 123, seccion: "precio" }] }),
    t("si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?", ""),
    t("me interesa el Renovador Negro Perfecto, como me llega?", "Te cuento 👇 Te llega por un enlace de acceso", { nombraOtroProducto: true }),
    t("ya te pagué, mandame el acceso ya", "", { tarjetas: [{ productId: 123, seccion: "pago" }] }),
  ];
  const h = evaluarChat(turnos, CATALOGO);
  const reglas = h.map((x) => `${x.turno}:${x.regla}`);

  it("ve la ficha del piano cuando pidió Excel", () => expect(reglas).toContain("2:tarjeta-equivocada"));
  it("ve la ficha de uno cuando pidió tres", () => expect(reglas).toContain("3:ficha-de-uno-por-varios"));
  it("ve el silencio", () => expect(reglas).toContain("4:silencio"));
  it("ve que cobró a quien ya pagó", () => expect(reglas).toContain("6:cobra-a-quien-ya-pago"));
});

describe("el lead de Instagram (12-09 21:19) tal como salió", () => {
  const turnos: TurnoEvaluado[] = [
    t("¡Hola! Quiero más información", "Veo que te llamó la atención lo de aprender piano…", { productoDelMensajeId: 123 }),
    t("Ohh", "¿es para vos, o lo quieres para alguien más?"),
    t("Para mi", "Hmm, creo que no tengo ese producto en el catálogo 😅. Lo que sí manejo es: RUEDAS PARA MUEBLES…", { agente: "AtlasDrops" }),
    t("Listo", "Para activarte el acceso necesito el comprobante de la transferencia 🙏"),
  ];
  const h = evaluarChat(turnos, CATALOGO);
  const reglas = h.map((x) => `${x.turno}:${x.regla}`);
  it("ve el cambio de agente sin motivo", () => expect(reglas).toContain("3:cambio-de-agente"));
  it("ve que negó el producto en foco", () => expect(reglas).toContain("3:niega-el-foco"));
  it("ve el comprobante pedido a quien no pagó", () => expect(reglas).toContain("4:comprobante-sin-pago"));
});

describe("lo que sale hoy (13-09) queda limpio", () => {
  const turnos: TurnoEvaluado[] = [
    t("Hola me interesa el curso de piano", "", { tarjetas: [{ productId: 123, seccion: "completa" }], productoDelMensajeId: 123 }),
    t("cuanto vale el curso de Excel?", "", { tarjetas: [{ productId: 118, seccion: "precio" }], productoDelMensajeId: 118 }),
    t("si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?", "Piano + Contabilidad + Idiomas = $180.000 COP, cada uno a $60.000."),
    t("me interesa el Renovador Negro Perfecto, como me llega?", "no me aparece en el catálogo, déjame confirmarlo con el equipo", { nombraOtroProducto: true }),
    t("ya te pagué, mandame el acceso ya", "¡Genial! Para activarlo necesito el comprobante de la transferencia."),
  ];
  it("sin hallazgos", () => expect(evaluarChat(turnos, CATALOGO)).toEqual([]));
});

describe("cosas que nunca deben salir", () => {
  it("IDs internos y la pregunta genérica", () => {
    const h = evaluarChat([
      t("cuánto es el total", "es el *Pack Contabilidad* (ID 87)"),
      t("y el renovador?", "¿Qué te gustaría saber puntualmente? 🙌"),
    ], CATALOGO);
    expect(h.map((x) => x.regla)).toEqual(expect.arrayContaining(["id-interno", "respuesta-generica"]));
  });
});
