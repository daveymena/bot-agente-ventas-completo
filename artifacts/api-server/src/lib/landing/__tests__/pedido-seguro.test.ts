import { describe, expect, it } from "vitest";
import {
  ANTIFRAUDE_APAGADO, codigoEnMensaje, configAntifraude, configPedido, evaluarAntifraude,
  extraElegido, generarCodigo, sumarExtraMismoProducto, tokenDeVerificacion,
} from "../pedido-seguro";
import { extrasDelFormulario } from "../formulario-extras";
import { respuestaDeVerificado } from "../verificacion-whatsapp";

/**
 * Formulario contraentrega seguro (22-10-2026): verificación por WhatsApp,
 * upsell/downsell y antifraude. Lo que más importa probar es lo que NO debe
 * pasar: frenar a un cliente real, cobrar un extra que no eligió, o tomar un
 * número de casa por un código.
 */

const pedidoBase = { telefono: "3001234567", ip: "190.1.2.3", ciudad: "Medellín", pedidosTelefono24h: 0, pedidosIp24h: 0 };

describe("antifraude", () => {
  it("apagado por defecto: un pedido normal pasa", () => {
    expect(evaluarAntifraude(configAntifraude(undefined), pedidoBase)).toEqual({ ok: true });
    expect(configAntifraude(null)).toEqual(ANTIFRAUDE_APAGADO);
  });

  it("el campo trampa lleno es un robot, aunque todo lo demás esté apagado", () => {
    const v = evaluarAntifraude(ANTIFRAUDE_APAGADO, { ...pedidoBase, trampa: "https://spam.test" });
    expect(v.ok).toBe(false);
  });

  it("el celular bloqueado se reconoce escrito de cualquier forma, y al cliente no se le dice la regla", () => {
    const cfg = configAntifraude({ telefonosBloqueados: "+57 300 123 4567\n311 000 0000" });
    const v = evaluarAntifraude(cfg, { ...pedidoBase, telefono: "573001234567" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.regla).toContain("3001234567");
      expect(v.alCliente).not.toMatch(/bloquead/i);
    }
  });

  it("ciudad sin contraentrega: sin importar tildes ni mayúsculas, y se lo dice al cliente", () => {
    const cfg = configAntifraude({ ciudadesBloqueadas: ["Quibdó"] });
    const v = evaluarAntifraude(cfg, { ...pedidoBase, ciudad: "QUIBDO" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.alCliente).toContain("QUIBDO");
  });

  it("límite por celular: el pedido que llega al tope se frena, el anterior no", () => {
    const cfg = configAntifraude({ maxPedidosPorTelefono24h: 2 });
    expect(evaluarAntifraude(cfg, { ...pedidoBase, pedidosTelefono24h: 1 }).ok).toBe(true);
    expect(evaluarAntifraude(cfg, { ...pedidoBase, pedidosTelefono24h: 2 }).ok).toBe(false);
  });

  it("IP bloqueada aunque llegue como IPv4 mapeada a IPv6", () => {
    const cfg = configAntifraude({ ipsBloqueadas: ["190.1.2.3"] });
    expect(evaluarAntifraude(cfg, { ...pedidoBase, ip: "::ffff:190.1.2.3" }).ok).toBe(false);
  });
});

describe("upsell y downsell", () => {
  const design = { pedido: { upsell: { precio: 30000, cantidad: 1, titulo: "Lleva otra unidad" }, downsell: { precio: 25000 } } };

  it("sin configurar no hay extra, y lo que mande el navegador se ignora", () => {
    const cfg = configPedido({});
    expect(cfg).toEqual({ verificarWhatsapp: false, upsell: null, downsell: null });
    expect(extraElegido(cfg, "upsell")).toBeNull();
  });

  it("el downsell hereda producto y cantidad del upsell", () => {
    const cfg = configPedido(design);
    expect(cfg.downsell).toMatchObject({ precio: 25000, cantidad: 1, productId: null });
  });

  it("un downsell que no es más barato se descarta", () => {
    const cfg = configPedido({ pedido: { upsell: { precio: 30000 }, downsell: { precio: 30000 } } });
    expect(cfg.downsell).toBeNull();
  });

  it("el precio del extra es el del dueño: suma al total del mismo producto", () => {
    const cfg = configPedido(design);
    const r = sumarExtraMismoProducto({ cantidad: 1, total: 59900 }, extraElegido(cfg, "downsell"), 7);
    expect(r).toEqual({ cantidad: 2, total: 84900, sumado: true });
  });

  it("otro producto no se suma: va en su propio pedido", () => {
    const cfg = configPedido({ pedido: { upsell: { productId: 99, precio: 20000 } } });
    expect(sumarExtraMismoProducto({ cantidad: 1, total: 59900 }, cfg.upsell, 7).sumado).toBe(false);
  });
});

describe("código de verificación", () => {
  it("se encuentra en el mensaje que arma el botón, y con variaciones de escritura", () => {
    const c = generarCodigo();
    expect(c).toMatch(/^VP-\d{6}$/);
    expect(codigoEnMensaje(`Hola, quiero confirmar mi pedido #12 de Cojín. Mi código es ${c}`)).toBe(c);
    expect(codigoEnMensaje("mi codigo vp 482193")).toBe("VP-482193");
  });

  it("un número de casa, de guía o de pedido NO es un código", () => {
    expect(codigoEnMensaje("Calle 45 # 482193, barrio centro")).toBeNull();
    expect(codigoEnMensaje("mi guía es 482193")).toBeNull();
    expect(codigoEnMensaje("pedido #482193")).toBeNull();
  });

  it("el token cambia con el pedido y con el código", () => {
    expect(tokenDeVerificacion(1, "VP-111111")).not.toBe(tokenDeVerificacion(2, "VP-111111"));
    expect(tokenDeVerificacion(1, "VP-111111")).not.toBe(tokenDeVerificacion(1, "VP-222222"));
  });

  it("la respuesta al cliente junta el pedido y su complemento, con el total de los dos", () => {
    const t = respuestaDeVerificado([
      { id: 40, nombre: "Duvier Mena", productName: "Cojín Moto Viajero", quantity: 1, total: "59900", metodoPago: "contraentrega" },
      { id: 41, nombre: "Duvier Mena", productName: "Funda", quantity: 1, total: "20000", metodoPago: "contraentrega" },
    ]);
    expect(t).toContain("Duvier.");
    expect(t).toContain("#40");
    expect(t).toContain("Cojín Moto Viajero + Funda");
    expect(t).toContain("$79.900");
    expect(t).toContain("Pagas cuando lo recibes");
  });
});

describe("extras en el formulario", () => {
  const FORM = `<html><body><form method="post" action="/api/landing-publica/x/pedido"><input name="nombre"><button type="submit">Pedir</button></form></body></html>`;

  it("sin formulario de pedido no toca la página", () => {
    const sin = "<html><body><p>hola</p></body></html>";
    expect(extrasDelFormulario(sin, configPedido({}))).toBe(sin);
  });

  it("siempre agrega el campo trampa; el upsell solo si está configurado", () => {
    const sinUp = extrasDelFormulario(FORM, configPedido({}));
    expect(sinUp).toContain("sitio_web");
    expect(sinUp).toContain('"up":null');
    const conUp = extrasDelFormulario(FORM, configPedido({ pedido: { upsell: { precio: 30000, titulo: "Lleva otra" } } }));
    expect(conUp).toContain("Lleva otra");
    expect(conUp).toContain("$30.000");
  });

  it("un título con </script> no rompe la página", () => {
    const html = extrasDelFormulario(FORM, configPedido({ pedido: { upsell: { precio: 1000, titulo: "</script><script>alert(1)</script>" } } }));
    expect(html).not.toContain("</script><script>alert(1)");
  });

  it("se inyecta una sola vez", () => {
    const cfg = configPedido({});
    const una = extrasDelFormulario(FORM, cfg);
    expect(extrasDelFormulario(una, cfg)).toBe(una);
  });
});
