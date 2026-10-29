/**
 * DIOS — Video Render Dios
 * Reemplaza htmlDeEscena simple por un render promocional real.
 * Producto se ve como en anuncio de agencia: packshot flotante con sombra + fondo lifestyle difuminado, no diapositiva.
 * Si DIOS!=1, el llamador debe usar htmlDeEscena original.
 */
export interface EscenaDiosRender {
  texto: string;
  locucion: string;
  visual: "producto"|"broll";
  busqueda?: string;
  duracion: number;
}
export interface CtxDios {
  foto: string | null; // dataURL del producto recortado (L1)
  fondoLifestyle?: string | null; // dataURL del L2 lifestyle para fondo (si hay)
  color: string;
  marca: string;
  precio: string;
  cta: string;
  modelo: string;
  destino: "web"|"whatsapp";
}

const ANCHO=1080, ALTO=1920;

function esc(s:string){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

export function htmlDeEscenaDios(e: EscenaDiosRender, i:number, total:number, ctx: CtxDios): string {
  const rol = i===total-1 ? "cierre" : i===0 ? "gancho" : (/\$\s?\d/.test(e.texto) || i===total-2) ? "precio" : "producto";
  const fisico = ctx.modelo==="fisico";
  const fondo = ctx.fondoLifestyle || ctx.foto;
  const tieneFoto = !!ctx.foto && e.visual==="producto";
  const tam = rol==="gancho" ? 108 : e.texto.length>32 ? 72 : 88;
  // paleta premium
  const colorAcento = ctx.color || "#0F766E";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&family=Outfit:wght@800&display=swap');
  html,body{margin:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;background:#060612;font-family:'Outfit','Inter',Arial,sans-serif;color:#fff}
  .stage{position:absolute;inset:0;overflow:hidden}
  .bg{position:absolute;inset:-60px;background:${fondo?`url('${fondo}') center/cover no-repeat`:'#0B0B14'};filter:blur(${tieneFoto?38:0}px) brightness(.62) saturate(1.15);transform:scale(1.04)}
  .grad{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.38) 0%,rgba(0,0,0,0) 18%,rgba(0,0,0,0) 55%,rgba(0,0,0,.92) 100%)}
  .halo{position:absolute;left:50%;top:${rol==="gancho"?52:42}%;width:860px;height:860px;transform:translate(-50%,-50%);background:radial-gradient(ellipse at center, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 68%);filter:blur(2px)}
  .pack{position:absolute;left:0;right:0;top:${rol==="gancho"?530:320}px;height:${rol==="cierre"?900:1100}px;display:flex;align-items:center;justify-content:center}
  .pack img{width:92%;height:92%;object-fit:contain;filter:drop-shadow(0 42px 80px rgba(0,0,0,.55)) drop-shadow(0 8px 24px rgba(0,0,0,.35));transform:${rol==="precio"?"rotate(-2deg)":"rotate(0deg)"};}
  .pack::after{content:"";position:absolute;bottom:44px;left:50%;width:620px;height:120px;transform:translateX(-50%);background:radial-gradient(ellipse at center, rgba(0,0,0,.45) 0%, transparent 70%);filter:blur(18px);opacity:.9}
  .marca{position:absolute;top:56px;left:48px;right:48px;display:flex;align-items:center;gap:14px;font-size:26px;font-weight:900;letter-spacing:2.2px;opacity:.92}
  .marca i{width:38px;height:38px;border-radius:10px;background:${colorAcento};display:inline-block;box-shadow:0 6px 18px rgba(0,0,0,.35)}
  .badge{position:absolute;top:56px;right:48px;background:#FFD60A;color:#111;font-weight:900;font-size:26px;padding:10px 18px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .texto{position:absolute;left:44px;right:44px;${rol==="gancho"?"top:132px":"bottom:360px"};text-align:center;line-height:1.06;font-weight:900;font-size:${tam}px;text-wrap:balance;letter-spacing:-1.2px}
  .texto span{display:inline;background:${rol==="gancho"?"#FFD60A":colorAcento};color:${rol==="gancho"?"#111":"#fff"};padding:10px 22px;border-radius:16px;box-decoration-break:clone;-webkit-box-decoration-break:clone;box-shadow:0 18px 40px rgba(0,0,0,.35)}
  .sub{position:absolute;left:44px;right:44px;bottom:280px;text-align:center;font-size:38px;font-weight:800;opacity:.96;text-shadow:0 6px 22px rgba(0,0,0,.65)}
  .sello{position:absolute;right:56px;top:${rol==="precio"?980:1080}px;width:360px;height:360px;border-radius:50%;background:#FFD60A;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-9deg);box-shadow:0 28px 70px rgba(0,0,0,.45);border:8px solid rgba(255,255,255,.9)}
  .sello b{font-size:78px;line-height:1;letter-spacing:-2px}.sello small{font-size:28px;margin-top:4px;font-weight:800;opacity:.9}
  .sello::after{content:"OFERTA";position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#111;color:#FFD60A;font-size:22px;font-weight:900;padding:6px 16px;border-radius:999px;letter-spacing:1.2px}
  .cinta{position:absolute;left:0;right:0;bottom:176px;display:flex;justify-content:center}
  .cinta span{background:#fff;color:#111;font-size:34px;font-weight:900;padding:16px 32px;border-radius:999px;box-shadow:0 16px 40px rgba(0,0,0,.35)}
  .cta{position:absolute;left:48px;right:48px;bottom:92px;padding:38px 18px;border-radius:999px;text-align:center;font-size:56px;font-weight:900;letter-spacing:-1px;box-shadow:0 22px 60px rgba(0,0,0,.45)}
  .cta.wa{background:#25D366;color:#fff}.cta.web{background:#FFD60A;color:#111}
  .cta small{display:block;font-size:28px;font-weight:800;opacity:.92;margin-top:6px;letter-spacing:.6px}
  .progress{position:absolute;left:0;right:0;bottom:0;height:8px;background:rgba(255,255,255,.18)}
  .progress i{position:absolute;left:0;top:0;bottom:0;width:${Math.round(((i+1)/total)*100)}%;background:${colorAcento};box-shadow:0 0 18px ${colorAcento}}
  </style></head><body><div class="stage">
  <div class="bg"></div><div class="grad"></div>
  ${tieneFoto?`<div class="halo"></div><div class="pack"><img src="${ctx.foto}"></div>`:""}
  <div class="marca"><i></i> ${esc(ctx.marca||"VENTASPRO")}</div>
  ${fisico && rol!=="cierre"?`<div class="badge">PAGO CONTRAENTREGA</div>`:""}
  <div class="texto"><span>${esc(e.texto)}</span></div>
  ${rol==="gancho" && fisico?`<div class="sub">📦 Llega a tu casa · Pagas al recibir</div>`:""}
  ${rol==="precio"?`<div class="sello"><b>${esc(ctx.precio)}</b><small>pagas al recibir</small></div>`:""}
  ${rol==="precio"&&fisico?`<div class="cinta"><span>🚚 Envío a toda Colombia · 2 a 4 días</span></div>`:""}
  ${rol==="cierre"?`<div class="cta ${ctx.destino==="web"?"web":"wa"}">${esc(ctx.cta)}<small>${fisico?"Toca el botón y te lo apartamos":"Acceso inmediato"}</small></div>`:""}
  <div class="progress"><i></i></div>
  </div></body></html>`;
}
