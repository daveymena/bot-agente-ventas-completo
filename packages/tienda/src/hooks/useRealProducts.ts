import { useCallback, useEffect, useState } from 'react';

// Forma real que devuelve el backend (@workspace/api-zod), distinta a la
// interfaz `Product` local de useStore.ts (esa es solo para la demo/tienda
// de ejemplo -- productos con id string, sin persistencia real).
export interface RealProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  sku: string | null;
  categoryId: number | null;
  category: string | null;
  kind: 'digital' | 'physical';
  imageUrl: string | null;
  highlight: string | null;
  features: string[] | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  kind: 'digital' | 'physical';
}

/**
 * CRUD real de productos contra /api/products -- el mismo endpoint que usa
 * el dashboard de VentasPro y el bot de WhatsApp. Antes el editor de tienda
 * (packages/tienda) manejaba sus propios productos SOLO en el estado local
 * de zustand (persistido en localStorage del navegador), así que nada de lo
 * que se creaba/editaba ahí llegaba nunca a la base de datos real ni se
 * reflejaba en la tienda pública, el bot o el resto del panel.
 */
export function useRealProducts() {
  const [products, setProducts] = useState<RealProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar los productos');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Error cargando productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const createProduct = useCallback(async (input: ProductInput) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        price: String(input.price),
        currency: 'COP',
        imageUrl: input.imageUrl || undefined,
        kind: input.kind,
        isActive: true,
      }),
    });
    if (!res.ok) throw new Error('No se pudo crear el producto');
    await fetchProducts();
  }, [fetchProducts]);

  const updateProduct = useCallback(async (id: number, input: ProductInput) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        price: String(input.price),
        imageUrl: input.imageUrl || undefined,
        kind: input.kind,
      }),
    });
    if (!res.ok) throw new Error('No se pudo actualizar el producto');
    await fetchProducts();
  }, [fetchProducts]);

  const deleteProduct = useCallback(async (id: number) => {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('No se pudo eliminar el producto');
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  return { products, loading, error, refetch: fetchProducts, createProduct, updateProduct, deleteProduct };
}
