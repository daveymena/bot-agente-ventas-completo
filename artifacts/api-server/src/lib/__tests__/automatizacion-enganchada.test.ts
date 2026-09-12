import { describe, it, expect } from "vitest";
import { TOOLS, READ_ONLY_TOOLS, DESTRUCTIVE_TOOLS } from "../app-operator";
import { TIPO_PUBLICAR, TIPO_PROGRAMAR_SEMANA, registrarOrganico } from "../agente-organico";
import { TIPO_GUARDIA, registrarGuardia } from "../agente-horario";
import { TIPO_DIAGNOSTICO, TIPO_PLAN_SEMANAL, registrarAgencia } from "../agencia-ritmo";
import { tiposRegistrados, _limpiarManejadores } from "../programador";

/**
 * ¿Está ENGANCHADO, o es código muerto?
 *
 * Este proyecto ya cometió exactamente ese error: de los catorce agentes del
 * equipo de marketing, cuatro nunca se conectaron a nada. Existían, compilaban,
 * tenían pruebas de su lógica interna, y no los llamaba nadie. Un agente que
 * nadie puede encender no es una función a medias: es una función que no
 * existe, con el costo agregado de que todos creen que sí.
 *
 * Estas pruebas no miran QUÉ hacen las automatizaciones --de eso se ocupan
 * `programador.test.ts` y `franjas-horarias.test.ts`-- sino que se puedan
 * alcanzar: que Atlas las vea, que el programador sepa quién atiende cada
 * trabajo, y que el permiso pedido sea el correcto.
 */

const nombres = () => TOOLS.map((t) => t.name);

describe("Atlas puede ver las automatizaciones", () => {
  it("las tres herramientas existen", () => {
    for (const n of ["automatizacion_estado", "automatizacion_organica", "automatizacion_franjas"]) {
      expect(nombres(), n).toContain(n);
    }
  });

  it("y el asistente de configuración también está enganchado", () => {
    // El pedido del admin (2026-09-02): que Atlas guíe a un cliente que no
    // sabe de esto. Si la herramienta existe y no está en la lista, el modelo
    // no la ve nunca -- que es el error que este archivo entero vigila.
    expect(nombres()).toContain("configurar_mi_agente");
    // Solo lee: pedir permiso para preguntarle al dueño qué prefiere sería
    // absurdo, y haría que nadie configure nada.
    expect(READ_ONLY_TOOLS.has("configurar_mi_agente")).toBe(true);
  });

  it("cada una explica cuándo usarla", () => {
    // Sin esto el modelo no las llama nunca: una herramienta que no dice para
    // qué sirve es una herramienta invisible.
    for (const n of ["automatizacion_estado", "automatizacion_organica", "automatizacion_franjas"]) {
      const t = TOOLS.find((x) => x.name === n)!;
      expect(t.description.length, n).toBeGreaterThan(80);
      expect(t.description.toLowerCase(), n).toMatch(/úsalo|usá|va siempre|mostrale/);
    }
  });
});

describe("el permiso que pide cada una es el correcto", () => {
  it("consultar el estado NO pide permiso", () => {
    // Es lo que el admin necesita ver ANTES de decidir si enciende algo.
    // Pedirle confirmación para mirar haría que no mire.
    expect(READ_ONLY_TOOLS.has("automatizacion_estado")).toBe(true);
  });

  it("encender la publicación automática SÍ pide confirmación", () => {
    // Publica sola y en público durante semanas. Es el mismo criterio que
    // fb_page_publish, que pide confirmación por ser público e irreversible.
    expect(READ_ONLY_TOOLS.has("automatizacion_organica")).toBe(false);
  });

  it("poner campañas bajo guardia SÍ pide confirmación", () => {
    // Cambia cómo se gasta la plata del admin: apagar y encender pauta.
    expect(READ_ONLY_TOOLS.has("automatizacion_franjas")).toBe(false);
  });

  it("ninguna de las tres borra nada", () => {
    for (const n of ["automatizacion_estado", "automatizacion_organica", "automatizacion_franjas"]) {
      expect(DESTRUCTIVE_TOOLS.has(n), n).toBe(false);
    }
  });
});

describe("el programador sabe quién atiende cada trabajo", () => {
  it("registrar en el arranque cubre los tres tipos", () => {
    // El caso que esto previene: los trabajos ya están agendados en la BASE.
    // Si el registro dependiera de que alguien active el agente, un reinicio
    // del servidor dejaría las publicaciones de la semana --y la guardia
    // nocturna-- sin nadie que las ejecute. El programador las vería vencer
    // una y otra vez sin poder hacer nada.
    _limpiarManejadores();
    registrarOrganico();
    registrarGuardia();

    const tipos = tiposRegistrados();
    expect(tipos).toContain(TIPO_PUBLICAR);
    expect(tipos).toContain(TIPO_PROGRAMAR_SEMANA);
    expect(tipos).toContain(TIPO_GUARDIA);
  });

  it("registrar dos veces no rompe nada", () => {
    // app.ts las llama al arrancar y `activar...` las vuelve a llamar.
    _limpiarManejadores();
    registrarOrganico();
    registrarOrganico();
    registrarGuardia();
    registrarGuardia();
    expect(tiposRegistrados()).toContain(TIPO_PUBLICAR);
  });
});

describe("el equipo de marketing tiene reloj propio", () => {
  // Los catorce especialistas de marketing-team ya existían y funcionaban,
  // pero solo se despertaban si el admin abría el chat y preguntaba:
  // `planGrowth` y `runDiagnosticCycle` se llamaban desde app-operator y desde
  // ningún otro lado. Una agencia que solo trabaja cuando le tocan el hombro
  // no es autónoma.
  it("el programador atiende el diagnóstico y el plan", () => {
    _limpiarManejadores();
    registrarAgencia();
    const t = tiposRegistrados();
    expect(t).toContain(TIPO_DIAGNOSTICO);
    expect(t).toContain(TIPO_PLAN_SEMANAL);
  });
});

