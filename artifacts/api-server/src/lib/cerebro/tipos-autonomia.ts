/**
 * Tipos para autonomía acotada
 *
 * Decisiones automáticas (sin humano):
 * - Cambios de redacción, tono, reordenamiento
 *
 * Decisiones escaladas (requieren aprobación):
 * - Objetivo, público, presupuesto, políticas
 */

export interface DeteccionErrores {
  tipo: "redaccion" | "tono" | "omision" | "contradiccion" | "precio_inventado";
  descripcion: string;
  severidad: "bajo" | "medio" | "alto";
  ejemploProblema: string;
  ejemploCorreccion: string;
  frecuencia: number; // cuántas veces pasó
}

export interface CandidataDeMejora {
  id?: string;
  tenantId: number;
  agentId: number;
  tipo: "tactico" | "operativo" | "estrategico";
  titulo: string;
  descripcion: string;
  promptActual: string;
  promptNuevo: string;
  razon: string;
  /** Qué cambió */
  diff: {
    removed: string[];
    added: string[];
  };
  createdAt: Date;
}

export interface ResultadoSimulacion {
  arquetipoId: string;
  arquitectoNombre: string;
  tasaExitoAntes: number; // 0-100
  tasaExitoDespues: number;
  mejora: number; // tasaExitoDespues - tasaExitoAntes
  mensajeEjemplo: string;
  respuestaAntes: string;
  respuestaDespues: string;
}

export interface ComparacionPrompt {
  mejora: CandidataDeMejora;
  simulaciones: ResultadoSimulacion[];
  confianzaPromedio: number; // 0-100
  desvioEstandar: number;
  sinRiesgos: boolean;
  /** Evidencia: cuántas simulaciones se corrieron y cuánto mejoró en promedio. */
  simulacionesTotal: number;
  mejoraMedia: number;
  /** Los 14 arquetipos que mejoraron */
  arquetiposMejoraron: string[];
  /** Los que empeoraron */
  arquetiposEmpeoraron: string[];
}

export interface DecisionAutonomia {
  mejora: CandidataDeMejora;
  decision: "auto_aplicar" | "proponer_4h" | "pedir_aprobacion" | "rechazar";
  confianza: number;
  razonamiento: string;
  fechaAplicacion?: Date;
  fechaRechazo?: Date;
  motivoRechazo?: string;
}

export interface RegistroAprendizaje {
  id?: string;
  tenantId: number;
  agentId: number;
  fechaAplicacion: Date;
  mejora: CandidataDeMejora;
  resultadoReal: {
    tasaExitoAntes: number;
    tasaExitoDespues: number;
    conversacionesAnalizadas: number;
  };
  mantener: boolean; // ¿valió la pena?
  feedback?: string;
}
