/** Predicates SQL para omitir evaluaciones actuales e históricas de métricas reales. */
import { and, eq, like, ne, not } from "drizzle-orm";
import { conversations } from "@workspace/db";
import { ESTADO_CONVERSACION_EVALUACION } from "./conversation-status";

export function condicionConversacionOperativa() {
  return and(
    ne(conversations.status, ESTADO_CONVERSACION_EVALUACION)!,
    not(and(eq(conversations.contactName, "Evaluación"), like(conversations.contactPhone, "573009______"))!)!,
  )!;
}
