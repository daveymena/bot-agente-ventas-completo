import React from 'react';
import { useNode } from '@craftjs/core';
import { useListProducts } from '@workspace/api-client-react';

export interface ProductListProps {
  columns: 2 | 3 | 4;
  showPrice: boolean;
  showImage: boolean;
  showDescription: boolean;
  maxItems: number;
  gap: number;
  padding: number;
  backgroundColor: string;
  borderRadius: number;
}

const defaultProps: ProductListProps = {
  columns: 3,
  showPrice: true,
  showImage: true,
  showDescription: true,
  maxItems: 12,
  gap: 20,
  padding: 40,
  backgroundColor: '#f9fafb',
  borderRadius: 12,
};

export const ProductListComponent = (props: Partial<ProductListProps>) => {
  const {
    connectors: { connect, drag },
    selected,
  } = useNode((node) => ({ selected: node.events.selected }));

  const { columns, showPrice, showImage, showDescription, maxItems, gap, padding, backgroundColor, borderRadius } = {
    ...defaultProps,
    ...props,
  };

  const { data: apiProducts, isLoading } = useListProducts();
  const products = (apiProducts?.slice(0, maxItems) || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: p.imageUrl || 'https://placehold.co/400x300?text=Producto',
    description: p.description || '',
  }));

  if (isLoading) {
    return (
      <div ref={(ref) => { if (ref) connect(drag(ref)); }} style={{ padding: '40px', textAlign: 'center', backgroundColor }}>
        Cargando productos...
      </div>
    );
  }

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: `${padding}px 20px`,
        backgroundColor,
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
      }}
    >
      <div
        className="product-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${gap}px`,
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        {products.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: '40px' }}>
            No hay productos disponibles
          </div>
        )}
        {products.map((product: any) => (
          <div
            key={product.id}
            style={{
              background: '#fff',
              borderRadius: `${borderRadius}px`,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.2s',
            }}
          >
            {showImage && (
              <div style={{ width: '100%', height: '200px', overflow: 'hidden' }}>
                <img
                  src={product.image}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}
            <div style={{ padding: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px 0', color: '#1a1a1a' }}>
                {product.name}
              </h3>
              {showDescription && product.description && (
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                  {product.description.substring(0, 100)}
                  {product.description.length > 100 ? '...' : ''}
                </p>
              )}
              {showPrice && (
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#059669', margin: 0 }}>
                  ${Number(product.price).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

ProductListComponent.craft = {
  displayName: 'Productos',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/ProductListSettings')),
  },
};
