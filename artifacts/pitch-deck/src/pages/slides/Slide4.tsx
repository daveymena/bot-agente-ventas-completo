export default function Slide4() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #ff6b2b 0%, transparent 60%)" }} />
      <div className="absolute bottom-[-8vh] right-[-5vw] w-[40vw] h-[40vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,107,43,0.08), transparent 70%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-primary/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          Como Funciona
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-[7vw] pt-[10vh]">
        <h2 className="font-display font-black text-text text-center mb-[7vh]"
          style={{ fontSize: "4vw", textWrap: "balance" }}>
          Tres pasos para vender en piloto automatico
        </h2>

        <div className="flex items-start justify-center gap-0 w-full">
          <div className="flex flex-col items-center text-center w-[26vw]">
            <div className="w-[6vw] h-[6vw] rounded-full flex items-center justify-center mb-[2.5vh]"
              style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)", boxShadow: "0 0 3vw rgba(255,107,43,0.3)" }}>
              <span className="font-display font-black text-white" style={{ fontSize: "2.8vw" }}>1</span>
            </div>
            <div className="font-display font-bold text-text mb-[1.2vh]" style={{ fontSize: "2.2vw" }}>
              Conecta
            </div>
            <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.7vw" }}>
              Escanea un codigo QR con tu numero de WhatsApp. Sin apps adicionales, sin codigo.
            </div>
          </div>

          <div className="flex items-center pt-[3vh] flex-shrink-0 mx-[2vw]">
            <div className="h-[0.2vh] w-[5vw]" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div className="font-display font-black text-primary mx-[0.5vw]" style={{ fontSize: "2.5vw" }}>→</div>
            <div className="h-[0.2vh] w-[5vw]" style={{ background: "rgba(255,255,255,0.12)" }} />
          </div>

          <div className="flex flex-col items-center text-center w-[26vw]">
            <div className="w-[6vw] h-[6vw] rounded-full flex items-center justify-center mb-[2.5vh]"
              style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", boxShadow: "0 0 3vw rgba(168,85,247,0.3)" }}>
              <span className="font-display font-black text-white" style={{ fontSize: "2.8vw" }}>2</span>
            </div>
            <div className="font-display font-bold text-text mb-[1.2vh]" style={{ fontSize: "2.2vw" }}>
              Configura
            </div>
            <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.7vw" }}>
              Carga tus productos, precios y personalidad del agente. Sofia aprende tu negocio.
            </div>
          </div>

          <div className="flex items-center pt-[3vh] flex-shrink-0 mx-[2vw]">
            <div className="h-[0.2vh] w-[5vw]" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div className="font-display font-black text-primary mx-[0.5vw]" style={{ fontSize: "2.5vw" }}>→</div>
            <div className="h-[0.2vh] w-[5vw]" style={{ background: "rgba(255,255,255,0.12)" }} />
          </div>

          <div className="flex flex-col items-center text-center w-[26vw]">
            <div className="w-[6vw] h-[6vw] rounded-full flex items-center justify-center mb-[2.5vh]"
              style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 0 3vw rgba(34,197,94,0.3)" }}>
              <span className="font-display font-black text-white" style={{ fontSize: "2.8vw" }}>3</span>
            </div>
            <div className="font-display font-bold text-text mb-[1.2vh]" style={{ fontSize: "2.2vw" }}>
              Vende
            </div>
            <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.7vw" }}>
              Sofia atiende clientes, envia catalogos, genera links de pago y cierra ventas. Automatico.
            </div>
          </div>
        </div>

        <div className="mt-[6vh] px-[3vw] py-[1.8vh] rounded-[1vw]"
          style={{ background: "rgba(255,107,43,0.06)", border: "1px solid rgba(255,107,43,0.2)" }}>
          <span className="font-body text-primary/80" style={{ fontSize: "1.8vw" }}>
            Tiempo de configuracion inicial: menos de 10 minutos
          </span>
        </div>
      </div>
    </div>
  );
}
