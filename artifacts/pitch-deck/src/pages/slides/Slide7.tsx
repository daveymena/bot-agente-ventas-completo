export default function Slide7() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #a855f7 0%, #ff6b2b 50%, transparent 80%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 50% 40% at 50% 30%, rgba(168,85,247,0.06), transparent 70%)" }} />

      <div className="absolute left-[7vw] top-[7vh]">
        <span className="font-body text-purple/70 tracking-[0.2em] uppercase" style={{ fontSize: "1.3vw" }}>
          Planes y Precios
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col justify-center px-[6vw] pt-[10vh] pb-[4vh]">
        <h2 className="font-display font-black text-text mb-[4vh]" style={{ fontSize: "3.5vw" }}>
          Elige el plan que se adapta a tu negocio
        </h2>

        <div className="flex gap-[2vw] flex-1 items-stretch">
          <div className="flex-1 rounded-[1.5vw] p-[2.5vw] flex flex-col"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="font-display font-bold text-text mb-[1.5vh]" style={{ fontSize: "2.2vw" }}>Basico</div>
            <div className="flex items-end gap-[0.3vw] mb-[0.5vh]">
              <span className="font-display font-black text-text" style={{ fontSize: "5vw" }}>$29</span>
              <span className="font-body text-muted mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>/mes USD</span>
            </div>
            <div className="font-body text-accent mb-[2.5vh]" style={{ fontSize: "1.5vw" }}>7 dias gratis</div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>1 agente IA</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>500 mensajes/mes</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>MercadoPago + PayPal</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Dashboard basico</span>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-[1.5vw] p-[2.5vw] flex flex-col relative"
            style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(255,107,43,0.08))",
              border: "1.5px solid rgba(168,85,247,0.4)", transform: "scale(1.03)" }}>
            <div className="absolute top-[-1.5vh] left-[50%] translate-x-[-50%] rounded-full px-[1.5vw] py-[0.4vh]"
              style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}>
              <span className="font-body font-bold text-white" style={{ fontSize: "1.2vw" }}>MAS POPULAR</span>
            </div>
            <div className="font-display font-bold text-text mb-[1.5vh]" style={{ fontSize: "2.2vw" }}>Profesional</div>
            <div className="flex items-end gap-[0.3vw] mb-[0.5vh]">
              <span className="font-display font-black text-text" style={{ fontSize: "5vw" }}>$79</span>
              <span className="font-body text-muted mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>/mes USD</span>
            </div>
            <div className="font-body text-accent mb-[2.5vh]" style={{ fontSize: "1.5vw" }}>7 dias gratis</div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-text" style={{ fontSize: "1.6vw" }}>3 agentes IA</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-text" style={{ fontSize: "1.6vw" }}>Mensajes ilimitados</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-text" style={{ fontSize: "1.6vw" }}>Analytics avanzado</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-text" style={{ fontSize: "1.6vw" }}>10 motores de IA</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-text" style={{ fontSize: "1.6vw" }}>WooCommerce sync</span>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-[1.5vw] p-[2.5vw] flex flex-col"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="font-display font-bold text-text mb-[1.5vh]" style={{ fontSize: "2.2vw" }}>Empresarial</div>
            <div className="flex items-end gap-[0.3vw] mb-[0.5vh]">
              <span className="font-display font-black text-text" style={{ fontSize: "5vw" }}>$199</span>
              <span className="font-body text-muted mb-[0.8vh]" style={{ fontSize: "1.6vw" }}>/mes USD</span>
            </div>
            <div className="font-body text-accent mb-[2.5vh]" style={{ fontSize: "1.5vw" }}>7 dias gratis</div>
            <div className="flex flex-col gap-[1.2vh] flex-1">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Agentes ilimitados</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Multi-tenant</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>API completo</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold" style={{ fontSize: "0.8vw" }}>✓</span>
                </div>
                <span className="font-body text-muted" style={{ fontSize: "1.6vw" }}>Onboarding dedicado</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
