/**
 * ============================================================
 * TODAS LAS CUENTAS PUBLICITARIAS QUE VE LA CONEXIÓN DEL NEGOCIO
 * ============================================================
 *
 * Caso real (30-09-2026, ventasproia.com): el dueño conectó Facebook y la app
 * quedó con UNA sola cuenta, act 1545022093928422, en USD. El candado de
 * cuenta autorizada (meta-cuenta-autorizada.ts) bloqueó bien la subida -- la
 * app razona en COP -- pero el dueño no tenía cómo pasar a su cuenta COP de
 * siempre (1041451215504206):
 *
 *  1. Solo se preguntaba `/me/adaccounts` (limit 25, sin paginar). Esa lista
 *     trae las cuentas donde el USUARIO tiene rol propio; las del Business
 *     Manager (`/{business}/owned_ad_accounts` y `client_ad_accounts`) no se
 *     pedían nunca.
 *  2. Al conectar se guardaba la primera ACTIVA, sin mirar la moneda: con una
 *     USD y una COP activas, ganaba la que Meta pusiera primero.
 *  3. El panel no tenía desplegable: solo un campo de texto en "Credenciales
 *     (manual / avanzado)", y guardarlo no tocaba la cuenta autorizada -- el
 *     candado seguía clavado a la anterior.
 *  4. Atlas no tenía herramienta para listar ni cambiar la cuenta.
 *
 * Este módulo lista TODO lo que el token del negocio alcanza (usuario + sus
 * empresas), elige con criterio al conectar (COP activa primero) y valida un
 * cambio de cuenta contra esa lista. Nunca usa credenciales del .env: el
 * token lo pone quien llama, y sale del negocio (FacebookService ya aplica la
 * regla de respaldo-del-dueno.ts).
 */

import { FB_GRAPH_BASE } from "./meta-api-version";

export interface CuentaPublicitaria {
  /** account_id numérico, sin `act_`. */
  id: string;
  nombre: string;
  moneda: string;
  /** account_status de Meta (1 = activa). */
  estado: number | null;
  activa: boolean;
  empresa?: { id: string; nombre: string } | null;
  /** De dónde salió: rol propio del usuario, o por una empresa (Business Manager). */
  origen: "usuario" | "empresa_propia" | "empresa_cliente";
}

export interface ListadoDeCuentas {
  cuentas: CuentaPublicitaria[];
  /** Lo que no se pudo preguntar (p. ej. falta business_management). No es fatal. */
  avisos: string[];
  /** Solo si NO se pudo leer nada: distinto de "no hay cuentas". */
  error: string | null;
}

type Fetch = (url: string, init?: any) => Promise<{ json(): Promise<any> }>;

const CAMPOS = "account_id,name,currency,account_status,business{id,name}";
const MAX_PAGINAS = 5;

/** "act_123" / " 123 " → "123". Vacío si no es un id numérico. */
export function normalizarIdCuenta(id: unknown): string {
  const s = String(id ?? "").trim().replace(/^act_/i, "");
  return /^\d{5,}$/.test(s) ? s : "";
}

function aCuenta(c: any, origen: CuentaPublicitaria["origen"]): CuentaPublicitaria | null {
  const id = normalizarIdCuenta(c?.account_id ?? c?.id);
  if (!id) return null;
  const estado = c?.account_status != null ? Number(c.account_status) : null;
  return {
    id,
    nombre: String(c?.name || `Cuenta ${id}`),
    moneda: String(c?.currency || "").toUpperCase(),
    estado,
    activa: estado === 1,
    empresa: c?.business?.id ? { id: String(c.business.id), nombre: String(c.business.name || "") } : null,
    origen,
  };
}

/** Pide un edge de Graph siguiendo `paging.next`. Lanza con el mensaje de Meta. */
async function pedirTodo(fetchImpl: Fetch, ruta: string, params: Record<string, string>, token: string): Promise<any[]> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url: string | null = `${FB_GRAPH_BASE}/${ruta}?${qs}`;
  const filas: any[] = [];
  for (let i = 0; url && i < MAX_PAGINAS; i++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    const j: any = await res.json();
    if (j?.error) throw new Error(j.error?.error_user_msg || j.error?.message || "error de Meta");
    filas.push(...(j?.data || []));
    url = j?.paging?.next || null;
  }
  return filas;
}

/**
 * Todas las cuentas publicitarias que alcanza `token`: las del usuario y las
 * de cada empresa (propias y de clientes). Deduplicadas por id; si una cuenta
 * aparece por varios caminos gana el rol propio del usuario, que es el que
 * seguro puede crear anuncios.
 */
