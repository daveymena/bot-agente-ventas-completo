import { describe, it, expect } from "vitest";
import { planDeAnuncio } from "../anuncio-por-modelo";
import { AdStrategist } from "../ad-strategist";
import { CONDICIONES_DE_RESPALDO } from "../modelo-de-negocio";

/**
 * Hasta el 23-09-2026 todo anuncio salía con el mismo texto de curso
 * digital: el del corrector de postura prometía "descargar todo el
 * contenido" y "acceso permanente". Cada modelo se vende distinto, y nada
 * se afirma si no está en el producto.
 */
const CORRECTOR = {
  name: "Corrector de postura en X",
  kind: "physical",
  price: 45000,
  currency: "COP",
  description: "Alinea hombros y espalda para que dejes de encorvarte frente al computador.\n🧵 Neopreno acolchado y transpirable\n📏 Ajustable con velcro",
};
const CURSO = {
  name: "Curso de piano completo",
  kind: "digital",
  price: 60000,
  deliveryLink: "https://drive.google.com/x",
  description: "Aprende a tocar piano desde cero con clases en video paso a paso.\n🎹 19 módulos\n🎼 Partituras incluidas",
};
const ASESORIA = { name: "Asesoría de marketing 1 a 1", kind: "service", price: 150000, description: "Revisamos tu negocio y armamos juntos un plan de ventas para los próximos 90 días." };
const PROHIBIDO = /descarg|contenido digital|acceso (inmediato y )?permanente|si no tomas acci[oó]n|miles de clientes|\+\d+ alumnos/i;

describe("producto físico (dropshipping)", () => {
  const plan = planDeAnuncio(CORRECTOR, CONDICIONES_DE_RESPALDO);
  it("no promete descargas ni accesos: es un paquete que llega", () => {
    expect(plan.modelo).toBe("fisico");
    expect(`${plan.primaryText} ${plan.description}`).not.toMatch(PROHIBIDO);
  });
  it("abre con lo que escribió el dueño y usa las características reales", () => {
    expect(plan.primaryText.startsWith("Alinea hombros y espalda")).toBe(true);
    expect(plan.primaryText).toMatch(/🧵 Neopreno/);
  });
  it("la oferta sale de las condiciones del negocio", () => {
    if (CONDICIONES_DE_RESPALDO.envio.pago === "contraentrega") expect(plan.primaryText).toMatch(/Pagas al recibir/);
    expect(plan.primaryText).toMatch(/\$45\.000 COP/);
  });
  it("recomienda un creativo UGC en video y el objetivo de mensajes", () => {
    expect(plan.creativo.formato).toMatch(/UGC/);
    expect(plan.objetivoRecomendado).toBe("mensajes");
  });
});

describe("producto digital", () => {
  it("no afirma 'de por vida' si el producto no lo dice", () => {
    expect(planDeAnuncio(CURSO).primaryText).not.toMatch(/de por vida/i);
  });
  it("sí lo dice cuando el producto lo trae", () => {
    const conAcceso = { ...CURSO, description: `${CURSO.description}\n♾️ Acceso de por vida` };
    expect(planDeAnuncio(conAcceso).primaryText).toMatch(/Acceso de por vida/);
  });
  it("lista lo que incluye y cómo se entrega", () => {
    const t = planDeAnuncio(CURSO).primaryText;
    expect(t).toMatch(/Lo que incluye:[\s\S]*19 módulos/);
    expect(t).toMatch(/al instante por enlace/);
  });
});

describe("servicio", () => {
  const plan = planDeAnuncio(ASESORIA);
  it("se vende por conversación y agenda, no por 'comprar ahora'", () => {
    expect(plan.modelo).toBe("servicio");
    expect(plan.ctaType).toBe("CONTACT_US");
    expect(plan.primaryText).toMatch(/agendamos/);
  });
  it("pide prueba REAL, nunca testimonios inventados", () => {
    expect(plan.creativo.estructura.join(" ")).toMatch(/nunca inventadas/);
  });
});

describe("el estratega", () => {
  const s = new AdStrategist();
  it("fitness/cocina ya no devuelven una estrategia VACÍA (clave salud_deporte inexistente)", () => {
    const e = s.getStrategyForProduct({ name: "Curso de cocina saludable", kind: "digital" });
    expect(e.niche).toBeTruthy();
    expect(e.budget).toBeGreaterThan(0);
  });
  it("una asesoría no cae en 'Cursos y Educación'", () => {
    expect(s.getStrategyForProduct(ASESORIA).niche).toBe("Servicio");
  });
});
