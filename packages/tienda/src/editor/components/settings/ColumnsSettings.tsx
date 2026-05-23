import React from 'react';
import { useNode } from '@craftjs/core';
import type { ColumnsProps } from '../ColumnsSection';

export const ColumnsSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as ColumnsProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Columnas</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Número de columnas</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.columns || 2}
          onChange={(e) => setProp((p: any) => (p.columns = Number(e.target.value)))}
        >
          <option value={2}>2 columnas</option>
          <option value={3}>3 columnas</option>
        </select>
      </div>

      {props.columns === 2 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Proporción</label>
          <div className="flex gap-1">
            {(['1-1', '2-1', '1-2'] as const).map((ratio) => (
              <button
                key={ratio}
                className={`flex-1 px-2 py-1 text-xs border rounded ${props.columnRatio === ratio ? 'bg-blue-500 text-white' : 'bg-white'}`}
                onClick={() => setProp((p: any) => (p.columnRatio = ratio))}
              >
                {ratio === '1-1' ? '50/50' : ratio === '2-1' ? '66/33' : '33/66'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Espacio</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.gap || 24}
            onChange={(e) => setProp((p: any) => (p.gap = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Padding</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.padding || 40}
            onChange={(e) => setProp((p: any) => (p.padding = Number(e.target.value)))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Color fondo</label>
        <input
          type="color"
          className="w-full h-8 border rounded cursor-pointer"
          value={props.backgroundColor || 'transparent'}
          onChange={(e) => setProp((p: any) => (p.backgroundColor = e.target.value))}
        />
      </div>
    </div>
  );
};

export default ColumnsSettings;
