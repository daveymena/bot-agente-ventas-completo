import { ShieldCheck, Truck, Zap, MessageCircle } from 'lucide-react';
import { useStore } from '../store/useStore';

/**
 * Barra de garantías del kit Urbanisty.
 *
 * El kit la pone en dos sitios: bajo el héroe del catálogo y al pie de la ficha
 * de producto. Vive en un componente y no copiada en cada página porque ese
 * copiar-pegar es justo lo que dejó a Home.tsx con una tarjeta de producto
 * distinta a la de Shop.tsx durante meses (estrellas inventadas y precios sin
 * convertir de moneda incluidos).
 *
 * El kit trae "Free Shipping" y "Up to 75% Off" fijos. Acá cada garantía se
 * muestra SOLO si es cierta para lo que se está viendo: prometer un envío que
 * no existe genera reclamos y disputas de pago, y en Colombia cae bajo el
 * Estatuto del Consumidor.
 */
const TrustBar = ({
  hayFisicos,
  hayDigitales,
  className = '',
}: {
  hayFisicos: boolean;
  hayDigitales: boolean;
  className?: string;
}) => {
  const { config } = useStore();

  const garantias = [
    { icon: ShieldCheck, titulo: 'Pago seguro', detalle: 'Pasarelas oficiales', mostrar: true },
    { icon: Truck, titulo: 'Envío a todo el país', detalle: 'Pagas al recibir', mostrar: hayFisicos },
    { icon: Zap, titulo: 'Entrega inmediata', detalle: 'Sin esperas ni envíos', mostrar: hayDigitales },
    { icon: MessageCircle, titulo: 'Te atendemos', detalle: 'Escríbenos por WhatsApp', mostrar: Boolean(config.whatsappPhone) },
  ].filter(g => g.mostrar);

  if (garantias.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 ${className}`}>
      {garantias.map(g => (
        <div key={g.titulo} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
          <div className="w-10 h-10 flex-shrink-0 rounded-full bg-[var(--store-primary-soft)] flex items-center justify-center">
            <g.icon className="w-5 h-5 text-[var(--store-primary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-gray-900 leading-tight truncate">{g.titulo}</p>
            <p className="text-[11px] text-gray-500 leading-tight truncate">{g.detalle}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TrustBar;
