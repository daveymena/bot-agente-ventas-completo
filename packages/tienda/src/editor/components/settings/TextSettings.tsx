import React from 'react';
import { useNode } from '@craftjs/core';
import type { TextProps } from '../TextComponent';

export const TextSettings = () => {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({ props: node.data.props as TextProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Texto</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Contenido</label>
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={3}
          value={props.text || ''}
          onChange={(e) => setProp((p: any) => (p.text = e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tamaño</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.fontSize || 16}
            onChange={(e) => setProp((p: any) => (p.fontSize = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Color</label>
          <input
            type="color"
            className="w-full h-8 border rounded cursor-pointer"
            value={props.color || '#000000'}
            onChange={(e) => setProp((p: any) => (p.color = e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Fuente</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.fontFamily || 'Inter'}
          onChange={(e) => setProp((p: any) => (p.fontFamily = e.target.value))}
        >
          <option value="Inter, sans-serif">Inter</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="system-ui, sans-serif">System UI</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Negrita</label>
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={props.bold || false}
            onChange={(e) => setProp((p: any) => (p.bold = e.target.checked))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cursiva</label>
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={props.italic || false}
            onChange={(e) => setProp((p: any) => (p.italic = e.target.checked))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Alineación</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              className={`flex-1 px-2 py-1 text-xs border rounded ${props.textAlign === align ? 'bg-blue-500 text-white' : 'bg-white'}`}
              onClick={() => setProp((p: any) => (p.textAlign = align))}
            >
              {align === 'left' ? '≡' : align === 'center' ? '≡' : '≡'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Interlineado: {props.lineHeight || 1.5}</label>
        <input
          type="range"
          min="1"
          max="2.5"
          step="0.1"
          className="w-full"
          value={props.lineHeight || 1.5}
          onChange={(e) => setProp((p: any) => (p.lineHeight = Number(e.target.value)))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Padding</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.padding || 8}
            onChange={(e) => setProp((p: any) => (p.padding = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Margen</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.margin || 0}
            onChange={(e) => setProp((p: any) => (p.margin = Number(e.target.value)))}
          />
        </div>
      </div>
    </div>
  );
};

export default TextSettings;
