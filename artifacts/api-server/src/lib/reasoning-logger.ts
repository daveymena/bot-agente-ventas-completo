import { db } from "@workspace/db";
// Nota: Deberíamos tener una tabla `ai_reasoning_logs` en el futuro.
// Por ahora lo loguearemos estructurado en consola/archivo para trazabilidad.

export interface ReasoningLogPayload {
  conversationId: number;
  timestamp: Date;
  intent: string;
  emotionalState: string;
  strategy: string;
  confidenceScore: number;
  actionTaken: string;
  metadata?: Record<string, any>;
}

export function logAIReasoning(payload: ReasoningLogPayload) {
  // 1. Log a consola estructurado (puede ser parseado por Datadog/CloudWatch)
  const logEntry = JSON.stringify({
    level: "INFO",
    type: "AI_REASONING_TRACE",
    ...payload
  });
  
  console.log(`[AI-REASONING-TRACE] ${logEntry}`);
  
  // 2. Futuro: Inserción asíncrona en BD
  /*
  db.insert(aiReasoningLogs).values({
    conversationId: payload.conversationId,
    intent: payload.intent,
    emotionalState: payload.emotionalState,
    strategy: payload.strategy,
    action: payload.actionTaken,
    createdAt: payload.timestamp
  }).catch(e => console.error("Error guardando reasoning log", e));
  */
}
