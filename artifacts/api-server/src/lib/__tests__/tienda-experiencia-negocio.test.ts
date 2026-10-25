import { describe, it, expect, afterEach } from 'vitest';
import { experienciaDeCompra, tipoDeOferta } from '../../../../../packages/tienda/src/lib/experiencia-de-compra';
import { useStore } from '../../../../../packages/tienda/src/store/useStore';

afterEach(() => useStore.setState({ cart: [] }));

describe('el recorrido de compra depende de la oferta', () => {
  it('la línea explícita del servidor prevalece sobre un kind antiguo', () => {
    expect(tipoDeOferta({ linea: 'servicio', kind: 'digital' })).toBe('service');
    expect(tipoDeOferta({ linea: 'fisico' })).toBe('physical');
    expect(tipoDeOferta({ linea: 'dropshipping', kind: 'physical' })).toBe('physical');
    expect(tipoDeOferta({ kind: 'service' })).toBe('service');
    expect(tipoDeOferta({ kind: 'servicio' })).toBe('service');
    expect(tipoDeOferta({ kind: 'digital' })).toBe('digital');
  });

  it('un servicio solicita información y nunca entra al carrito como descarga', () => {
    const servicio = { id:'7', name:'Asesoría', description:'Consulta', price:100, image:'', category:'Servicios', type:'service' as const, stock:1 };
    expect(experienciaDeCompra(servicio).accion).toBe('Solicitar información');
    useStore.getState().addToCart(servicio);
    useStore.getState().addToCart({ ...servicio, type:'servicio' });
    expect(useStore.getState().cart).toEqual([]);
  });

  it('el acceso digital no se duplica y el físico conserva cantidades', () => {
    const base = { id:'1', name:'Recurso', description:'', price:50, image:'', category:'General', stock:10 };
    useStore.getState().addToCart({ ...base, type:'digital' });
    useStore.getState().addToCart({ ...base, type:'digital' });
    useStore.getState().addToCart({ ...base, id:'2', type:'physical' });
    useStore.getState().addToCart({ ...base, id:'2', type:'physical' });
    expect(useStore.getState().cart.map(p => p.quantity)).toEqual([1, 2]);
    expect(experienciaDeCompra({ type:'digital' }).accion).toBe('Obtener acceso');
    expect(experienciaDeCompra({ type:'physical' }).detalle).toContain('costo de envío');
  });
});
