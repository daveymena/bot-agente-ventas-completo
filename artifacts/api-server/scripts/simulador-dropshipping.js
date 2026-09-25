/**
 * Simulador de ventas de dropshipping contra PRODUCCIÓN, sin clientes reales.
 *
 * Se pega en la consola de una pestaña logueada en ventasproia.com (o se corre
 * con javascript_tool). Usa /api/whatsapp/test-ia con teléfonos "sim-…": el
 * motor v2 recorre el pedido completo pero NO lo manda a Dropi ni a Woo (ver
 * esConversacionDeSimulacion en motor-nuevo/adaptador.ts).
 *
 * ⚠️ Requiere el deploy con el modo simulación (commit ff46409 o posterior).
 * Sin él, "sí, confirmo" crea un pedido REAL.
 *
 * Reglas del dueño que se verifican en cada respuesta (25-09-2026):
 *   - interesarse no es comprar: datos de envío solo tras un sí;
 *   - la cédula no se pide; el flete no se muestra;
 *   - se tutea (Colombia), sin notas internas del modelo.
 */
(() => {
  const PRODUCTO = { titulo: "Corrector de Hombros y Clavícula", precio: 45000 };
  const ANUNCIO = { titulo: PRODUCTO.titulo, cuerpo: "Endereza tu espalda", url: "", anuncioId: "" };
  const DATOS = "Juan Pérez, 3001234567, Calle 10 # 20-30 barrio San Fernando, Cali, Valle del Cauca";

  const ESCENARIOS = [
    { id: "DS-anuncio-compra", anuncio: true, turnos: ["¡Hola! Quiero más información", "¿llega a Medellín?", "sí, lo quiero", DATOS, "sí, confirmo", "¿dónde va mi pedido?"], esperaPedido: true },
    { id: "DS-rapido", anuncio: true, turnos: ["Hola", "Precio?", "Quiero uno", DATOS, "Listo, confirmo"], esperaPedido: true },
    { id: "DS-investigador", anuncio: true, turnos: ["Hola", "Qué material es?", "Tienen negro?", "Cuánto demora?", "Hacen contraentrega?", "Tienen garantía?", "Bueno, déjame pensarlo."] },
    { id: "DS-desconfiado", anuncio: true, turnos: ["Es real?", "Dónde están?", "Cómo sé que me llega?", "Puedo pagar al recibir?", "Qué garantía tengo?"] },
    { id: "DS-precio", anuncio: true, turnos: ["Cuánto?", "Muy caro", "Descuento?", "En otra tienda está más barato"] },
    { id: "DS-impulsivo", anuncio: true, turnos: ["QUIERO UNO", "Dónde pago?", DATOS, "sí"], esperaPedido: true },
    { id: "DS-interesado-no-compra", anuncio: true, turnos: ["Me interesa este", "cuánto vale?", "lo voy a pensar"] },
    { id: "DS-sin-anuncio-extractor", anuncio: false, turnos: ["me interesa el extractor de leche", "el primero", "¿es contraentrega?", "envíamelo", "Juan Pérez 3001234567", "Calle 10 # 20-30, San Fernando, Cali, Valle del Cauca", "sí confirmo"], esperaPedido: true },
  ];

  const PIDE_DATOS = /(c[eé]dula|nombre completo|direcci[oó]n|barrio|celular)/i;
  const SI_COMPRA = /\b(lo quiero|quiero uno|quiero comprar|env[ií]amelo|s[ií],? lo quiero|^s[ií]\b|confirmo)\b/i;

  function revisar(esc, i, parts, yaDijoSi) {
    const texto = (parts || []).filter((p) => p.text).map((p) => p.text).join("\n");
    const fallas = [];
    if (/\b(ten[eé]s|dec[ií]me|pasame|pas[aá]me|ac[aá] ten[eé]s|quer[eé]s|pod[eé]s|mand[aá]me)\b/i.test(texto)) fallas.push("voseo");
    if (/\((el|la) (mensaje|cliente)|herramienta|sistema:|nota:/i.test(texto)) fallas.push("nota interna");
    if (/c[eé]dula/i.test(texto)) fallas.push("pide cédula");
    if (/flete|env[ií]o[^.]{0,20}\$\s?\d/i.test(texto)) fallas.push("muestra flete");
    if (PIDE_DATOS.test(texto) && /\?|necesito|env[ií]ame|me das/i.test(texto) && !yaDijoSi) fallas.push("pide datos sin sí");
    const montos = (texto.match(/\$\s?[\d.]{4,}/g) || []).map((m) => Number(m.replace(/[^\d]/g, "")));
    if (montos.some((m) => m > 0 && m !== PRODUCTO.precio && m % 1000 === 0 && Math.abs(m - PRODUCTO.precio) > 20000)) fallas.push(`monto dudoso ${montos.join(",")}`);
    if (!texto.trim() && !(parts || []).some((p) => p.card)) fallas.push("respuesta vacía");
    return { texto, fallas };
  }

  async function correr(esc) {
    const phone = `sim-${esc.id}-${Date.now().toString(36)}`;
    const salida = [];
    let yaDijoSi = false;
    for (let i = 0; i < esc.turnos.length; i++) {
      const m = esc.turnos[i];
      if (SI_COMPRA.test(m)) yaDijoSi = true;
      const body = { message: m, phone, ...(esc.anuncio && i === 0 ? { anuncio: ANUNCIO } : {}) };
      const r = await fetch("/api/whatsapp/test-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((x) => x.json()).catch((e) => ({ error: String(e) }));
      const rev = revisar(esc, i, r.parts, yaDijoSi);
      salida.push({ cliente: m, bot: rev.texto, fichas: (r.parts || []).filter((p) => p.card).map((p) => `${p.card}:${p.seccion}`), fallas: rev.fallas, proveedor: r.proveedor, error: r.error });
    }
    const huboPedido = salida.some((t) => /SIM-\d+|pedido (qued[oó]|registrad|confirmad)/i.test(t.bot));
    if (esc.esperaPedido && !huboPedido) salida.push({ cliente: "(fin)", bot: "", fichas: [], fallas: ["no llegó a pedido"] });
    if (!esc.esperaPedido && huboPedido) salida.push({ cliente: "(fin)", bot: "", fichas: [], fallas: ["creó pedido sin compra"] });
    return { id: esc.id, turnos: salida, fallas: salida.flatMap((t) => t.fallas) };
  }

  window.__sim = { estado: "corriendo", resultados: [] };
  (async () => {
    for (const esc of ESCENARIOS) window.__sim.resultados.push(await correr(esc));
    window.__sim.estado = "listo";
  })();
  return "simulador lanzado: leer window.__sim";
})();
