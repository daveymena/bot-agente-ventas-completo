import React from 'react';
import { useNode } from '@craftjs/core';
import type { DividerProps } from '../Divider';

export const DividerSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as DividerProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Divisor</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Color</label>
        <input
          type="color"
          className="w-full h-8 border rounded cursor-pointer"
          value={props.color || '#e0e0e0'}
          onChange={(e) => setProp((p: any) => (p.color = e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Grosor</label>
          <input
            type="number"
            min="1"
            max="10"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.thickness || 1}
            onChange={(e) => setProp((p: any) => (p.thickness = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ancho</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.width || '100%'}
            onChange={(e) => setProp((p: any) => (p.width = e.target.value))}
          >
            <option value="100%">100%</option>
            <option value="75%">75%</option>
            <option value="50%">50%</option>
            <option value="25%">25%</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Estilo</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.style || 'solid'}
          onChange={(e) => setProp((p: any) => (p.style = e.target.value))}
        >
          <option value="solid">Sólido</option>
          <option value="dashed">Discontinuo</option>
          <option value="dotted">Punteado</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Margen</label>
        <input
          type="number"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.margin || 24}
          onChange={(e) => setProp((p: any) => (p.margin = Number(e.target.value)))}
        />
      </div>
    </div>
  );
};

export default DividerSettings;
