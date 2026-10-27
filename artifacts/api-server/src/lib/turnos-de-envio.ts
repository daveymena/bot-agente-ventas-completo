/**
 * Agenda de envíos de UN número de WhatsApp: a qué hora le toca a cada
 * destinatario nuevo.
 *
 * El espaciado entre personas distintas (8–20 s, ver whatsapp.ts) protege al
 * número, pero se cumplía DURMIENDO dentro del turno del orquestador. Con 4
 * lugares para toda la plataforma, cuatro respuestas de un mismo negocio
 * esperando su espaciado dejaban sin respuesta a todos los demás negocios.
 * Ahora el orquestador pide el turno antes de enviar; si falta, pospone el
 * mensaje y libera el lugar.
 *
 * El turno queda APARTADO al pedirlo. Antes dos envíos en paralelo leían el
 * mismo "último envío", dormían lo mismo y salían juntos: justo la ráfaga que
 * el espaciado quería evitar.
 */
export class TurnosDeEnvio {
  private proximoLibreMs = 0;
  private ultimoDestino = "";
  private reservas = new Map<string, number>();

  constructor(
    private readonly reloj: () => number = () => Date.now(),
    private readonly azar: () => number = Math.random,
  ) {}

  private espaciado(): number {
    const min = Number(process.env.WA_MIN_MS_ENTRE_ENVIOS) || 8000;
    const jitter = Number(process.env.WA_JITTER_MS_ENTRE_ENVIOS) || 12000;
    return min + Math.floor(this.azar() * jitter);
  }

  /** Ms que faltan para poder escribirle a `destino`. Deja el turno apartado. */
  reservar(destino: string): number {
    const ahora = this.reloj();
    // Una reserva que nadie usó (el envío falló o se descartó) solo deja un
    // hueco en la agenda; se borra para que el mapa no crezca sin fin.
    for (const [jid, cuando] of this.reservas) if (cuando < ahora - 30 * 60_000) this.reservas.delete(jid);
    const apartado = this.reservas.get(destino);
    if (apartado !== undefined) return Math.max(0, apartado - ahora);
    // Seguir escribiéndole a la misma persona no es cambiar de destinatario.
    if (destino && destino === this.ultimoDestino) return 0;
    const turno = Math.max(ahora, this.proximoLibreMs);
    this.proximoLibreMs = turno + this.espaciado();
    this.reservas.set(destino, turno);
    return turno - ahora;
  }

  /** Cada envío real lo llama justo antes de salir: devuelve cuánto dormir. */
  antesDeEnviar(destino: string): number {
    const espera = this.reservar(destino);
    this.reservas.delete(destino);
    this.ultimoDestino = destino;
    return espera;
  }
}
