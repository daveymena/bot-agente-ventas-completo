/** Estado común para que conversaciones sintéticas no se confundan con clientes. */
export const ESTADO_CONVERSACION_EVALUACION = "evaluation";

/** Cubre el estado nuevo y las pruebas históricas que quedaron como "ai". */
export function esConversacionOperativa(c: { status?: unknown; contactName?: unknown; contactPhone?: unknown }): boolean {
  if (String(c.status || "") === ESTADO_CONVERSACION_EVALUACION) return false;
  const telefonoDeEvaluacion = /^573009\d{6}$/.test(String(c.contactPhone || ""));
  return !(String(c.contactName || "") === "Evaluación" && telefonoDeEvaluacion);
}
