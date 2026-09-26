/**
 * Tipos para el sistema de razonamiento del cerebro autónomo
 */

export interface OpcionRespuesta {
  id: "A" | "B" | "C";
  texto: string;
  estilo: "directo" | "consultivo" | "preventivo";
  riesgo: "bajo" | "medio" | "alto";
  razonamiento: string;
}

export interface PuntajeOpcion {
  id: "A" | "B" | "C";
  alineación: number; // 0-100: ¿cuánto responde lo que preguntó?
  seguridad: number; // 0-100: ¿tan seguro estoy de esto?
  riesgos: string[]; // ["precio_inventado", "contradicción", "invención"]
  total: number; // 0-100: score final
}

export interface DecisionRazonador {
  mejorOpción: "A" | "B" | "C";
  confianza: number; // 0-100
  respuesta: string;
  razonamiento: string;
  riesgosDetectados: string[];
  escalada: boolean; // ¿pasó a humano?
  motivoEscalada?: string;
  trazaCompleta: {
    opcionesGeneradas: OpcionRespuesta[];
    puntajes: PuntajeOpcion[];
    razonamientoFinal: string;
  };
}

export interface ContextoRazonamiento {
  mensajeActual: string;
  intentDelCliente: string;
  estadoConversacion: any;
  historial: Array<{ role: string; content: string }>;
  productoEnFoco?: { id: number; nombre: string; precio: number } | null;
  catálogo: any[];
  conocimientoCargado: any[];
}
