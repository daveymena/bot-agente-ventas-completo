/** La pantalla histórica de Copilot guarda en githubModel, no aiProviders. */
export function preferenciaModeloAtlas(fila: { aiProvider?: string | null; githubModel?: string | null } | null | undefined, guardados: Record<string, { model?: string }> = {}) {
  const proveedor = fila?.aiProvider;
  if (!proveedor) return null;
  const modelo = proveedor === 'github_copilot_internal'
    ? fila?.githubModel || guardados[proveedor]?.model
    : guardados[proveedor]?.model;
  if (!modelo?.trim()) return null;
  return { providerID: proveedor === 'github_copilot_internal' ? 'github-copilot' : proveedor, modelID: modelo.trim() };
}

/** Copilot usa el OAuth existente de OpenCode, no la ruta directa de API keys. */
export function copilotElegido(fila: { aiProvider?: string | null; githubToken?: string | null } | null | undefined, entorno: Record<string, string | undefined>) {
  return fila?.aiProvider === 'github_copilot_internal' && Boolean(entorno.ATLAS_OPENCODE_HOST);
}
