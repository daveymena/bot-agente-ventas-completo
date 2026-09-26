/**
 * Tipos para memoria multi-capa del cerebro
 *
 * EPISÓDICA: "Cliente X dijo Y"
 * SEMÁNTICA: "Clientes con X prefieren Y"
 * PROCEDURAL: "Cuando pasa X, hacer Y"
 */

export interface RegistroEpisodico {
  id?: number;
  tenantId: number;
  conversationId: string;
  messageId?: string;
  /** Lo que el cliente dijo o preguntó */
  mensajeDelCliente: string;
  /** Lo que respondió el agente */
  respuestaDelAgente: string;
  /** Qué tan bien funcionó (0-100) */
  éxito: number; // 0-100: cliente continuó? cerró? preguntó más?
  /** Tags para búsqueda: ["dolor_espalda", "precio_sensible", etc] */
  tags: string[];
  /** Contexto: qué momento de la conversación */
  momento: "apertura" | "descubrimiento" | "objeción" | "cierre" | "postventa";
  /** Marcas de tiempo */
  createdAt: Date;
  updatedAt: Date;
}

export interface PatronSematico {
  id?: number;
  tenantId: number;
  /** Nombre del patrón: "clientes_dolor_espalda" */
  nombre: string;
  /** Descripción: "Clientes con dolor de espalda prefieren corrector+almohada" */
  descripcion: string;
  /** Tags que disparan este patrón */
  dispara: string[]; // ["dolor_espalda"]
  /** Qué recomendar */
  recomendaciones: string[];
  /** Probabilidad de éxito (0-100) */
  confianza: number;
  /** Cuántos episódios lo respaldan */
  evidencia: number;
  /** Última vez que se usó */
  usadoUltimamente: Date;
}

export interface ReglaProceduralistica {
  id?: number;
  tenantId: number;
  /** Nombre: "dolor_espalda_zona" */
  nombre: string;
  /** Descripción: "Cuando cliente menciona dolor de espalda, preguntar qué zona" */
  descripcion: string;
  /** Patrón que la dispara */
  disparaPorPatron: string; // "clientes_dolor_espalda"
  /** Acción a tomar */
  accion: string;
  /** Pregunta a hacer o paso a seguir */
  paso: string;
  /** Success rate */
  tasaExito: number;
  /** Creada por: "usuario" | "auto" */
  origen: "usuario" | "auto";
  createdAt: Date;
}

export interface BusquedaMemoria {
  query: string;
  tags?: string[];
  tenantId: number;
  topN?: number; // default 3
}

export interface ResultadoBusquedaMemoria {
  episodios: RegistroEpisodico[];
  patrones: PatronSematico[];
  reglas: ReglaProceduralistica[];
  relevancia: number; // 0-100
  razonamiento: string;
}

export interface ContextoMemoria {
  tensionId: number;
  conversationId: string;
  ultimosMensajes: Array<{ role: string; content: string }>;
  intent: string;
  tags: string[];
}
