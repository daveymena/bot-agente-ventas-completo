/**
 * Caso real 30-09-2026 (ventasproia.com): la app quedó con UNA sola cuenta,
 * act 1545022093928422 en USD; la cuenta COP de siempre del dueño
 * (1041451215504206) vive en su Business Manager y no aparecía, porque solo se
 * preguntaba `me/adaccounts` y al conectar ganaba "la primera activa" sin
 * mirar la moneda.
 */
import { describe, it, expect } from "vitest";
import {
  listarCuentasAccesibles,
  elegirCuentaAlConectar,
  validarCambioDeCuenta,
  normalizarIdCuenta,
  sugerenciaDeCuentaCop,
  type CuentaPublicitaria,
} from "../meta-cuentas-publicitarias";
import { veredictoDeCuenta } from "../meta-cuenta-autorizada";

const USD = { account_id: "1545022093928422", name: "VentasPro - Cursos Digitales", currency: "USD", account_status: 1 };
const COP = { account_id: "1041451215504206", name: "Duvier Davey Mena Mosquera", currency: "COP", account_status: 1, business: { id: "777", name: "Mi empresa" } };

/** Un Graph de mentira: responde según la ruta pedida. */
function graphFalso(rutas: Record<string, any>) {
  const pedidas: string[] = [];
  const f = async (url: string) => {
    const ruta = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    pedidas.push(ruta);
    const r = rutas[ruta] ?? { error: { message: `ruta no simulada: ${ruta}` } };
    return { json: async () => r };
  };
  return { f, pedidas };
}

describe("listar TODAS las cuentas que ve el token del negocio", () => {
  it("el caso real: la COP del Business Manager aparece aunque me/adaccounts solo traiga la USD", async () => {
    const g = graphFalso({
      "me/adaccounts": { data: [USD] },
      "me/businesses": { data: [{ id: "777", name: "Mi empresa" }] },
      "777/owned_ad_accounts": { data: [COP] },
      "777/client_ad_accounts": { data: [] },
    });
    const r = await listarCuentasAccesibles("tok", g.f as any);
    expect(r.error).toBeNull();
    expect(r.cuentas.map((c) => `${c.id}:${c.moneda}`)).toEqual(["1545022093928422:USD", "1041451215504206:COP"]);
    expect(r.cuentas[1].origen).toBe("empresa_propia");
    expect(g.pedidas).toContain("777/owned_ad_accounts");
    expect(g.pedidas).toContain("777/client_ad_accounts");
  });

  it("sigue la paginación de me/adaccounts (antes limit 25 y chau)", async () => {
    let n = 0;
    const f = async (url: string) => {
      const ruta = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
      if (ruta === "me/adaccounts") {
        n++;
        return { json: async () => (n === 1 ? { data: [USD], paging: { next: "https://graph.facebook.com/v23.0/me/adaccounts?after=x" } } : { data: [COP] }) };
      }
      return { json: async () => ({ data: [] }) };
    };
    const r = await listarCuentasAccesibles("tok", f as any);
    expect(r.cuentas.map((c) => c.id)).toEqual(["1545022093928422", "1041451215504206"]);
  });

  it("sin business_management no se cae: devuelve lo del usuario y AVISA", async () => {
    const g = graphFalso({
      "me/adaccounts": { data: [USD] },
      "me/businesses": { error: { message: "(#100) Missing Permission business_management" } },
    });
    const r = await listarCuentasAccesibles("tok", g.f as any);
    expect(r.error).toBeNull();
    expect(r.cuentas).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/business_management/);
  });

  it("sin token no pregunta nada (nunca cae a credenciales de otro)", async () => {
    const g = graphFalso({});
    const r = await listarCuentasAccesibles("", g.f as any);
    expect(r.error).toMatch(/Sin token/);
    expect(g.pedidas).toHaveLength(0);
  });

  it("'no pude preguntar' no es lo mismo que 'no hay cuentas'", async () => {
    const g = graphFalso({ "me/adaccounts": { error: { message: "token vencido" } }, "me/businesses": { error: { message: "token vencido" } } });
    const r = await listarCuentasAccesibles("tok", g.f as any);
    expect(r.error).toMatch(/token vencido/);
  });
});

const lista: CuentaPublicitaria[] = [
  { id: "1545022093928422", nombre: "USD", moneda: "USD", estado: 1, activa: true, origen: "usuario" },
  { id: "1041451215504206", nombre: "COP", moneda: "COP", estado: 1, activa: true, origen: "empresa_propia" },
];

describe("qué cuenta se guarda al conectar", () => {
  it("con una USD y una COP activas gana la COP (antes: la primera activa = USD)", () => {
    expect(elegirCuentaAlConectar(lista, "")?.id).toBe("1041451215504206");
  });
  it("reconectar respeta la cuenta que ya estaba elegida", () => {
    expect(elegirCuentaAlConectar(lista, "1545022093928422")?.id).toBe("1545022093928422");
  });
  it("una COP deshabilitada no le gana a una activa", () => {
    const l = [{ ...lista[1], activa: false, estado: 2 }, lista[0]];
    expect(elegirCuentaAlConectar(l, "")?.id).toBe("1545022093928422");
  });
});

describe("cambiar la cuenta activa", () => {
  it("acepta la COP del dueño, con o sin act_", () => {
    const r = validarCambioDeCuenta(lista, "act_1041451215504206");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cuenta.moneda).toBe("COP");
      expect(r.aviso).toBeNull();
    }
  });
  it("rechaza una cuenta que el token del negocio no ve (podría ser de otro negocio)", () => {
    const r = validarCambioDeCuenta(lista, "999999999999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no está entre las que ve/);
  });
  it("rechaza basura", () => {
    expect(validarCambioDeCuenta(lista, "hola").ok).toBe(false);
    expect(normalizarIdCuenta(" act_123456 ")).toBe("123456");
  });
  it("avisa si se elige una cuenta que no está en COP", () => {
    const r = validarCambioDeCuenta(lista, "1545022093928422");
    expect(r.ok && r.aviso).toMatch(/USD/);
  });
});

describe("antes de subir: cuenta en USD", () => {
  it("se bloquea antes de Meta y se ofrece la cuenta COP a la que pasarse", () => {
    const v = veredictoDeCuenta({ id: "1545022093928422", moneda: "USD", estado: 1 }, null);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/USD/);
    const s = sugerenciaDeCuentaCop(lista, "1545022093928422");
    expect(s).toContain("1041451215504206");
  });
  it("si no hay ninguna COP visible, dice cómo hacer que aparezca", () => {
    expect(sugerenciaDeCuentaCop([lista[0]], "1545022093928422")).toMatch(/Reconectá Facebook/);
  });
});
