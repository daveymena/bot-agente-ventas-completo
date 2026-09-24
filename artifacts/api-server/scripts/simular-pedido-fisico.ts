/**
 * El cierre de una venta física con la IA REAL: ¿toma los datos con
 * tomar_pedido, espera el "sí" al resumen y recién ahí confirma?
 *
 * Usa el catálogo, el guion y la voz de la base LOCAL y el modelo real. Lo
 * único simulado es el servicio de pedidos (en memoria): localmente no hay
 * Postgres ni Dropi, y un pedido de prueba no se manda a un proveedor real.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/simular-pedido-fisico.ts [producto]
 */
import { ensureDbReady } from "@workspace/db";
await ensureDbReady();
const { cargarCatalogoDelNegocio, cargarGuion, cargarVozDelNegocio, cargarConocimiento } = await import("../src/lib/motor-nuevo/adaptador");
const { crearClienteLLM, armarCadena } = await import("../src/lib/motor-nuevo/cliente-llm");
const { responder } = await import("../src/lib/motor-nuevo/motor");
const { estadoInicial } = await import("../src/lib/motor-nuevo/estado-conversacion");
type Servicio = import("../src/lib/motor-nuevo/herramientas").ServicioDePedidos;

const TENANT = 1;
const BUSCAR = (process.argv[2] || "corrector").toLowerCase();

const catalogo = await cargarCatalogoDelNegocio(TENANT);
const producto = catalogo.find((p) => p.name.toLowerCase().includes(BUSCAR));
if (!producto) { console.log(`No está "${BUSCAR}" en la base local`); process.exit(1); }
const voz = await cargarVozDelNegocio(TENANT);
const conocimiento = await cargarConocimiento(TENANT);
const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId: TENANT }), tenantId: TENANT });

// El servicio de pedidos, en memoria, con las mismas reglas que dropshipping.ts.
const datos: Record<string, string> = {};
let porConfirmar = false;
const pedidos: Servicio = {
  async tomar({ datos: nuevos }) {
    Object.assign(datos, nuevos);
    console.log(`   🗂  tomar_pedido(${JSON.stringify(nuevos)})`);
    const req = ["nombre", "documento", "telefono", "direccion", "ciudad", "departamento"];
    if (!datos.departamento && /bogot/i.test(datos.ciudad || "")) datos.departamento = "Bogotá D.C.";
    const faltan = req.filter((k) => !datos[k]);
    if (faltan.length) return { estado: "faltan", faltan, yaTiene: req.filter((k) => datos[k]) };
    porConfirmar = true;
    return {
      estado: "listo",
      resumen: [`📦 ${producto.name} × 1`, `💰 Total: $${Number(producto.price).toLocaleString("es-CO")} COP (envío incluido)`, "💵 Pago: contraentrega, al recibir",
        `👤 ${datos.nombre}`, `🪪 Cédula ${datos.documento}`, `📱 ${datos.telefono}`, `🏠 ${datos.direccion}`, `🏙️ ${datos.ciudad}, ${datos.departamento}`, "🚚 Entrega: 3 a 5 días hábiles"].join("\n"),
    };
  },
  async confirmar() {
    console.log(`   ✅ confirmar_pedido() ${porConfirmar ? "— había resumen" : "— SIN resumen (mal)"}`);
    return porConfirmar ? { estado: "creado", numero: "SIM-001", confirmacion: `Producto ${producto.name}, contraentrega, llega en 3 a 5 días.` } : { estado: "sin_pedido" };
  },
};

const GUION = [
  `hola, me interesa el ${BUSCAR}`,
  "cuánto vale?",
  "lo quiero, cómo hago?",
  "Ana Pérez, calle 45 # 12-30 apto 301, Bogotá",
  "cédula 1020304050 y cel 3001234567",
  "sí, todo bien, confirmo",
];

let estado = estadoInicial(999999);
const historial: { role: "customer" | "agent"; content: string; createdAt: Date }[] = [];
for (const texto of GUION) {
  historial.push({ role: "customer", content: texto, createdAt: new Date() });
  console.log(`\n${"─".repeat(70)}\n👤 ${texto}`);
  const guion = await cargarGuion(TENANT, catalogo, estado.productoEnFoco);
  const r = await responder({ llm, estado, historial, catalogo, conocimiento, guion, voz, pedidos });
  estado = r.estado;
  for (const p of r.partes as any[]) {
    if (p.kind === "text") console.log(`🤖 ${String(p.content).trim()}`);
    else console.log(`🧩 [${p.kind}:${p.seccion} #${p.productId}]`);
  }
  console.log(`   · herramientas: ${r.traza.map((t) => t.herramienta).join(", ") || "ninguna"} · compra=${estado.compra}`);
  historial.push({ role: "agent", content: (r.partes as any[]).filter((p) => p.kind === "text").map((p) => p.content).join("\n"), createdAt: new Date() });
}
process.exit(0);
