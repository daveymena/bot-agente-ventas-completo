/**
 * ============================================================
 * MODELO DE NEGOCIO: qué pasa después de que el cliente dice "sí"
 * ============================================================
 *
 * El SaaS nació vendiendo cursos (digital) y después dropshipping (físico),
 * y todo el sistema quedó pensado en esos dos: `kind = physical | digital`.
 * Pero una estética, un consultorio, una asesoría, una membresía o una
 * inmobiliaria no entregan nada por Google Drive ni por transportadora, y
 * el bot les ofrecía las dos cosas (pedido del dueño, 11-09-2026: "citas,
 * asesorías y todos los modelos de negocio... que el SaaS esté apto").
 *
 * La pregunta que define el modelo no es "¿es físico o digital?" sino
 * "¿qué hace el bot cuando el cliente acepta?". Eso es lo que este archivo
 * responde, en un solo lugar, para que el agente, la ficha y el flujo de
 * cierre lean la misma verdad.
 *
 * Y las CONDICIONES (cuánto tarda el envío, si se paga al recibir, en qué
 * país está el negocio) dejan de vivir en código: se leen del perfil del
 * negocio, con lo que había en código solo como respaldo para el dueño.
 */
import { pareceDigital, seDespachaPorTransportadora, type ProductoParaEntrega } from "./entrega-del-producto";

export type ModeloDeNegocio =
  | "fisico"       // se despacha: datos de envío → pedido (WooCommerce/Dropi)
  | "digital"      // se entrega por enlace al confirmar el pago
  | "servicio"     // atención personal: se agenda (cita, asesoría, sesión)
  | "suscripcion"  // acceso recurrente: se activa y se cobra por período
  | "cotizacion"   // sin precio cerrado: se levantan requisitos y se cotiza
  | "captacion";   // el cierre pasa fuera del chat: se califica y se deriva

export const MODELOS: readonly ModeloDeNegocio[] = [
  "fisico", "digital", "servicio", "suscripcion", "cotizacion", "captacion",
];

/** Lo que el dueño o el importador pueden escribir en `products.kind`. */
const KIND_A_MODELO: Record<string, ModeloDeNegocio> = {
  physical: "fisico", fisico: "fisico", "físico": "fisico", dropshipping: "fisico", producto: "fisico",
  digital: "digital", curso: "digital", descargable: "digital",
  service: "servicio", servicio: "servicio", cita: "servicio", asesoria: "servicio", "asesoría": "servicio",
  subscription: "suscripcion", suscripcion: "suscripcion", "suscripción": "suscripcion", membresia: "suscripcion", "membresía": "suscripcion",
  quote: "cotizacion", cotizacion: "cotizacion", "cotización": "cotizacion", presupuesto: "cotizacion",
  lead: "captacion", captacion: "captacion", "captación": "captacion",
};

const N = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Palabras que solo escribe quien vende atención personal. Van sobre nombre y
// categoría (texto corto del dueño), no sobre la descripción: ahí "sesión"
// puede ser "sesiones grabadas" de un curso.
const NOMBRE_DE_SERVICIO = /\b(cita|citas|consulta|consultas|asesoria|asesorias|sesion presencial|sesion 1 a 1|sesion uno a uno|mentoria personalizada|turno|turnos|servicio a domicilio|instalacion|reparacion|mantenimiento a domicilio|limpieza|manicure|pedicure|corte de pelo|masaje|masajes|terapia|clase presencial|clases presenciales|taller presencial|evaluacion|valoracion)\b/;
const NOMBRE_DE_SUSCRIPCION = /\b(suscripcion|membresia|mensualidad|plan mensual|plan anual|por mes|al mes|\/mes|mensual)\b/;
const NOMBRE_DE_COTIZACION = /\b(cotizacion|a medida|personalizado|personalizada|segun proyecto|por proyecto|al por mayor|mayorista)\b/;

export interface ProductoParaModelo extends ProductoParaEntrega {
  price?: unknown;
}

/**
 * El modelo de ESTE producto.
 *
 * Primero lo que dice `kind` cuando es uno de los modelos nuevos (ahí no hay
 * ambigüedad: nadie marca "servicio" por error). Después, para los dos
 * viejos, la evidencia: un producto marcado `digital` por defecto que se
 * llama "Consulta nutricional 1 a 1" es un servicio, no un curso. Y al final
 * la regla de siempre para físico/digital.
 */
export function modeloDelProducto(p: ProductoParaModelo | null | undefined): ModeloDeNegocio {
  if (!p) return "digital";
  const kind = N(p.kind);
  const explicito = KIND_A_MODELO[kind];
  if (explicito && explicito !== "fisico" && explicito !== "digital") return explicito;

  const texto = `${N(p.name)} ${N(p.category)}`;
  // Un servicio con enlace de entrega no existe: el enlace prueba digital.
  const conEnlace = String(p.deliveryLink ?? "").trim().length > 0;
  if (!conEnlace) {
    if (NOMBRE_DE_SUSCRIPCION.test(texto)) return "suscripcion";
    if (NOMBRE_DE_SERVICIO.test(texto)) return "servicio";
    if (NOMBRE_DE_COTIZACION.test(texto) || (Number(p.price) === 0 && NOMBRE_DE_COTIZACION.test(N(p.description)))) return "cotizacion";
  }
  if (seDespachaPorTransportadora(p)) return "fisico";
  if (explicito === "fisico" && !pareceDigital(p)) return "fisico";
  return "digital";
}

