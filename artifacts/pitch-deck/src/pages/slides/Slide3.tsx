export default function Slide3() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute bottom-0 left-0 w-[50vw] h-[50vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.12), transparent 70%)" }} />
      <div className="absolute top-[-5vh] right-[5vw] w-[35vw] h-[35vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,107,43,0.1), transparent 70%)" }} />
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #a855f7 0%, #ff6b2b 50%, transparent 80%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-purple/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          La Solucion
        </span>
      </div>

      <div className="absolute inset-0 flex pt-[14vh]">
        <div className="flex flex-col justify-center pl-[7vw] w-[52vw]">
          <div className="font-display font-black text-text leading-[1] tracking-tighter mb-[1vh]"
            style={{ fontSize: "3vw" }}>
            Presentamos a
          </div>
          <div className="font-display font-black leading-[1] tracking-tighter"
            style={{ fontSize: "9vw",
              background: "linear-gradient(135deg, #ff6b2b 0%, #ff9f0a 40%, #a855f7 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            SOFIA
          </div>
          <div className="font-body text-muted mt-[2vh] max-w-[42vw] leading-relaxed" style={{ fontSize: "2vw" }}>
            Tu agente de ventas con inteligencia artificial. Atiende clientes, responde preguntas, envia catalogos y cierra ventas — sola.
          </div>

          <div className="flex gap-[4vw] mt-[5vh]">
            <div>
              <div className="font-display font-black text-primary" style={{ fontSize: "3.5vw" }}>24/7</div>
              <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Sin parar</div>
            </div>
            <div style={{ width: "0.15vw", background: "rgba(255,255,255,0.1)" }} />
            <div>
              <div className="font-display font-black text-primary" style={{ fontSize: "3.5vw" }}>3x</div>
              <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Mas ventas</div>
            </div>
            <div style={{ width: "0.15vw", background: "rgba(255,255,255,0.1)" }} />
            <div>
              <div className="font-display font-black text-primary" style={{ fontSize: "3.5vw" }}>$0</div>
              <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Para empezar</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 pr-[6vw]">
          <div className="relative w-[22vw] h-[22vw]">
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(255,107,43,0.15), rgba(168,85,247,0.1), transparent 70%)" }} />
            <div className="absolute inset-[10%] rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(255,107,43,0.15), rgba(168,85,247,0.15))",
                border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="absolute inset-[15%] rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(255,107,43,0.2), rgba(168,85,247,0.2))",
                  border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="w-[8vw] h-[8vw] rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #ff6b2b, #a855f7)" }}>
                  <span className="font-display font-black text-white" style={{ fontSize: "4.5vw" }}>S</span>
                </div>
              </div>
            </div>
            <div className="absolute top-[8%] right-[8%] rounded-[0.8vw] px-[1vw] py-[0.6vh]"
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <span className="font-body text-accent" style={{ fontSize: "1.2vw" }}>IA activa</span>
            </div>
            <div className="absolute bottom-[8%] left-[8%] rounded-[0.8vw] px-[1vw] py-[0.6vh]"
              style={{ background: "rgba(255,107,43,0.15)", border: "1px solid rgba(255,107,43,0.3)" }}>
              <span className="font-body text-primary" style={{ fontSize: "1.2vw" }}>+1 venta</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
