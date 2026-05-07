export default function Slide5() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #ff6b2b 0%, #a855f7 50%, transparent 80%)" }} />
      <div className="absolute top-[-5vh] right-[-5vw] w-[35vw] h-[35vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.1), transparent 70%)" }} />

      <div className="absolute left-[7vw] top-[5vh]">
        <span className="font-body text-primary/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          Funciones
        </span>
      </div>

      <div className="absolute inset-0 flex pt-[11vh] pb-[4vh] px-[7vw]">
        <div className="flex flex-col w-full">
          <h2 className="font-display font-black text-text mb-[3vh]" style={{ fontSize: "3.2vw" }}>
            Todo lo que necesitas para vender
          </h2>

          <div className="grid gap-[1.8vh]" style={{ gridTemplateColumns: "1fr 1fr 1fr", flex: 1 }}>
            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>W</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                WhatsApp Integrado
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                Conecta en segundos escaneando un QR. Sin APIs, sin codigo.
              </div>
            </div>

            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>AI</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                10 Motores de IA
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                GPT-4o, Claude, Gemini, Groq, DeepSeek. Fallbacks automaticos.
              </div>
            </div>

            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>$</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                Pagos sin friccion
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                MercadoPago, PayPal y transferencia. Links generados automaticamente.
              </div>
            </div>

            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>C</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                Catalogo inteligente
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                Fotos, precios y descripcion. El agente presenta productos al momento.
              </div>
            </div>

            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>D</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                Dashboard en vivo
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                Conversaciones, prospectos y metricas en tiempo real.
              </div>
            </div>

            <div className="rounded-[1.2vw] p-[1.8vw]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-[0.6vw] mb-[1.2vh] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #ec4899, #be185d)" }}>
                <span className="text-white font-display font-black" style={{ fontSize: "1.4vw" }}>E</span>
              </div>
              <div className="font-display font-bold text-text mb-[0.6vh]" style={{ fontSize: "1.8vw" }}>
                Embudo de ventas
              </div>
              <div className="font-body text-muted leading-relaxed" style={{ fontSize: "1.55vw" }}>
                Seguimiento de prospectos, etapas y conversiones. WooCommerce incluido.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
