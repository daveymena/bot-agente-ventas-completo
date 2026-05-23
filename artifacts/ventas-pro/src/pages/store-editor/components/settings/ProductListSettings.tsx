import React from 'react';
import { useNode } from '@craftjs/core';
import type { ProductListProps } from '../ProductListComponent';

export const ProductListSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as ProductListProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Productos</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Columnas</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.columns || 3}
          onChange={(e) => setProp((p: any) => (p.columns = Number(e.target.value)))}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Máx. productos</label>
          <input
            type="number"
            min="1"
            max="50"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.maxItems || 12}
            onChange={(e) => setProp((p: any) => (p.maxItems = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Espacio</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.gap || 20}
            onChange={(e) => setProp((p: any) => (p.gap = Number(e.target.value)))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-gray-500 mb-1">Mostrar</label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={props.showImage !== false} onChange={(e) => setProp((p: any) => (p.showImage = e.target.checked))} />
          Imagen
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={props.showPrice !== false} onChange={(e) => setProp((p: any) => (p.showPrice = e.target.checked))} />
          Precio
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={props.showDescription !== false} onChange={(e) => setProp((p: any) => (p.showDescription = e.target.checked))} />
          Descripción
        </label>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Color fondo</label>
        <input
          type="color"
          className="w-full h-8 border rounded cursor-pointer"
          value={props.backgroundColor || '#f9fafb'}
          onChange={(e) => setProp((p: any) => (p.backgroundColor = e.target.value))}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Borde redondo tarjetas</label>
        <input
          type="number"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.borderRadius || 12}
          onChange={(e) => setProp((p: any) => (p.borderRadius = Number(e.target.value)))}
        />
      </div>
    </div>
  );
};

export default ProductListSettings;
