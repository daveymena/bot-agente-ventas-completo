import React from 'react';
import { useNode } from '@craftjs/core';
import type { ButtonProps } from '../ButtonComponent';

export const ButtonSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as ButtonProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Botón</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Texto</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.text || ''}
          onChange={(e) => setProp((p: any) => (p.text = e.target.value))}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Enlace</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.url || ''}
          onChange={(e) => setProp((p: any) => (p.url = e.target.value))}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Estilo</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.variant || 'filled'}
          onChange={(e) => setProp((p: any) => (p.variant = e.target.value))}
        >
          <option value="filled">Relleno</option>
          <option value="outline">Borde</option>
          <option value="ghost">Fantasma</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Tamaño</label>
        <div className="flex gap-1">
          {(['sm', 'md', 'lg'] as const).map((s) => (
            <button
              key={s}
              className={`flex-1 px-2 py-1 text-xs border rounded ${props.size === s ? 'bg-blue-500 text-white' : 'bg-white'}`}
              onClick={() => setProp((p: any) => (p.size = s))}
            >
              {s === 'sm' ? 'Peq' : s === 'md' ? 'Med' : 'Grande'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Color texto</label>
          <input
            type="color"
            className="w-full h-8 border rounded cursor-pointer"
            value={props.color || '#ffffff'}
            onChange={(e) => setProp((p: any) => (p.color = e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Color fondo</label>
          <input
            type="color"
            className="w-full h-8 border rounded cursor-pointer"
            value={props.backgroundColor || '#3b82f6'}
            onChange={(e) => setProp((p: any) => (p.backgroundColor = e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Borde redondo</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.borderRadius || 8}
            onChange={(e) => setProp((p: any) => (p.borderRadius = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 mt-4">Ancho completo</label>
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={props.fullWidth || false}
            onChange={(e) => setProp((p: any) => (p.fullWidth = e.target.checked))}
          />
        </div>
      </div>
    </div>
  );
};

export default ButtonSettings;