export async function listarCuentasAccesibles(token: string, fetchImpl: Fetch = fetch as any): Promise<ListadoDeCuentas> {
  const t = String(token || "").trim();
  if (!t) return { cuentas: [], avisos: [], error: "Sin token de Facebook del negocio: conectá Facebook desde el panel." };

  const porId = new Map<string, CuentaPublicitaria>();
  const agregar = (c: CuentaPublicitaria | null) => {
    if (c && !porId.has(c.id)) porId.set(c.id, c);
  };
  const avisos: string[] = [];
  let algunaLectura = false;
  let errorUsuario: string | null = null;

  try {
    const filas = await pedirTodo(fetchImpl, "me/adaccounts", { fields: CAMPOS, limit: "100" }, t);
    filas.forEach((c) => agregar(aCuenta(c, "usuario")));
    algunaLectura = true;
  } catch (e: any) {
    errorUsuario = e?.message || "no se pudo leer me/adaccounts";
  }

  // Empresas: las del usuario (necesita business_management) + las que
  // aparecen como dueñas de sus cuentas.
  const empresas = new Map<string, string>();
  for (const c of porId.values()) if (c.empresa) empresas.set(c.empresa.id, c.empresa.nombre);
  try {
    const bs = await pedirTodo(fetchImpl, "me/businesses", { fields: "id,name", limit: "50" }, t);
    bs.forEach((b) => b?.id && empresas.set(String(b.id), String(b.name || "")));
    algunaLectura = true;
  } catch (e: any) {
    avisos.push(`No se pudieron leer tus empresas de Meta (${e?.message || "sin detalle"}). Suele faltar el permiso business_management: reconectá Facebook aceptándolo.`);
  }

  for (const [bid, bnombre] of empresas) {
    for (const [edge, origen] of [["owned_ad_accounts", "empresa_propia"], ["client_ad_accounts", "empresa_cliente"]] as const) {
      try {
        const filas = await pedirTodo(fetchImpl, `${bid}/${edge}`, { fields: CAMPOS, limit: "100" }, t);
        filas.forEach((c) => agregar(aCuenta({ ...c, business: c?.business || { id: bid, name: bnombre } }, origen)));
        algunaLectura = true;
      } catch (e: any) {
        avisos.push(`Empresa ${bnombre || bid}: no se pudo leer ${edge} (${e?.message || "sin detalle"}).`);
      }
    }
  }

  if (!algunaLectura) return { cuentas: [], avisos, error: errorUsuario || "no se pudo leer ninguna cuenta" };
  if (errorUsuario) avisos.unshift(`me/adaccounts falló: ${errorUsuario}`);
  return { cuentas: [...porId.values()], avisos, error: null };
}

/**
 * La cuenta a usar al CONECTAR. Reconectar renueva el token, no cambia de
 * cuenta: si la que ya estaba sigue a mano, se respeta. Si no, la primera
 * activa en la moneda del negocio (COP), después cualquier activa, después
 * la primera.
 */
export function elegirCuentaAlConectar(
  lista: CuentaPublicitaria[],
  yaElegida: string | null | undefined,
  monedaDelNegocio = "COP",
): CuentaPublicitaria | null {
  const previa = normalizarIdCuenta(yaElegida);
  if (previa) {
    const sigue = lista.find((c) => c.id === previa);
    if (sigue) return sigue;
  }
  const moneda = monedaDelNegocio.toUpperCase();
  return (
    lista.find((c) => c.activa && c.moneda === moneda) ||
    lista.find((c) => c.activa) ||
    lista[0] ||
    null
  );
}

/**
 * ¿Se puede cambiar a esta cuenta? Tiene que estar en lo que alcanza el token
 * del negocio: nunca se guarda un id que el negocio no puede usar (o que es
 * de otro).
 */
export function validarCambioDeCuenta(
  lista: CuentaPublicitaria[],
  idPedido: unknown,
): { ok: true; cuenta: CuentaPublicitaria; aviso: string | null } | { ok: false; motivo: string } {
  const id = normalizarIdCuenta(idPedido);
  if (!id) return { ok: false, motivo: "Ese no es un id de cuenta publicitaria válido (son solo números, con o sin act_)." };
  const cuenta = lista.find((c) => c.id === id);
  if (!cuenta) {
    const visibles = lista.map((c) => `${c.id} (${c.moneda || "?"})`).join(", ") || "ninguna";
    return {
      ok: false,
      motivo: `La cuenta ${id} no está entre las que ve la conexión de Facebook de este negocio (${visibles}). Si es tuya, reconectá Facebook y en la pantalla de Meta marcá también esa cuenta: Meta solo comparte las cuentas que se tildan.`,
    };
  }
  const avisos: string[] = [];
  if (cuenta.moneda !== "COP") avisos.push(`está en ${cuenta.moneda || "moneda desconocida"}, y solo se publica en COP`);
  if (!cuenta.activa) avisos.push("no está activa en Meta");
  return { ok: true, cuenta, aviso: avisos.length ? `Ojo: la cuenta ${id} ${avisos.join(" y ")}.` : null };
}

/** Una línea por cuenta, para Atlas y los mensajes de bloqueo. */
export function describirCuentas(lista: CuentaPublicitaria[], enUso?: string | null): string {
  const actual = normalizarIdCuenta(enUso);
  return lista
    .map((c) =>
      `${c.id === actual ? "✓ " : "• "}${c.nombre} — ${c.id} — ${c.moneda || "?"}${c.activa ? "" : " (no activa)"}${c.empresa?.nombre ? ` — empresa ${c.empresa.nombre}` : ""}`,
    )
    .join("\n");
}

/**
 * Qué decirle al dueño cuando la cuenta en uso no está en COP: las COP que ya
 * ve la conexión (y cómo pasarse), o que no hay ninguna y por qué.
 */
export function sugerenciaDeCuentaCop(
  lista: CuentaPublicitaria[],
  enUso?: string | null,
  comoCambiar = "Cambiala en Facebook → Cuenta publicitaria del panel, o pedíselo a Atlas.",
): string {
  const actual = normalizarIdCuenta(enUso);
  const cop = lista.filter((c) => c.moneda === "COP" && c.id !== actual);
  if (cop.length) {
    const nombres = cop.map((c) => `${c.nombre} (${c.id}${c.activa ? "" : ", no activa"})`).join(", ");
    return `Cuentas en COP disponibles: ${nombres}. ${comoCambiar}`;
  }
  return "La conexión de Facebook no ve ninguna cuenta en COP. Reconectá Facebook y en la pantalla de Meta tildá la cuenta COP (Meta solo comparte las cuentas que se marcan), o creá una en COP.";
}
