import { getCopilotSessionToken } from './copilot';

export const GITHUB_MODELS_RETIRADO = 'GitHub Models fue retirado el 30 de julio de 2026. Conecta GitHub Copilot o elige otro proveedor disponible.';

/** Catálogo de la cuenta conectada, nunca una lista de nombres inventados. */
export async function modelosDeCopilot(rawToken: string, headers: Record<string, string> = {}) {
  const sesion = await getCopilotSessionToken(rawToken);
  if (!sesion || sesion.expiresAt <= Date.now() / 1000) throw new Error('Vuelve a conectar GitHub Copilot mediante el código de dispositivo.');
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