/** Los que van por el flujo de envío (datos + pedido en WooCommerce). */
export function seEnvia(p: ProductoParaModelo | null | undefined): boolean {
  return modeloDelProducto(p) === "fisico";
}

/** Los que se entregan con un enlace al confirmar el pago. */
export function seEntregaPorEnlace(p: ProductoParaModelo | null | undefined): boolean {
  return modeloDelProducto(p) === "digital";
}

export const ETIQUETA_DEL_MODELO: Record<ModeloDeNegocio, string> = {
  fisico: "físico",
  digital: "digital",
  servicio: "servicio",
  suscripcion: "suscripción",
  cotizacion: "a cotizar",
  captacion: "captación",
};

// ─── Condiciones del negocio ─────────────────────────────────────────────────

export type PagoDeEnvio = "contraentrega" | "anticipado" | "ambos";

/** Cómo entrega y cobra ESTE negocio. Sale del perfil; lo de código es respaldo. */
export interface CondicionesDelNegocio {
  /** País del negocio (ISO-2 o nombre). Manda sobre la validación de zona. */
  pais: string;
  envio: {
    /** "3 a 5 días hábiles" */
    plazo: string;
    /** Cómo se paga lo que se despacha. */
    pago: PagoDeEnvio;
    /** "incluido" o el texto que diga el dueño ("$12.000 a todo el país"). */
    costo: string;
    /** Cobertura: "todo el país", "solo Bogotá"... */
    cobertura: string;
  };
  /** Cómo se agenda un servicio, si el dueño lo dijo. */
  agenda?: string;
  /** De dónde salió: para que el agente pueda decir "esto lo confirmó el negocio". */
  fuente: "perfil" | "respaldo";
}

/**
 * Lo que valía para el dueño (17-08-2026: "las entregas son entre 3 a 5 días
 * siempre"). Sigue siendo el respaldo cuando el perfil no dice nada, para no
 * cambiarle el comportamiento al negocio que ya vende con esto.
 */
export const CONDICIONES_DE_RESPALDO: CondicionesDelNegocio = {
  pais: "CO",
  envio: { plazo: "3 a 5 días hábiles", pago: "contraentrega", costo: "incluido", cobertura: "todo el país" },
  fuente: "respaldo",
};

export function esColombia(pais: string | null | undefined): boolean {
  const p = N(pais);
  return !p || p === "co" || p === "col" || p === "colombia";
}

/**
 * Código ISO-2 del país del negocio, para Meta y para la moneda. Sin país
 * cargado, Colombia (el negocio original). Pedido del dueño (13-09-2026):
 * un cliente de otro país no puede quedar atado a publicar solo en Colombia.
 */
export function codigoDePais(pais: string | null | undefined): string {
  const p = N(pais);
  if (!p) return "CO";
  const MAPA: Record<string, string> = {
    colombia: "CO", co: "CO", col: "CO", mexico: "MX", mx: "MX", peru: "PE", pe: "PE", chile: "CL", cl: "CL",
    argentina: "AR", ar: "AR", ecuador: "EC", ec: "EC", espana: "ES", es: "ES", "estados unidos": "US", usa: "US", us: "US", eeuu: "US",
    venezuela: "VE", ve: "VE", bolivia: "BO", bo: "BO", uruguay: "UY", uy: "UY", paraguay: "PY", py: "PY", guatemala: "GT", gt: "GT",
    "costa rica": "CR", cr: "CR", panama: "PA", pa: "PA", "republica dominicana": "DO", do: "DO", honduras: "HN", hn: "HN",
    "el salvador": "SV", sv: "SV", nicaragua: "NI", ni: "NI", brasil: "BR", br: "BR", "puerto rico": "PR", pr: "PR", canada: "CA", ca: "CA",
  };
  if (MAPA[p]) return MAPA[p];
  if (/^[a-z]{2}$/.test(p)) return p.toUpperCase();
  return "CO";
}

const PAGO_VALIDO = new Set<PagoDeEnvio>(["contraentrega", "anticipado", "ambos"]);

/**
 * Arma las condiciones a partir del perfil del negocio (`businessProfile`).
 *
 * Tolera lo que un modelo escribe: `envio.pago` como "contra entrega" o
 * "pago al recibir", `costo` como "gratis" o "incluido en el precio".
 */
