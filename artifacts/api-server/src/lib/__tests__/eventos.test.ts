/**
 * EL CANAL EN VIVO — bus de eventos, aislamiento y entrega.
 *
 * Lo que se prueba acá no es "llega un mensaje": es que un negocio NUNCA vea
 * los eventos de otro. En una plataforma que entrega los mensajes de clientes
 * reales, una fuga entre negocios es el peor fallo posible — y es silencioso,
 * porque el panel simplemente muestra datos que no le corresponden.
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  emitir,
  suscribir,
  conectar,
  repartir,
  arrancarPuenteEnVivo,
  oyentesActivos,
  conexionesActivas,
  secuenciaActual,
  cerrarTodas,
  rechazarUpgrade,
  _reiniciarParaPruebas,
  type EventoEnVivo,
  type ConexionEnVivo,
} from "../eventos";

/** Una conexión falsa: guarda lo que le llega y permite simular un socket muerto. */
function conexionFalsa(tenantId: number, opciones: { rota?: boolean } = {}) {
  const recibidos: EventoEnVivo[] = [];
  let cerrada = false;
  const c: ConexionEnVivo = {
    tenantId,
    enviar: (texto: string) => {
      if (opciones.rota) throw new Error("socket muerto");
      recibidos.push(JSON.parse(texto));
    },
    cerrar: () => {
      cerrada = true;
    },
  };
  return { c, recibidos, estaCerrada: () => cerrada };
}

beforeEach(() => {
  _reiniciarParaPruebas();
});

describe("el bus publica con dueño y secuencia", () => {
  test("un evento lleva tenantId, fecha y secuencia creciente", () => {
    const a = emitir("mensaje.nuevo", 7, { conversationId: 1, rol: "customer", texto: "hola" });
    const b = emitir("mensaje.nuevo", 7, { conversationId: 1, rol: "agent", texto: "buenas" });
    expect(a?.tenantId).toBe(7);
    expect(a?.at).toBeTruthy();
    expect(b!.seq).toBe(a!.seq + 1);
    expect(secuenciaActual()).toBe(b!.seq);
  });

  test("sin negocio válido NO se emite: un evento sin dueño se vería en todos", () => {
    expect(emitir("mensaje.nuevo", 0, {})).toBeNull();
    expect(emitir("mensaje.nuevo", -3, {})).toBeNull();
    expect(emitir("mensaje.nuevo", NaN as any, {})).toBeNull();
    expect(secuenciaActual()).toBe(0);
  });

  test("un oyente que lanza no rompe a los demás ni al que emite", () => {
    const buenos: EventoEnVivo[] = [];
    suscribir(() => {
      throw new Error("oyente roto");
    });
    suscribir((e) => buenos.push(e));
    const r = emitir("lead.nuevo", 1, { pedidoId: 1 });
    expect(r).not.toBeNull();
    expect(buenos.length).toBe(1);
  });

  test("darse de baja deja de recibir", () => {
    const vistos: EventoEnVivo[] = [];
    const baja = suscribir((e) => vistos.push(e));
    emitir("lead.nuevo", 1, {});
    baja();
    emitir("lead.nuevo", 1, {});
    expect(vistos.length).toBe(1);
    expect(oyentesActivos()).toBe(0);
  });
});

