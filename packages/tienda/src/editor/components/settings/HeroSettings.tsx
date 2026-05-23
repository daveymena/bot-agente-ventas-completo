import React from 'react';
import { useNode } from '@craftjs/core';
import type { HeroProps } from '../HeroComponent';

export const HeroSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as HeroProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Hero</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Imagen de fondo</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.backgroundImage || ''}
          onChange={(e) => setProp((p: any) => (p.backgroundImage = e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Color superposición</label>
          <input
            type="color"
            className="w-full h-8 border rounded cursor-pointer"
            value={props.overlayColor || '#000000'}
            onChange={(e) => setProp((p: any) => (p.overlayColor = e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Opacidad: {props.overlayOpacity || 0.4}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            className="w-full"
            value={props.overlayOpacity || 0.4}
            onChange={(e) => setProp((p: any) => (p.overlayOpacity = Number(e.target.value)))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Altura</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.height || '500px'}
          onChange={(e) => setProp((p: any) => (p.height = e.target.value))}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Padding</label>
        <input
          type="number"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.padding || 60}
          onChange={(e) => setProp((p: any) => (p.padding = Number(e.target.value)))}
        />
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
              {align}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroSettings;