export function condicionesDesdePerfil(perfil: any): CondicionesDelNegocio {
  const envioRaw = perfil?.envio && typeof perfil.envio === "object" ? perfil.envio : null;
  const pais = String(perfil?.pais ?? "").trim();
  if (!envioRaw && !pais) return CONDICIONES_DE_RESPALDO;

  const pagoTexto = N(envioRaw?.pago);
  const pago: PagoDeEnvio = PAGO_VALIDO.has(pagoTexto as PagoDeEnvio)
    ? (pagoTexto as PagoDeEnvio)
    : /contra|al recibir|recibi/.test(pagoTexto) ? "contraentrega"
    : /anticip|adelant|antes|transfer|previo/.test(pagoTexto) ? "anticipado"
    : CONDICIONES_DE_RESPALDO.envio.pago;
  const costoTexto = String(envioRaw?.costo ?? "").trim();
  const costo = !costoTexto || /gratis|incluid|sin costo/i.test(costoTexto) ? "incluido" : costoTexto;

  return {
    pais: pais || CONDICIONES_DE_RESPALDO.pais,
    envio: {
      plazo: String(envioRaw?.plazo ?? "").trim() || CONDICIONES_DE_RESPALDO.envio.plazo,
      pago,
      costo,
      cobertura: String(envioRaw?.cobertura ?? perfil?.cobertura ?? "").trim() || CONDICIONES_DE_RESPALDO.envio.cobertura,
    },
    agenda: String(perfil?.agenda ?? "").trim() || undefined,
    fuente: "perfil",
  };
}

/** Frase corta de cómo se paga lo que se despacha, para prompts y fichas. */
export function frasePagoEnvio(c: CondicionesDelNegocio): string {
  switch (c.envio.pago) {
    case "contraentrega": return "Pagás contraentrega, cuando lo recibís";
    case "anticipado": return "Se paga antes del despacho";
    case "ambos": return "Podés pagar antes o contraentrega, como prefieras";
  }
}

export function fraseCostoEnvio(c: CondicionesDelNegocio): string {
  return c.envio.costo === "incluido" ? "Envío incluido en el precio" : `Envío: ${c.envio.costo}`;
}

// ─── Qué hace el bot después del "sí", por modelo ────────────────────────────

/**
 * El bloque que se le inyecta al agente cuando el producto en juego NO es ni
 * físico ni digital. Los dos viejos ya tienen su flujo (dropshipping.ts y la
 * entrega por enlace); estos son los que el bot no sabía atender y les
 * ofrecía Google Drive o una transportadora.
 *
 * Sin agenda ni cotizador todavía: el bot toma los datos y se los pasa al
 * negocio (el aviso al admin ya existe). Es lo mínimo honesto: nunca
 * promete una hora que nadie confirmó ni un precio que nadie calculó.
 */
export function bloqueTrasElSi(modelo: ModeloDeNegocio, c: CondicionesDelNegocio): string {
  switch (modelo) {
    case "servicio":
      return [
        "🗓️ ESTO ES UN SERVICIO DE ATENCIÓN PERSONAL, NO UN PRODUCTO QUE SE ENTREGA",
        "• No se manda por Google Drive ni por transportadora: se AGENDA. Nunca hables de \"acceso\", \"descarga\", \"envío\" ni \"entrega\".",
        c.agenda ? `• Cómo se agenda en este negocio: ${c.agenda}` : "• Cuando el cliente quiera tomarlo, pedile nombre, y el día y la franja horaria que prefiere. Decile que el negocio le confirma la hora por este mismo chat.",
        "• NUNCA confirmes una fecha u hora como definitiva: no ves la agenda. Decí \"te confirmo apenas lo revise\".",
        "• Si es a domicilio, pedí también la dirección. Si no lo sabés, no lo asumas.",
      ].join("\n");
    case "suscripcion":
      return [
        "🔁 ESTO ES UNA SUSCRIPCIÓN: acceso por período, no una compra única",
        "• Decí con claridad cada cuánto se cobra y que se renueva; nunca lo presentes como \"pago único\" ni \"de por vida\".",
        "• El primer pago se hace como cualquier otro (enlace o transferencia); la renovación la coordina el negocio. No inventes cómo se cancela: si te preguntan, decí que lo confirmás.",
      ].join("\n");
    case "cotizacion":
      return [
        "🧾 ESTE PRODUCTO SE COTIZA: no tiene un precio cerrado",
        "• NUNCA digas un precio ni un rango. Lo que hacés es levantar lo que hace falta para cotizar: qué necesita exactamente, cantidad, medidas o alcance, plazo y ciudad.",
        "• Cuando tengas eso, decile que el negocio le manda la cotización por este chat. No prometas cuándo.",
      ].join("\n");
    case "captacion":
      return [
        "🤝 ESTE NEGOCIO CIERRA CON UNA PERSONA, NO EN EL CHAT",
        "• Tu trabajo es entender qué necesita, para cuándo y cómo contactarlo, y pasárselo a un asesor. No cobres, no entregues, no agendes.",
        "• Decile que un asesor lo contacta por este mismo número. No prometas plazo ni resultado.",
      ].join("\n");
    default:
      return "";
  }
}

/** Marca corta para el catálogo del prompt. Vacío para digital (es lo normal). */
export function marcaDeModelo(p: ProductoParaModelo): string {
  const m = modeloDelProducto(p);
  return m === "digital" ? "" : ` · ${ETIQUETA_DEL_MODELO[m]}`;
}
