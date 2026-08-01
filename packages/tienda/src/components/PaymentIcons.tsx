// Badges de métodos de pago con el color e ícono real de cada marca -- antes
// eran solo texto gris plano ("MercadoPago", "Nequi", "PSE" sin ningún
// distintivo visual), lo que los hacía ilegibles como method de pago real.
// Cada uno usa el color oficial de marca + un ícono representativo de su
// símbolo (no el logotipo con su tipografía exacta, que es un asset de marca
// registrado) para que se lean como badges de confianza reconocibles.

export const MercadoPagoBadge = () => (
  <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-md bg-[#00b1ea] text-white">
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
    <span className="text-xs font-bold">Mercado Pago</span>
  </span>
);

export const NequiBadge = () => (
  <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-md bg-[#da1884] text-white">
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 2 3 12l9 10 9-10-9-10Z" />
    </svg>
    <span className="text-xs font-bold">Nequi</span>
  </span>
);

export const PSEBadge = () => (
  <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-md bg-[#0f3cc9] text-white">
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
    <span className="text-xs font-bold">PSE</span>
  </span>
);
