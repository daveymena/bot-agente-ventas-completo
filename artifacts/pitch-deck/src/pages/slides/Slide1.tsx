export default function Slide1() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-display">
      <div className="absolute top-[-10vh] left-[-5vw] w-[55vw] h-[55vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,107,43,0.22), transparent 70%)" }} />
      <div className="absolute bottom-[-5vh] right-[25vw] w-[35vw] h-[35vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.12), transparent 70%)" }} />
      <div className="absolute top-0 left-0 right-0 h-[0.3vh]"
        style={{ background: "linear-gradient(90deg, #ff6b2b 0%, transparent 60%)" }} />

      <div className="absolute inset-0 flex">
        <div className="flex flex-col justify-center pl-[7vw] pr-[4vw] w-[54vw]">
          <div className="flex items-center gap-[1.2vw] mb-[5vh]">
            <div className="w-[3.8vw] h-[3.8vw] rounded-[0.9vw] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)" }}>
              <span className="text-white font-black" style={{ fontSize: "2.1vw" }}>V</span>
            </div>
            <span className="text-white/70 font-display tracking-[0.25em] uppercase"
              style={{ fontSize: "1.3vw" }}>VentasPro</span>
          </div>

          <h1 className="font-display font-black text-text leading-[1] tracking-tighter"
            style={{ fontSize: "6.8vw", textWrap: "balance" }}>
            Tu vendedor
          </h1>
          <h1 className="font-display font-black text-primary leading-[1] tracking-tighter"
            style={{ fontSize: "6.8vw", textWrap: "balance" }}>
            trabaja 24/7.
          </h1>
          <p className="font-body text-muted mt-[2.5vh] leading-relaxed max-w-[40vw]"
            style={{ fontSize: "2vw" }}>
            Automatiza tus ventas por WhatsApp con inteligencia artificial. Configura una vez, vende para siempre.
          </p>

          <div className="flex items-center gap-[1.5vw] mt-[5vh]">
            <div className="h-[0.25vh] w-[3.5vw] bg-primary" />
            <span className="font-body text-text/35 tracking-[0.18em] uppercase"
              style={{ fontSize: "1.4vw" }}>Bot de Ventas IA para WhatsApp</span>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 pr-[6vw]">
          <div className="w-[25vw] rounded-[2vw] overflow-hidden flex flex-col"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", height: "68vh" }}>
            <div className="flex items-center gap-[1vw] px-[1.8vw] py-[1.5vh]"
              style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="w-[2.8vw] h-[2.8vw] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #ff6b2b, #ff9f0a)" }}>
                <span className="text-white font-black" style={{ fontSize: "1.3vw" }}>S</span>
              </div>
              <div>
                <div className="text-white font-display font-bold" style={{ fontSize: "1.3vw" }}>Sofia · VentasPro</div>
                <div className="text-accent font-body" style={{ fontSize: "1vw" }}>en linea ahora</div>
              </div>
            </div>

            <div className="flex flex-col gap-[1.2vh] px-[1.5vw] py-[1.5vh] flex-1 justify-end">
              <div className="self-end rounded-[0.8vw] px-[1.2vw] py-[0.7vh] text-white font-body"
                style={{ fontSize: "1.2vw", background: "#005c4b", maxWidth: "75%" }}>
                Tienen el iPhone 15 Pro?
              </div>
              <div className="self-start rounded-[0.8vw] px-[1.2vw] py-[0.7vh] text-white/90 font-body"
                style={{ fontSize: "1.2vw", background: "rgba(255,255,255,0.07)", maxWidth: "80%" }}>
                Hola! Si, tenemos stock. Te lo muestro
              </div>
              <div className="self-start rounded-[0.8vw] px-[1.2vw] py-[1vh]"
                style={{ background: "rgba(255,255,255,0.07)", maxWidth: "80%" }}>
                <div className="text-white/50 font-body" style={{ fontSize: "1vw" }}>iPhone 15 Pro 256GB</div>
                <div className="text-primary font-display font-bold" style={{ fontSize: "1.5vw" }}>$4.299.000 COP</div>
              </div>
              <div className="self-start rounded-[0.8vw] px-[1.2vw] py-[0.7vh] text-white/90 font-body"
                style={{ fontSize: "1.2vw", background: "rgba(255,255,255,0.07)", maxWidth: "85%" }}>
                Aqui tu link seguro: pago.link/vp-15pro
              </div>
              <div className="self-center rounded-[0.8vw] px-[1.5vw] py-[0.7vh] text-white font-display font-bold"
                style={{ fontSize: "1.2vw", background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                Venta cerrada ✓
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
