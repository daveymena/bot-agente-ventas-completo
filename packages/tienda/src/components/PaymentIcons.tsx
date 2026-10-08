// Badges de métodos de pago con el logo oficial de cada marca
// (public/marcas/). Antes eran un ícono genérico sobre el color de la marca;
// el dueño pidió los logos reales (08-10-2026): mostrar el logo de un medio de
// pago que la tienda acepta es lo que esperan ver los compradores.

// Vite reemplaza import.meta.env.BASE_URL al compilar ("/tienda/" en producción).
const BASE: string = (import.meta as any).env?.BASE_URL ?? '/tienda/';

/** Logo de una marca de public/marcas/, respetando la base de la tienda (/tienda/ en producción). */
export const LogoTienda = ({ archivo, className = 'w-4 h-4' }: { archivo: string; className?: string }) => (
  <img src={`${BASE}marcas/${archivo}`} alt="" aria-hidden="true"
    className={`shrink-0 object-contain${archivo.endsWith('.png') ? ' rounded-[22%]' : ''} ${className}`} />
);

const chip = 'inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-md bg-white text-slate-800 shadow-sm';

export const MercadoPagoBadge = () => (
  <span className={chip}>
    <LogoTienda archivo="mercadopago.png" />
    <span className="text-xs font-bold">Mercado Pago</span>
  </span>
);

export const NequiBadge = () => (
  <span className={chip}>
    <LogoTienda archivo="nequi.png" />
    <span className="text-xs font-bold">Nequi</span>
  </span>
);

// PSE no tiene un logo descargable libre: queda su escudo en su azul.
export const PSEBadge = () => (
  <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-md bg-white text-[#0f3cc9] shadow-sm">
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
    <span className="text-xs font-bold">PSE</span>
  </span>
);
