export function estadoCopilot(datos: { hasGithubToken?: boolean; hasCopilotSessionToken?: boolean; copilotSessionExpiresAt?: string | null }, ahora = Date.now()) {
  const guardado = Boolean(datos.hasGithubToken);
  const vigente = Boolean(datos.hasCopilotSessionToken) && new Date(datos.copilotSessionExpiresAt || '').getTime() > ahora;
  return { guardado, vigente, etiqueta: vigente ? 'Sesión de Copilot vigente' : guardado ? 'Token de Copilot guardado · sesión renovable al usar' : 'Sin token de Copilot configurado' };
}