describe("Atlas tiene control del agente de WhatsApp", () => {
  it("las cinco herramientas de agente existen", () => {
    for (const n of ["agente_inspectar", "agente_configurar", "agente_perfil_negocio", "agente_conocimiento", "agente_mensaje"]) {
      expect(nombres(), n).toContain(n);
    }
  });

  it("agente_inspectar es solo lectura", () => {
    expect(READ_ONLY_TOOLS.has("agente_inspectar")).toBe(true);
  });

  it("las herramientas de escritura NO son solo lectura", () => {
    for (const n of ["agente_configurar", "agente_perfil_negocio", "agente_conocimiento", "agente_mensaje"]) {
      expect(READ_ONLY_TOOLS.has(n), n).toBe(false);
    }
  });

  it("ninguna de las cinco es destructiva", () => {
    for (const n of ["agente_inspectar", "agente_configurar", "agente_perfil_negocio", "agente_conocimiento", "agente_mensaje"]) {
      expect(DESTRUCTIVE_TOOLS.has(n), n).toBe(false);
    }
  });

  it("cada una explica cuándo usarla", () => {
    for (const n of ["agente_inspectar", "agente_configurar", "agente_perfil_negocio", "agente_conocimiento", "agente_mensaje"]) {
      const t = TOOLS.find((x) => x.name === n)!;
      expect(t.description.length, n).toBeGreaterThan(80);
    }
  });
});

describe("el dueño puede enseñarle al agente sin programar", () => {
  // La tabla de respuestas verificadas vivía en un .ts con tres productos
  // adentro: el cuarto cliente del SaaS necesitaba un programador y un
  // despliegue para que su bot supiera qué incluye su propio curso.
  it("Atlas ve la herramienta para cargar conocimiento por producto", () => {
    expect(nombres()).toContain("agente_saber_producto");
  });

  it("y NO es de solo lectura: cambia lo que el bot le responde a todos", () => {
    expect(READ_ONLY_TOOLS.has("agente_saber_producto")).toBe(false);
  });
});

describe("Atlas puede crear agentes especializados nuevos", () => {
  // `update_agent` solo toca el agente PRINCIPAL. Para separar un negocio en
  // dos líneas (cursos digitales + dropshipping físico), Atlas necesita poder
  // dar de alta agentes NUEVOS. Sin esta herramienta, decía "no puedo dar de
  // alta un agente nuevo desde cero" -- y tenía razón.
  it("la herramienta para crear agentes existe", () => {
    expect(nombres()).toContain("agente_crear");
  });

  it("crear un agente NO es de solo lectura", () => {
    expect(READ_ONLY_TOOLS.has("agente_crear")).toBe(false);
  });

  it("crear un agente NO es destructivo", () => {
    expect(DESTRUCTIVE_TOOLS.has("agente_crear")).toBe(false);
  });

  it("el contrato exige la especialidad, que es lo que separa las líneas", () => {
    const t = TOOLS.find((x) => x.name === "agente_crear")!;
    expect(t.args).toMatch(/especialidad/);
    expect(t.args).toMatch(/dropshipping/);
    expect(t.args).toMatch(/digital/);
    expect(t.description.length).toBeGreaterThan(80);
  });

  it("el router le ofrece la herramienta cuando piden un agente de dropshipping", async () => {
    // El bug real: la herramienta existía solo en el código, pero el recorte
    // por familia no la alcanzaba, así que Atlas decía "no puedo crear un
    // agente nuevo". Acá se comprueba que el pedido "crea un agente de
    // dropshipping" de verdad la deja a la vista.
    const { buildMcpToolRegistry } = await import("../opencode-mcp-tools");
    const reg = buildMcpToolRegistry("crea un agente de dropshipping para producto fisico");
    const propose = reg.find((t: any) => t.name === "propose_action") as any;
    expect(String(propose?.description || "")).toContain("agente_crear");
  });
});

describe("woocommerce_estado existe y es solo lectura (12-09-2026: Atlas dijo 'no hay conexión' sin poder mirar)", () => {
  it("está registrada y en READ_ONLY_TOOLS", () => {
    expect(TOOLS.some((t) => t.name === "woocommerce_estado")).toBe(true);
    expect(READ_ONLY_TOOLS.has("woocommerce_estado")).toBe(true);
  });
});

describe("ficha desde imágenes: ver es lectura, guardar no", () => {
  it("registradas con el permiso correcto", () => {
    expect(TOOLS.some((t) => t.name === "producto_ficha_desde_imagenes_ver")).toBe(true);
    expect(TOOLS.some((t) => t.name === "producto_ficha_desde_imagenes_guardar")).toBe(true);
    expect(READ_ONLY_TOOLS.has("producto_ficha_desde_imagenes_ver")).toBe(true);
    expect(READ_ONLY_TOOLS.has("producto_ficha_desde_imagenes_guardar")).toBe(false);
  });
});

describe("Atlas puede crear, listar y publicar landings", () => {
  it("las tres herramientas existen y solo listar es de lectura", () => {
    for (const n of ["landing_listar", "landing_crear", "landing_publicar"]) expect(TOOLS.some((t) => t.name === n), n).toBe(true);
    expect(READ_ONLY_TOOLS.has("landing_listar")).toBe(true);
    expect(READ_ONLY_TOOLS.has("landing_crear")).toBe(false);
    expect(READ_ONLY_TOOLS.has("landing_publicar")).toBe(false);
  });
});
