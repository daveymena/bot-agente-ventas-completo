import { departamentoDe } from './departamentos';

/** La línea explícita de la API manda; kind conserva compatibilidad. */
export function tipoDeOferta(p: { linea?: string | null; kind?: string | null; type?: string | null }): 'physical' | 'digital' | 'service' {
  const dep = departamentoDe(p.linea === 'fisico' ? 'physical' : p.linea || p.kind || p.type);
  return dep === 'servicio' ? 'service' : dep === 'fisico' ? 'physical' : 'digital';
}

export function experienciaDeCompra(p: Parameters<typeof tipoDeOferta>[0]) {
  const tipo = tipoDeOferta(p);
  if (tipo === 'service') return {
    tipo, accion: 'Solicitar información', etiqueta: 'Servicio',
    detalle: 'Consulta el alcance, la modalidad y la disponibilidad antes de contratar.',
    pasos: ['Describe lo que necesitas', 'Confirma alcance y presupuesto', 'Coordina la prestación del servicio'],
  };
  if (tipo === 'physical') return {
    tipo, accion: 'Comprar ahora', etiqueta: 'Producto físico',
    detalle: 'Consulta la cobertura, el costo de envío y las formas de pago para tu dirección.',
    pasos: ['Elige las opciones del producto', 'Completa los datos de entrega', 'Revisa las condiciones antes de confirmar'],
  };
  return {
    tipo, accion: 'Obtener acceso', etiqueta: 'Producto digital',
    detalle: 'Revisa qué incluye y cómo recibirás el acceso después de confirmar el pago.',
    pasos: ['Revisa el contenido incluido', 'Completa el pago', 'Recibe el acceso según las condiciones del producto'],
  };
}
