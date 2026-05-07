export default function Slide2() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-[-5vh] right-[10vw] w-[40vw] h-[40vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,107,43,0.1), transparent 70%)" }} />
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #ff6b2b 0%, transparent 60%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-primary/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          El Contexto
        </span>
      </div>

      <div className="absolute inset-0 flex pt-[14vh]">
        <div className="flex flex-col justify-center pl-[7vw] w-[46vw]">
          <div className="font-display font-black text-primary leading-[1] tracking-tighter"
            style={{ fontSize: "11vw" }}>
            93%
          </div>
          <div className="font-body text-text/70 mt-[1.5vh] leading-relaxed" style={{ fontSize: "2vw" }}>
            de colombianos con internet
          </div>
          <div className="font-body text-text/70 leading-relaxed" style={{ fontSize: "2vw" }}>
            usan WhatsApp cada dia.
          </div>
          <div className="mt-[3vh] h-[0.2vh] w-[6vw] bg-primary/40" />
          <div className="font-body text-muted mt-[2vh]" style={{ fontSize: "1.6vw" }}>
            Fuente: DataReportal 2024
          </div>
        </div>

        <div className="flex flex-col justify-center pl-[4vw] pr-[7vw] flex-1 gap-[3.5vh]">
          <div className="flex items-start gap-[2vw]">
            <div className="w-[0.35vw] h-[7vh] bg-primary/50 mt-[0.5vh] flex-shrink-0" />
            <div>
              <div className="font-display font-bold text-text" style={{ fontSize: "2vw" }}>
                Atencion manual no escala
              </div>
              <div className="font-body text-muted mt-[0.8vh]" style={{ fontSize: "1.7vw" }}>
                Un vendedor humano atiende maximo 50 chats por dia. WhatsApp recibe miles.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-[2vw]">
            <div className="w-[0.35vw] h-[7vh] bg-primary/50 mt-[0.5vh] flex-shrink-0" />
            <div>
              <div className="font-display font-bold text-text" style={{ fontSize: "2vw" }}>
                Ventas fuera de horario perdidas
              </div>
              <div className="font-body text-muted mt-[0.8vh]" style={{ fontSize: "1.7vw" }}>
                El 60% de los mensajes llega fuera del horario laboral. Sin respuesta, sin venta.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-[2vw]">
            <div className="w-[0.35vw] h-[7vh] bg-primary/50 mt-[0.5vh] flex-shrink-0" />
            <div>
              <div className="font-display font-bold text-text" style={{ fontSize: "2vw" }}>
                Procesos manuales y errores
              </div>
              <div className="font-body text-muted mt-[0.8vh]" style={{ fontSize: "1.7vw" }}>
                Precios desactualizados, links de pago enviados tarde, clientes sin seguimiento.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