describe("AISLAMIENTO: cada panel ve solo lo de su negocio", () => {
  test("un evento del negocio 7 NO llega a la conexión del 9", () => {
    const a = conexionFalsa(7);
    const b = conexionFalsa(9);
    conectar(a.c);
    conectar(b.c);

    const evento = emitir("mensaje.nuevo", 7, { conversationId: 1, rol: "customer", texto: "secreto" })!;
    repartir(evento);

    expect(a.recibidos.length).toBe(1);
    expect(b.recibidos.length).toBe(0);
  });

  test("el mismo evento llega a TODAS las conexiones de su negocio (dos pestañas)", () => {
    const p1 = conexionFalsa(5);
    const p2 = conexionFalsa(5);
    const otro = conexionFalsa(6);
    conectar(p1.c);
    conectar(p2.c);
    conectar(otro.c);

    repartir(emitir("pago.confirmado", 5, { conversationId: 3 })!);

    expect(p1.recibidos.length).toBe(1);
    expect(p2.recibidos.length).toBe(1);
    expect(otro.recibidos.length).toBe(0);
  });

  test("el puente entrega automáticamente sin llamar a repartir", () => {
    const a = conexionFalsa(11);
    conectar(a.c);
    const desmontar = arrancarPuenteEnVivo();

    emitir("pedido.creado", 11, { pedidoId: 42, estado: "creado" });

    expect(a.recibidos.length).toBe(1);
    expect(a.recibidos[0].tipo).toBe("pedido.creado");
    desmontar();
  });

  test("desmontado el puente, deja de entregar", () => {
    const a = conexionFalsa(11);
    conectar(a.c);
    const desmontar = arrancarPuenteEnVivo();
    desmontar();

    emitir("pedido.creado", 11, { pedidoId: 1, estado: "creado" });
    expect(a.recibidos.length).toBe(0);
  });
});

describe("robustez del transporte", () => {
  test("una conexión muerta se descarta sin afectar a las sanas", () => {
    const muerta = conexionFalsa(4, { rota: true });
    const sana = conexionFalsa(4);
    conectar(muerta.c);
    conectar(sana.c);

    const entregados = repartir(emitir("mensaje.nuevo", 4, { conversationId: 1 })!);

    expect(entregados).toBe(1);
    expect(sana.recibidos.length).toBe(1);
    // La muerta ya no ocupa lugar.
    expect(conexionesActivas()).toBe(1);
  });

  test("cerrarTodas cierra y limpia", () => {
    const a = conexionFalsa(1);
    const b = conexionFalsa(2);
    conectar(a.c);
    conectar(b.c);
    cerrarTodas();
    expect(conexionesActivas()).toBe(0);
    expect(a.estaCerrada()).toBe(true);
    expect(b.estaCerrada()).toBe(true);
  });

  test("rechazarUpgrade responde 401 y destruye el socket", () => {
    let escrito = "";
    let destruido = false;
    rechazarUpgrade(
      {
        write: (s: string) => {
          escrito = s;
        },
        destroy: () => {
          destruido = true;
        },
      },
      "Sesión no válida",
    );
    expect(escrito).toContain("401");
    expect(escrito).toContain("Sesión no válida");
    expect(destruido).toBe(true);
  });

  test("un rechazo con socket ya cerrado no lanza", () => {
    expect(() =>
      rechazarUpgrade(
        {
          write: () => {
            throw new Error("EPIPE");
          },
          destroy: () => {},
        },
        "x",
      ),
    ).not.toThrow();
  });
});

describe("los eventos del vendedor tienen la forma que el panel espera", () => {
  test("agente.escribiendo + agente.respondio: el par que pinta el chat en vivo", () => {
    const panel = conexionFalsa(3);
    conectar(panel.c);
    arrancarPuenteEnVivo();

    emitir("agente.escribiendo", 3, { conversationId: 8, escribiendo: true });
    emitir("agente.respondio", 3, { conversationId: 8, texto: "Acá te dejo el valor 👇" });
    emitir("agente.escribiendo", 3, { conversationId: 8, escribiendo: false });

    expect(panel.recibidos.map((e) => e.tipo)).toEqual([
      "agente.escribiendo",
      "agente.respondio",
      "agente.escribiendo",
    ]);
    expect(panel.recibidos[1].datos.texto).toMatch(/el valor/);
    expect(panel.recibidos[0].datos.escribiendo).toBe(true);
    expect(panel.recibidos[2].datos.escribiendo).toBe(false);
  });

  test("pago confirmado lleva el negocio y la conversación", () => {
    const panel = conexionFalsa(2);
    conectar(panel.c);
    arrancarPuenteEnVivo();

    emitir("pago.confirmado", 2, { conversationId: 15, tenantId: 2, monto: 89900, moneda: "COP" });

    const e = panel.recibidos[0];
    expect(e.tipo).toBe("pago.confirmado");
    expect(e.datos.conversationId).toBe(15);
    expect(e.datos.monto).toBe(89900);
  });
});
