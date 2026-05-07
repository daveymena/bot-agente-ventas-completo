export default function Slide6() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #22c55e 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,197,94,0.06), transparent 70%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-accent/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          Resultados
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col justify-center items-center px-[7vw] pt-[8vh]">
        <h2 className="font-display font-black text-text text-center mb-[6vh]" style={{ fontSize: "3.8vw" }}>
          Numeros que hablan por si solos
        </h2>

        <div className="grid gap-[2.5vw] w-full" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="flex flex-col items-center text-center rounded-[1.5vw] py-[4vh] px-[1.5vw]"
            style={{ background: "rgba(255,107,43,0.06)", border: "1px solid rgba(255,107,43,0.18)" }}>
            <div className="font-display font-black text-primary leading-[1] tracking-tighter"
              style={{ fontSize: "7.5vw" }}>
              3x
            </div>
            <div className="font-body text-muted mt-[1.5vh] leading-snug" style={{ fontSize: "1.8vw" }}>
              mas ventas en promedio
            </div>
          </div>

          <div className="flex flex-col items-center text-center rounded-[1.5vw] py-[4vh] px-[1.5vw]"
            style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }}>
            <div className="font-display font-black text-accent leading-[1] tracking-tighter"
              style={{ fontSize: "7.5vw" }}>
              24/7
            </div>
            <div className="font-body text-muted mt-[1.5vh] leading-snug" style={{ fontSize: "1.8vw" }}>
              atencion sin interrupcion
            </div>
          </div>

          <div className="flex flex-col items-center text-center rounded-[1.5vw] py-[4vh] px-[1.5vw]"
            style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)" }}>
            <div className="font-display font-black text-purple leading-[1] tracking-tighter"
              style={{ fontSize: "7.5vw" }}>
              10'
            </div>
            <div className="font-body text-muted mt-[1.5vh] leading-snug" style={{ fontSize: "1.8vw" }}>
              minutos para arrancar
            </div>
          </div>

          <div className="flex flex-col items-center text-center rounded-[1.5vw] py-[4vh] px-[1.5vw]"
            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <div className="font-display font-black leading-[1] tracking-tighter"
              style={{ fontSize: "7.5vw", color: "#f59e0b" }}>
              $0
            </div>
            <div className="font-body text-muted mt-[1.5vh] leading-snug" style={{ fontSize: "1.8vw" }}>
              para comenzar la prueba
            </div>
          </div>
        </div>

        <div className="mt-[4vh] font-body text-muted/60 text-center" style={{ fontSize: "1.5vw" }}>
          Basado en resultados promedio de negocios que usan VentasPro en Colombia
        </div>
      </div>
    </div>
  );
}
