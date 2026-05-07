export default function Slide8() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #22c55e 0%, transparent 60%)" }} />
      <div className="absolute bottom-[-5vh] left-[20vw] w-[50vw] h-[40vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.07), transparent 70%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-accent/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          Clientes
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col justify-center px-[7vw] pt-[10vh]">
        <h2 className="font-display font-black text-text mb-[5vh]" style={{ fontSize: "3.8vw" }}>
          Lo que dicen nuestros clientes
        </h2>

        <div className="flex gap-[3vw]">
          <div className="flex-1 rounded-[1.5vw] p-[3vw] flex flex-col justify-between"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div className="font-display font-black text-primary mb-[2vh]" style={{ fontSize: "4vw" }}>"</div>
              <div className="font-body text-text leading-relaxed" style={{ fontSize: "2vw" }}>
                Antes me perdia ventas de noche. Ahora Sofia atiende sola. Vendi mas de $8M el mes pasado solo con WhatsApp.
              </div>
            </div>
            <div className="flex items-center gap-[1.5vw] mt-[3vh]">
              <div className="w-[4vw] h-[4vw] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)" }}>
                <span className="font-display font-black text-white" style={{ fontSize: "1.8vw" }}>CM</span>
              </div>
              <div>
                <div className="font-display font-bold text-text" style={{ fontSize: "1.7vw" }}>Carlos Medina</div>
                <div className="font-body text-muted" style={{ fontSize: "1.5vw" }}>Tienda tech — Bogota</div>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-[1.5vw] p-[3vw] flex flex-col justify-between"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div className="font-display font-black text-primary mb-[2vh]" style={{ fontSize: "4vw" }}>"</div>
              <div className="font-body text-text leading-relaxed" style={{ fontSize: "2vw" }}>
                En la primera semana de prueba ya recupere la inversion del ano. El agente responde mejor que yo en muchos casos.
              </div>
            </div>
            <div className="flex items-center gap-[1.5vw] mt-[3vh]">
              <div className="w-[4vw] h-[4vw] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>
                <span className="font-display font-black text-white" style={{ fontSize: "1.8vw" }}>LT</span>
              </div>
              <div>
                <div className="font-display font-bold text-text" style={{ fontSize: "1.7vw" }}>Laura Torres</div>
                <div className="font-body text-muted" style={{ fontSize: "1.5vw" }}>Boutique de ropa — Medellin</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-[0.8vw] mt-[4vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary" />
          <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary" />
          <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary" />
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        </div>
      </div>
    </div>
  );
}
