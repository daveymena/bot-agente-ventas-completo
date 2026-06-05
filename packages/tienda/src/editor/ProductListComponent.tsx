import React from 'react';
import { useNode } from '@craftjs/core';
import { useListProducts } from '@workspace/api-client-react';

export const ProductListComponent = () => {
  const {
    connectors: { connect, drag },
  } = useNode();

  const { data: apiProducts, isLoading } = useListProducts();
  const products = apiProducts?.map(p => ({
    id: p.id.toString(),
    name: p.name,
    price: Number(p.price),
    image: p.imageUrl || '',
    category: p.category?.toString() ?? 'General',
    type: p.kind,
    stock: 0,
  })) ?? [];

  if (isLoading) return <div>Loading…</div>;

  return (
    <div ref={ref => connect(drag(ref))} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map(p => (
        <div key={p.id} className="border p-2 rounded-lg">
          <img src={p.image} alt={p.name} className="w-full h-32 object-cover" />
          <h4 className="mt-2 font-bold">{p.name}</h4>
          <p>${p.price}</p>
        </div>
      ))}
    </div>
  );
};

ProductListComponent.craft = {
  displayName: 'Listado de Productos',
};