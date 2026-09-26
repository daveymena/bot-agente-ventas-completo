/**
 * Tipos para planificador: piensa la conversación completa
 *
 * En lugar de responder turno a turno sin contexto,
 * genera un plan: "aquí estamos, aquí queremos ir, estos son los pasos"
 */

export interface PasoDelPlan {
  id: number;
  nombre: string;
  descripcion: string;
  objetivo: string; // "confirmar que necesita", "mostrar opciones", etc
  preguntaOAccion: string;
  /** Si sale bien */
  siExito: number | "cierre"; // ID del próximo paso o "cierre"
  /** Si sale mal */
  siFracaso: number | "alternativa";
  /** Cuántos turnos máximo aquí */
  maxTurnos: number;
  /** Tags que disparan este paso */
  dispara: string[];
  /** Señales de éxito */
  senalesExito: string[];
  /** Señales de fracaso */
  senalesFracaso: string[];
}

export interface RamaAlternativa {
  id: string;
  nombre: string;
  condicion: string; // "cliente_precio_sensible", "cliente_urgencia", etc
  pasos: PasoDelPlan[];
  probabilidad: number; // 0-100
}

export interface PlanDelCliente {
  conversationId: string;
  intent: string; // "compra_evaluando", "comparacion", "objecion", etc
  pasos: PasoDelPlan[];
  ramasAlternativas: RamaAlternativa[];
  pasoActual: number;
  pasosSeguidos: number[]; // historial de qué pasos hizo
  turnoActual: number;
  completitud: number; // 0-100: cuán lejos está del cierre
  señalización: {
    pasoActualCorrecto: boolean;
    ramaActualCorrecta: boolean;
    alineacion: number; // 0-100
  };
}

export interface EvaluacionAlineacion {
  pasoActual: number;
  respuestaAgente: string;
  alineacion: number; // 0-100
  detalle: string;
  sugiere: "continuar" | "ajustar" | "saltarpaso" | "volver";
  razon: string;
}

export interface ActualizacionDelPlan {
  pasoActualAnterior: number;
  pasoActualNuevo: number;
  razonCambio: string;
  señalDetectada: string;
  turnosEnPaso: number;
}
