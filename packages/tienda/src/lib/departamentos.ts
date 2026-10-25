/**
 * Departamentos de la tienda: lo que NUNCA se mezcla en una misma vitrina.
 *
 * Una tienda puede vender cursos, productos que se despachan y servicios.
 * Para el comprador son compras distintas (uno se descarga, otro llega a la
 * puerta, otro se agenda), así que cada uno tiene su propio carrusel, sus
 * propias categorías y su propia pestaña en el catálogo. Es la misma
 * separación que usan las tiendas grandes: Amazon tiene los contenidos
 * digitales en departamentos aparte, y Shopify arma colecciones separadas
 * con su entrada en el menú.
 *
 * Dropshipping y stock propio van juntos en "Productos físicos": para el
 * cliente los dos se despachan igual. La diferencia (quién despacha) es de
 * la operación, y la API la manda aparte en `linea`.
 */
export type Departamento = 'fisico' | 'digital' | 'servicio';

export const DEPARTAMENTOS: Record<Departamento, { nombre: string; corto: string; bajada: string }> = {
  fisico: { nombre: 'Productos físicos', corto: 'Productos', bajada: 'Te llegan a la puerta de tu casa.' },
  digital: { nombre: 'Cursos y digitales', corto: 'Cursos y digitales', bajada: 'Contenido, recursos y acceso digital.' },
  servicio: { nombre: 'Servicios', corto: 'Servicios', bajada: 'Agenda por WhatsApp.' },
};

export const ORDEN_DEPARTAMENTOS: Departamento[] = ['fisico', 'digital', 'servicio'];

/** A qué departamento pertenece un producto o una categoría, por su tipo. */
export function departamentoDe(tipo: string | null | undefined): Departamento {
  const t = String(tipo || 'digital');
  if (t === 'physical' || t === 'dropshipping') return 'fisico';
  if (t === 'servicio' || t === 'service') return 'servicio';
  return 'digital';
}

export function esDepartamento(v: string | null | undefined): v is Departamento {
  return v === 'fisico' || v === 'digital' || v === 'servicio';
}
