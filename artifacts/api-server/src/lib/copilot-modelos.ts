import { getCopilotSessionToken } from './copilot';
import { normalizarTokensDeCopilot } from './copilot-cuentas';

export const GITHUB_MODELS_RETIRADO = 'GitHub Models fue retirado el 30 de julio de 2026. Conecta GitHub Copilot o elige otro proveedor disponible.';

export function tokensCopilotGuardados(fila: { githubToken?: string | null; copilotTokens?: unknown } | null | undefined, entorno: Record<string, string | undefined>) {
  let lista: unknown = null;
  try { lista = JSON.parse(entorno.COPILOT_TOKENS || 'null'); } catch { /* compatibilidad con token único */ }
  return [...new Set([
    ...normalizarTokensDeCopilot(fila?.githubToken),
    ...normalizarTokensDeCopilot(entorno.GITHUB_COPILOT_TOKEN),
    ...normalizarTokensDeCopilot(entorno.GITHUB_TOKEN),
    ...normalizarTokensDeCopilot(fila?.copilotTokens),
    ...normalizarTokensDeCopilot(lista),
  ])];
}

export async function sesionCopilotGuardada(tokens: string[]) {
  const limite = Date.now() + 15_000;
  for (const token of tokens) {
    if (Date.now() >= limite) break;
    const sesion = await getCopilotSessionToken(token);
    if (sesion && sesion.expiresAt > Date.now() / 1000) return sesion;
  }
  return null;
}

/** Atlas puede tener su OAuth en OpenCode aunque el intercambio local falle. */
export async function modelosCopilotEnAtlas(): Promise<string[] | null> {
  const { opencodeConfig } = await import('./opencode-provider-sync');
  const cfg = opencodeConfig();
  if (!cfg) return null;
  try {
    const r = await fetch(`${cfg.host}/provider`, { headers: { Authorization: cfg.authHeader }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const data: any = await r.json();
    if (!Array.isArray(data.connected) || !data.connected.includes('github-copilot')) return null;
    const proveedores = data.providers ?? data.all ?? [];
    const p = Array.isArray(proveedores) ? proveedores.find((p: any) => (p.id || p.providerID) === 'github-copilot') : proveedores['github-copilot'];
    const modelos = p?.models;
    return Array.isArray(modelos) ? modelos.map((m: any) => m?.id).filter((v: unknown): v is string => typeof v === 'string') : Object.keys(modelos || {}).sort();
  } catch { return null; }
}

/** Catálogo de la cuenta conectada, nunca una lista de nombres inventados. */
export async function modelosDeCopilot(rawToken: string | string[], headers: Record<string, string> = {}) {
  const sesion = await sesionCopilotGuardada(Array.isArray(rawToken) ? rawToken : [rawToken]);
  if (!sesion) throw new Error('No se pudo renovar la sesión local de Copilot. El token guardado se conserva; comprueba también la conexión de Atlas.');
  const r = await fetch('https://api.githubcopilot.com/models', {
    headers: { ...headers, Authorization: `Bearer ${sesion.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403
    ? 'GitHub no habilitó el catálogo para esta conexión. Revisa la cuenta, el plan y las políticas de Copilot.'
    : `No se pudo consultar Copilot (${r.status}). Intenta de nuevo.`);
  const body: any = await r.json();
  const data: any[] = Array.isArray(body?.data) ? body.data : [];
  return [...new Set<string>(data.filter(m =>
    typeof m?.id === 'string' && m.id.trim() &&
    (!m.capabilities?.type || m.capabilities.type === 'chat') &&
    m.policy?.state !== 'disabled' && m.model_picker_enabled !== false
  ).map(m => m.id))].sort();
}
