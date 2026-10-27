import { FB_GRAPH_BASE } from "./meta-api-version";

/** No mezclar el ID de una app propia con el secreto/configuración de otra. */
export function appFacebookParaLogin(fb: Record<string, any> = {}, env = process.env) {
  const propia = !!fb.appId;
  return {
    appId: propia ? fb.appId : env.FB_APP_ID || "",
    appSecret: propia ? fb.appSecret || "" : env.FB_APP_SECRET || "",
    loginConfigId: propia ? fb.loginConfigId || "" : env.FB_LOGIN_CONFIG_ID || "",
    origen: propia ? "negocio" : "plataforma",
  };
}

export interface PaginaFacebook {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
}

/** Usa cursores sobre el host fijo: no reenviar tokens a paging.next arbitrarios. */
export async function listarPaginasFacebook(token: string, fetchImpl: typeof fetch = fetch): Promise<PaginaFacebook[]> {
  const paginas = new Map<string, PaginaFacebook>();
  let after = "";
  const cursores = new Set<string>();
  do {
    const qs = new URLSearchParams({ fields: "id,name,access_token,tasks", limit: "100", access_token: token });
    if (after) qs.set("after", after);
    const res = await fetchImpl(`${FB_GRAPH_BASE}/me/accounts?${qs}`, { signal: AbortSignal.timeout(15000) });
    const data: any = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.error_user_msg || data.error?.message || "Error listando páginas de Facebook");
    for (const p of data.data || []) if (p.id && p.access_token) paginas.set(String(p.id), p);
    after = data.paging?.next ? data.paging?.cursors?.after || "" : "";
    if (after && cursores.has(after)) throw new Error("Facebook repitió el cursor de páginas. Volvé a conectar.");
    if (after) cursores.add(after);
    if (cursores.size > 50) throw new Error("No se pudo completar la lista de páginas. Volvé a conectar.");
  } while (after);
  return [...paginas.values()];
}

/** Reconectar conserva la página; una primera conexión con varias exige elegir. */
export function elegirPaginaFacebook(paginas: PaginaFacebook[], pedida?: string | null, previa?: string | null) {
  if (pedida) return paginas.find(p => p.id === pedida) || null;
  if (previa) {
    const actual = paginas.find(p => p.id === previa);
    if (actual) return actual;
  }
  return paginas.length === 1 ? paginas[0] : null;
}

export function puedePublicarFacebook(tasks: string[] = [], permisos: string[] = []) {
  return tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE") || permisos.includes("pages_manage_posts");
}
