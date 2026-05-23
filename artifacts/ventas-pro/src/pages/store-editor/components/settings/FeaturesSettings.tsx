import React from 'react';
import { useNode } from '@craftjs/core';
import type { FeaturesProps, FeatureItem } from '../FeaturesSection';

export const FeaturesSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as FeaturesProps }));
  const items = props.items || [];

  const updateItem = (index: number, field: keyof FeatureItem, value: string) => {
    setProp((p: any) => {
      const newItems = [...(p.items || [])] as FeatureItem[];
      newItems[index] = { ...newItems[index], [field]: value };
      p.items = newItems;
    });
  };

  const addItem = () => {
    setProp((p: any) => {
      p.items = [...(p.items || []), { icon: '📦', title: 'Nueva característica', description: 'Descripción aquí' }];
    });
  };

  const removeItem = (index: number) => {
    setProp((p: any) => {
      p.items = (p.items as FeatureItem[]).filter((_: any, i: number) => i !== index);
    });
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Características</h3>

      <div className="grid grid-cols-2 gap-2">
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">Espacio</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.gap || 24}
            onChange={(e) => setProp((p: any) => (p.gap = Number(e.target.value)))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Color fondo</label>
        <input
          type="color"
          className="w-full h-8 border rounded cursor-pointer"
          value={props.backgroundColor || '#ffffff'}
          onChange={(e) => setProp((p: any) => (p.backgroundColor = e.target.value))}
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-semibold text-gray-500">Ítems ({items.length})</label>
          <button
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded"
            onClick={addItem}
          >
            + Añadir
          </button>
        </div>
        {items.map((item, i) => (
          <div key={i} className="border rounded p-2 mb-2">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium">#{i + 1}</span>
              <button className="text-xs text-red-500" onClick={() => removeItem(i)}>✕</button>
            </div>
            <div className="space-y-1">
              <input
                type="text"
                className="w-full border rounded px-1 py-0.5 text-xs"
                placeholder="Icono (emoji)"
                value={item.icon || ''}
                onChange={(e) => updateItem(i, 'icon', e.target.value)}
              />
              <input
                type="text"
                className="w-full border rounded px-1 py-0.5 text-xs"
                placeholder="Título"
                value={item.title || ''}
                onChange={(e) => updateItem(i, 'title', e.target.value)}
              />
              <input
                type="text"
                className="w-full border rounded px-1 py-0.5 text-xs"
                placeholder="Descripción"
                value={item.description || ''}
                onChange={(e) => updateItem(i, 'description', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturesSettings;
