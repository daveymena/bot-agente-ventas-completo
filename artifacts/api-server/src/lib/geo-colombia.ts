/**
 * Departamentos y ciudades de Colombia para los formularios de pedido
 * (landings y tienda). Antes estaban copiados en renderer-v3.ts, renderer.ts y
 * la tienda (30-09-2026).
 *
 * La lista COMPLETA sale de Dropi (geografiaDeDropi, 1.475 ciudades): es la
 * que valida el despacho, así que lo que elige el cliente coincide exacto.
 * Esta de acá es solo el respaldo para negocios sin Dropi: ciudades
 * principales como sugerencia, sin impedir escribir otra.
 */
export const DEPARTAMENTOS_CO = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bogotá D.C.", "Bolívar",
  "Boyacá", "Caldas", "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó",
  "Córdoba", "Cundinamarca", "Guainía", "Guaviare", "Huila", "La Guajira",
  "Magdalena", "Meta", "Nariño", "Norte de Santander", "Putumayo", "Quindío",
  "Risaralda", "San Andrés y Providencia", "Santander", "Sucre", "Tolima",
  "Valle del Cauca", "Vaupés", "Vichada",
];

export const CIUDADES_POR_DEPARTAMENTO: Record<string, string[]> = {
  "Amazonas": ["Leticia", "Puerto Nariño"],
  "Antioquia": ["Medellín", "Bello", "Itagüí", "Envigado", "Apartadó", "Turbo", "Rionegro", "Sabaneta"],
  "Arauca": ["Arauca", "Tame"],
  "Atlántico": ["Barranquilla", "Soledad", "Malambo", "Sabanalarga", "Puerto Colombia"],
  "Bogotá D.C.": ["Bogotá D.C."],
  "Bolívar": ["Cartagena", "Magangué", "Turbaco"],
  "Boyacá": ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá"],
  "Caldas": ["Manizales", "Villamaría", "La Dorada"],
  "Caquetá": ["Florencia"],
  "Casanare": ["Yopal", "Aguazul"],
  "Cauca": ["Popayán", "Santander de Quilichao"],
  "Cesar": ["Valledupar", "Aguachica"],
  "Chocó": ["Quibdó", "Istmina"],
  "Córdoba": ["Montería", "Cereté", "Lorica", "Sahagún"],
  "Cundinamarca": ["Soacha", "Zipaquirá", "Facatativá", "Fusagasugá", "Chía", "Mosquera", "Madrid", "Girardot"],
  "Guainía": ["Inírida"],
  "Guaviare": ["San José del Guaviare"],
  "Huila": ["Neiva", "Pitalito", "Garzón"],
  "La Guajira": ["Riohacha", "Maicao"],
  "Magdalena": ["Santa Marta", "Ciénaga"],
  "Meta": ["Villavicencio", "Acacías", "Granada"],
  "Nariño": ["Pasto", "Tumaco", "Ipiales"],
  "Norte de Santander": ["Cúcuta", "Ocaña", "Villa del Rosario", "Los Patios"],
  "Putumayo": ["Mocoa", "Puerto Asís"],
  "Quindío": ["Armenia", "Calarcá"],
  "Risaralda": ["Pereira", "Dosquebradas", "Santa Rosa de Cabal"],
  "San Andrés y Providencia": ["San Andrés"],
  "Santander": ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja"],
  "Sucre": ["Sincelejo", "Corozal"],
  "Tolima": ["Ibagué", "Espinal", "Melgar"],
  "Valle del Cauca": ["Cali", "Palmira", "Tuluá", "Buenaventura", "Buga", "Cartago", "Jamundí", "Yumbo"],
  "Vaupés": ["Mitú"],
  "Vichada": ["Puerto Carreño"],
};

/** <option>s del selector de departamento (respaldo; el script los cambia por los de Dropi). */
export function opcionesDeDepartamento(esc: (s: string) => string): string {
  return `<option value="">Selecciona tu departamento…</option>${DEPARTAMENTOS_CO.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}`;
}

/**
 * Script del formulario de pedido (landing PRO, v3 y v1).
 *
 *  1. Sugerencias de ciudad del respaldo en el <datalist id="ciudades-datalist">.
 *  2. Pide /geo (las ciudades de Dropi del negocio). Si responde: el
 *     departamento pasa a los nombres de Dropi y la ciudad a un <select> con
 *     TODAS las ciudades de ese departamento. El input `ciudad` original queda
 *     oculto y recibe el valor (lo leen el envío del pedido y el selector de
 *     transportadora, que escucha su "change").
 */
export const SCRIPT_GEO = `(function(){
var f=document.querySelector('form[action$="/pedido"]');if(!f)return;
var d=f.querySelector('[name=departamento]'),c=f.querySelector('[name=ciudad]');if(!d||!c)return;
var M=${JSON.stringify(CIUDADES_POR_DEPARTAMENTO)};var dl=document.getElementById('ciudades-datalist');
function sug(){if(!dl)return;var a=M[d.value]||[];dl.innerHTML=a.map(function(x){return '<option value="'+x+'">'}).join('');}
d.addEventListener('change',sug);sug();
var url=f.getAttribute('action').replace(/\\/pedido$/,'/geo');if(!/\\/geo$/.test(url))return;
function n(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\\s+/g,' ').trim();}
function t(s){return String(s||'').toLowerCase().replace(/(^|\\s|\\()\\S/g,function(m){return m.toUpperCase();});}
function e(s){return String(s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
fetch(url).then(function(r){return r.json();}).then(function(j){
if(!j||!j.ok||!j.departamentos||!j.departamentos.length)return;
var G={};j.departamentos.forEach(function(x){G[x.nombre]=x.ciudades;});
var antes=n(d.value);
d.innerHTML='<option value="">Selecciona tu departamento…</option>'+j.departamentos.map(function(x){return '<option value="'+e(x.nombre)+'">'+e(t(x.nombre))+'</option>';}).join('');
if(antes){j.departamentos.forEach(function(x){if(n(x.nombre)===antes)d.value=x.nombre;});}
var s=document.createElement('select');s.required=true;s.className=c.className;s.setAttribute('aria-label','Ciudad');
c.type='hidden';c.required=false;c.removeAttribute('list');c.parentNode.insertBefore(s,c);
function llenar(){var a=G[d.value]||[];s.innerHTML='<option value="">'+(d.value?'Selecciona tu ciudad…':'Elige primero el departamento')+'</option>'+a.map(function(x){return '<option value="'+e(x)+'">'+e(t(x))+'</option>';}).join('');s.disabled=!a.length;c.value='';}
s.addEventListener('change',function(){c.value=s.value;c.dispatchEvent(new Event('change',{bubbles:true}));});
d.addEventListener('change',llenar);llenar();
}).catch(function(){});
})();`;
