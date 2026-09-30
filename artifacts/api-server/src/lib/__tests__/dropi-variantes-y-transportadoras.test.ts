/**
 * VARIANTES (color/talla) Y TRANSPORTADORAS DE DROPI
 *
 * La variante que elige el cliente tiene que viajar a Dropi como `variation_id`
 * (no como texto suelto en las notas), y la transportadora como
 * `distributionCompany: { id, name }`. Si el texto no identifica UNA variación,
 * se manda sin id: adivinar es despachar la prenda equivocada.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  variantesDeDropi,
  opcionesDesdeVariantes,
  varianteElegida,
  crearPedidoDropi,
  transportadorasQueLlegan,
} from "../dropi-directo";

afterEach(() => { vi.unstubAllGlobals(); });

// Sin `integration_url`: un solo intento por llamada (variante "plana").
const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.f`;
const TOKEN = jwt({ user_id: 1 });

const okJson = (json: any, status = 200) =>
  async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) });

const PEDIDO = {
  nombre: "Ana Ruiz", telefono: "3001234567", direccion: "Calle 10 # 20-30",
  ciudad: "Cali", departamento: "Valle", cantidad: 1, precioUnitario: 45000,
  contraentrega: true, referencia: "vp-1",
};

describe("variantesDeDropi", () => {
  it("lee attribute_values con nombre de atributo y stock", () => {
    const vs = variantesDeDropi({
      variations: [
        { id: 11, stock: 5, attribute_values: [{ value: "NEGRO", attribute: { name: "Color" } }] },
        { id: 12, stock: 3, attribute_values: [{ value: "BLANCO", attribute: { name: "Color" } }] },
      ],
    });
    expect(vs).toHaveLength(2);
    expect(vs[0]).toMatchObject({ id: 11, stock: 5, valores: ["NEGRO"] });
    expect(vs[0].atributos).toEqual([{ nombre: "Color", valor: "NEGRO" }]);
  });

  it("una variación con talla y color da dos atributos", () => {
    const vs = variantesDeDropi({
      variations: [
        { id: 21, stock: 2, attribute_values: [{ value: "M", attribute: { name: "Talla" } }, { value: "NEGRO", attribute: { name: "Color" } }] },
        { id: 22, stock: 1, attribute_values: [{ value: "L", attribute: { name: "Talla" } }, { value: "NEGRO", attribute: { name: "Color" } }] },
      ],
    });
    expect(vs[0].atributos).toEqual([
      { nombre: "Talla", valor: "M" },
      { nombre: "Color", valor: "NEGRO" },
    ]);
    expect(opcionesDesdeVariantes(vs)).toEqual([
      { nombre: "Talla", valores: ["M", "L"], obligatoria: true },
      { nombre: "Color", valores: ["NEGRO"], obligatoria: true },
    ]);
  });

  it("parte el nombre cuando la variación viene en un solo string", () => {
    const vs = variantesDeDropi({ variations: [{ id: 31, stock: 4, name: "M / NEGRO" }] });
    expect(vs[0].valores).toEqual(["M", "NEGRO"]);
  });

  it("sin variaciones no inventa opciones", () => {
    expect(variantesDeDropi({})).toEqual([]);
    expect(variantesDeDropi({ variations: [] })).toEqual([]);
    expect(opcionesDesdeVariantes([])).toEqual([]);
  });

  it("volver a leer lo ya guardado en metadata no cambia nada", () => {
    const vs = variantesDeDropi({
      variations: [{ id: 11, stock: 5, attribute_values: [{ value: "NEGRO", attribute: { name: "Color" } }] }],
    });
    const guardado = vs.map((v) => ({ id: v.id, stock: v.stock, valores: v.valores, atributos: v.atributos }));
    expect(variantesDeDropi(guardado)).toEqual(vs);
  });
});

describe("varianteElegida", () => {
  const vs = variantesDeDropi({
    variations: [
      { id: 11, stock: 5, attribute_values: [{ value: "M", attribute: { name: "Talla" } }, { value: "NEGRO", attribute: { name: "Color" } }] },
      { id: 12, stock: 3, attribute_values: [{ value: "M", attribute: { name: "Talla" } }, { value: "BLANCO", attribute: { name: "Color" } }] },
    ],
  });

  it("el valor exacto y único resuelve", () => {
    expect(varianteElegida(vs, "NEGRO")?.id).toBe(11);
    expect(varianteElegida(vs, "blanco")?.id).toBe(12);
  });

  it("la talla repetida en dos colores es ambigua: no se adivina", () => {
    expect(varianteElegida(vs, "M")).toBeNull();
  });

  it("'quiero el negro talla M' resuelve por contención", () => {
    expect(varianteElegida(vs, "quiero el negro talla M")?.id).toBe(11);
  });

  it("lo que no existe y el vacío devuelven null", () => {
    expect(varianteElegida(vs, "XXL")).toBeNull();
    expect(varianteElegida(vs, "")).toBeNull();
    expect(varianteElegida(vs, null)).toBeNull();
  });
});

describe("transportadorasQueLlegan", () => {
  const GENERAL = { objects: [{ id: 1, name: "SERVIENTREGA" }, { id: 2, name: "ENVIA" }] };

  it("cruza la lista con la cobertura y ordena por precio", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(okJson(GENERAL))
      .mockImplementationOnce(okJson({ objects: [{ company_id: 2, price: 15000 }, { company_id: 1, price: 12000, company_name: "SERVIENTREGA" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await transportadorasQueLlegan(TOKEN, { ciudad: "Cali", departamento: "Valle" });
    expect(r.ok).toBe(true);
    expect(r.data?.fuente).toBe("cobertura");
    expect(r.data?.transportadoras.map((t) => t.nombre)).toEqual(["SERVIENTREGA", "ENVIA"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bycity = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(bycity.city).toBe("CALI");
  });

  it("si la cobertura falla, devuelve la lista general sin inventar filtro", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(okJson(GENERAL))
      .mockImplementationOnce(okJson({ message: "caído" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const r = await transportadorasQueLlegan(TOKEN, { ciudad: "Cali" });
    expect(r.ok).toBe(true);
    expect(r.data?.fuente).toBe("general");
    expect(r.data?.transportadoras).toHaveLength(2);
  });
});

describe("crearPedidoDropi con variante y transportadora", () => {
  const PRODUCTO = { dropiProductId: 99, nombre: "Faja", supplierId: 7, stock: 100, variationId: 11 };

  it("manda variation_id y distributionCompany", async () => {
    const cuerpos: any[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_u: any, o: any) => {
      cuerpos.push(JSON.parse(o.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ objects: { id: 555 } }) };
    }));
    const r = await crearPedidoDropi(TOKEN, PRODUCTO, {
      ...PEDIDO,
      notas: "Talla/variante: M",
      transportadora: { id: 1, nombre: "SERVIENTREGA" },
    });
    expect(r.ok).toBe(true);
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0].products[0].variation_id).toBe(11);
    expect(cuerpos[0].distributionCompany).toEqual({ id: 1, name: "SERVIENTREGA" });
    expect(cuerpos[0].notes).toMatch(/TALLA: M/);
  });

  it("si Dropi rechaza la transportadora, reintenta UNA vez sin ella", async () => {
    const cuerpos: any[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_u: any, o: any) => {
      const b = JSON.parse(o.body);
      cuerpos.push(b);
      if (b.distributionCompany) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ isSuccess: false, message: "sin cobertura para esa transportadora" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ objects: { id: 556 } }) };
    }));
    const r = await crearPedidoDropi(TOKEN, PRODUCTO, { ...PEDIDO, transportadora: { id: 2, nombre: "ENVIA" } });
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe(556);
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[0].distributionCompany).toEqual({ id: 2, name: "ENVIA" });
    expect(cuerpos[1].distributionCompany).toBeUndefined();
  });

  it("sin id de transportadora no se manda distributionCompany", async () => {
    const cuerpos: any[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_u: any, o: any) => {
      cuerpos.push(JSON.parse(o.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ objects: { id: 557 } }) };
    }));
    const r = await crearPedidoDropi(TOKEN, PRODUCTO, { ...PEDIDO, transportadora: { id: null, nombre: "ENVIA" } });
    expect(r.ok).toBe(true);
    expect(cuerpos[0].distributionCompany).toBeUndefined();
  });
});
