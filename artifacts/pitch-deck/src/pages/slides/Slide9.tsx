export default function Slide9() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-[-10vh] left-[-5vw] w-[60vw] h-[60vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,107,43,0.2), transparent 70%)" }} />
      <div className="absolute bottom-[-5vh] right-[-5vw] w-[45vw] h-[45vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.15), transparent 70%)" }} />
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #ff6b2b 0%, #a855f7 50%, transparent 80%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[14vw] py-[6vh]">
        <div className="flex items-center gap-[1.2vw] mb-[3.5vh]">
          <div className="w-[3.8vw] h-[3.8vw] rounded-[0.9vw] flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)" }}>
            <span className="text-white font-black" style={{ fontSize: "2.1vw" }}>V</span>
          </div>
          <span className="text-white/60 font-display tracking-[0.25em] uppercase" style={{ fontSize: "1.3vw" }}>
            VentasPro
          </span>
        </div>

        <h2 className="font-display font-black text-text leading-[1.1] tracking-tighter mb-[1.5vh]"
          style={{ fontSize: "5vw", textWrap: "balance" }}>
          Empieza hoy.
        </h2>
        <h2 className="font-display font-black text-primary leading-[1.1] tracking-tighter mb-[3.5vh]"
          style={{ fontSize: "5vw", textWrap: "balance" }}>
          7 dias gratis, sin tarjeta.
        </h2>

        <p className="font-body text-muted leading-relaxed mb-[4.5vh]" style={{ fontSize: "1.9vw", maxWidth: "50vw" }}>
          Unete a cientos de negocios que ya automatizan sus ventas por WhatsApp con Sofia, el agente IA de VentasPro.
        </p>

        <div className="flex gap-[4vw] mb-[4.5vh]">
          <div className="flex flex-col items-center">
            <div className="font-display font-black text-primary" style={{ fontSize: "3.2vw" }}>3x</div>
            <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>mas ventas</div>
          </div>
          <div style={{ width: "0.15vw", background: "rgba(255,255,255,0.12)" }} />
          <div className="flex flex-col items-center">
            <div className="font-display font-black text-accent" style={{ fontSize: "3.2vw" }}>24/7</div>
            <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>sin parar</div>
          </div>
          <div style={{ width: "0.15vw", background: "rgba(255,255,255,0.12)" }} />
          <div className="flex flex-col items-center">
            <div className="font-display font-black text-text" style={{ fontSize: "3.2vw" }}>$0</div>
            <div className="font-body text-muted" style={{ fontSize: "1.6vw" }}>para empezar</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-[1.2vh]">
          <div className="font-body text-muted" style={{ fontSize: "1.7vw" }}>
            Contacto: daveymena16@gmail.com
          </div>
          <div className="font-body text-muted" style={{ fontSize: "1.7vw" }}>
            WhatsApp: +57 313 617 4267
          </div>
          <div className="h-[0.2vh] w-[8vw] mt-[1.5vh]" style={{ background: "rgba(255,107,43,0.4)" }} />
        </div>
      </div>
    </div>
  );
}
