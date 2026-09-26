/**
 * Tipos para especulador: anticipa próximo turno
 *
 * "Cliente va a preguntar por precio" → tengo respuesta lista
 * "Va a pedir descuento" → anticipo alternativas
 * "Va a desaparecer después del cierre" → ofrece postventa
 */

export interface HipotesisDelProximoTurno {
  id?: string;
  intent: string; // "precio", "garantia", "envio", "objecion", etc
  tema: string;
  descripcion: string;
  probabilidad: number; // 0-100
  razonamiento: string;
  respuestaAnticipada: string;
  alternativas: string[];
  createdAt?: Date;
}

export interface PatronDeComportamiento {
  id?: string;
  nombre: string;
  descripcion: string;
  disparadores: string[]; // qué hace el cliente para trigger esto
  proximoComportamiento: string;
  frecuencia: number; // cuántas veces pasó
  confianza: number; // 0-100
  ejemplos: string[];
}

export interface ValidacionDeHipotesis {
  hipotesis: HipotesisDelProximoTurno;
  mensajeReal: string;
  acerto: boolean;
  proximoTema: string;
  razonPorQueFallo?: string;
  aprendizaje: string;
}

export interface RegistroDeEspeculacion {
  id?: string;
  conversationId: string;
  turnoNum: number;
  hipotesis: HipotesisDelProximoTurno;
  validacion: ValidacionDeHipotesis;
  mejora: number; // 0-100: cuán útil fue la anticipación
}

export interface PerfilDeCliente {
  tags: string[];
  patronesDetectados: PatronDeComportamiento[];
  historicoHipotesis: ValidacionDeHipotesis[];
  tasaAciertoPromedio: number;
  proximoComportamientoEsperado: string;
}
