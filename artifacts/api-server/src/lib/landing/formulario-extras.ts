/**
 * Lo que se le agrega a CUALQUIER formulario de pedido al servir la landing
 * (renderer-cod, renderer-estilo, renderer-v3 y el HTML guardado): las
 * landings salen de cuatro motores y cada uno arma su formulario a su modo,
 * así que en vez de tocar los cuatro se completa el formulario en la página,
 * igual que `puente-edicion.ts` marca las secciones en el editor.
 *
 *   1. Campo trampa `sitio_web` (siempre): invisible para una persona.
 *   2. Upsell: una casilla "agrégalo" con el precio que fijó el dueño.
 *   3. Downsell: si no marcó el upsell, al enviar se le ofrece UNA vez el
 *      precio menor. Elija lo que elija, el pedido sale.
 *   4. Verificación: si el servidor contesta `verificar`, se va a la página
 *      del código aunque el motor de esa landing no sepa de ella.
 *
 * El campo que viaja es un `<input type=hidden name=extra>`: la casilla no
 * tiene name porque renderer-estilo junta todos los `input[name]` sin mirar
 * si están marcados, y una casilla sin marcar mandaría "upsell" igual.
 */
import type { ConfigPedido } from "./pedido-seguro";

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const CSS = `<style id="vp-extras">
.vp-trampa{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}
.vp-up{display:flex;gap:12px;align-items:center;border:2px dashed var(--acc,var(--accent,#4f46e5));border-radius:14px;padding:12px 14px;margin:10px 0;cursor:pointer;background:#fff;text-align:left}
.vp-up:has(input:checked){border-style:solid;background:color-mix(in srgb,var(--acc,var(--accent,#4f46e5)) 7%,white)}
.vp-up input{width:22px;height:22px;flex:none;accent-color:var(--acc,var(--accent,#4f46e5))}
.vp-up span{flex:1;font-weight:600;line-height:1.35}.vp-up small{display:block;font-weight:500;color:#525252;font-size:13px}
.vp-up b{white-space:nowrap;font-variant-numeric:tabular-nums}
.vp-down{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}
.vp-down-in{background:#fff;color:#171717;width:100%;max-width:440px;border-radius:22px 22px 0 0;padding:24px 20px calc(20px + env(safe-area-inset-bottom,0px));text-align:center;font-family:inherit;animation:vp-sube .22s ease}
@media (min-width:640px){.vp-down{align-items:center}.vp-down-in{border-radius:22px}}
@keyframes vp-sube{from{transform:translateY(30px);opacity:.5}to{transform:none;opacity:1}}
.vp-down-in h3{font-size:20px;margin:0 0 6px}.vp-down-in p{margin:0 0 18px;color:#525252}
.vp-down-in button{display:block;width:100%;border:0;border-radius:14px;padding:15px;font:inherit;font-weight:700;font-size:16px;cursor:pointer}
.vp-si{background:var(--acc,var(--accent,#4f46e5));color:#fff;margin-bottom:8px}.vp-no{background:transparent;color:#525252}
.vp-down-in button:focus-visible{outline:3px solid #171717;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.vp-down-in{animation:none}}
</style>`;

/** Script + estilos a inyectar. Vacío si no hay formulario de pedido en la página. */
export function extrasDelFormulario(html: string, cfg: ConfigPedido): string {
  const h = String(html || "");
  if (!/<form\b[^>]*action=["'][^"']*\/pedido["']/i.test(h) || h.includes('id="vp-extras"')) return h;
  const datos = {
    up: cfg.upsell ? { t: cfg.upsell.titulo, p: pesos(cfg.upsell.precio) } : null,
    down: cfg.upsell && cfg.downsell ? { t: cfg.downsell.titulo, p: pesos(cfg.downsell.precio) } : null,
  };
  // JSON dentro de <script>: se escapa "<" para que un título no cierre la etiqueta.
  const json = JSON.stringify(datos).replace(/</g, "\\u003c");
  const script = `<script>(function(){var C=${json};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var F=window.fetch;if(F&&!F.__vp){var nf=function(u,o){return F.apply(this,arguments).then(function(r){try{var url=String(u&&u.url||u);if(/\\/pedido(\\?|$)/.test(url)){r.clone().json().then(function(j){if(j&&j.ok&&j.verificar&&j.gracias)location.href=j.gracias}).catch(function(){})}}catch(e){}return r})};nf.__vp=1;window.fetch=nf}
[].forEach.call(document.querySelectorAll('form[action*="/pedido"]'),function(f){if(f.__vpx)return;f.__vpx=1;
var tr=document.createElement('div');tr.className='vp-trampa';tr.setAttribute('aria-hidden','true');tr.innerHTML='<label>No llenar<input name="sitio_web" tabindex="-1" autocomplete="off"></label>';f.appendChild(tr);
if(!C.up)return;var ex=document.createElement('input');ex.type='hidden';ex.name='extra';ex.value='';f.appendChild(ex);
var box=document.createElement('label');box.className='vp-up';box.innerHTML='<input type="checkbox"><span>'+esc(C.up.t)+'<small>Se suma a tu pedido</small></span><b>+'+esc(C.up.p)+'</b>';
var ck=box.querySelector('input');ck.addEventListener('change',function(){ex.value=ck.checked?'upsell':''});
var btn=f.querySelector('button[type="submit"],button:not([type]),input[type="submit"]');if(btn&&btn.parentNode)btn.parentNode.insertBefore(box,btn);else f.appendChild(box);
if(!C.down)return;var ofrecido=false;
f.addEventListener('submit',function(e){if(ofrecido||ex.value)return;if(!f.checkValidity||!f.checkValidity())return;e.preventDefault();e.stopImmediatePropagation();ofrecido=true;
var m=document.createElement('div');m.className='vp-down';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby','vp-down-t');
m.innerHTML='<div class="vp-down-in"><h3 id="vp-down-t">'+esc(C.down.t)+'</h3><p>Solo por '+esc(C.down.p)+' más.</p><button type="button" class="vp-si">Agregar por '+esc(C.down.p)+'</button><button type="button" class="vp-no">No, gracias</button></div>';
document.body.appendChild(m);var si=m.querySelector('.vp-si');si.focus();
function seguir(v){ex.value=v;m.remove();if(f.requestSubmit)f.requestSubmit(btn&&btn.form===f?btn:undefined);else f.submit()}
si.onclick=function(){seguir('downsell')};m.querySelector('.vp-no').onclick=function(){seguir('')};
m.addEventListener('keydown',function(k){if(k.key==='Escape')seguir('')})},true)})})();</script>`;
  const bloque = CSS + script;
  return /<\/body>/i.test(h) ? h.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${bloque}</body>`) : h + bloque;
}
