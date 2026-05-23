import React from 'react';
import { useNode } from '@craftjs/core';
import type { SpacerProps } from '../Spacer';

export const SpacerSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as SpacerProps }));

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Espaciador</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Altura: {props.height || 40}px</label>
        <input
          type="range"
          min="4"
          max="200"
          className="w-full"
          value={props.height || 40}
          onChange={(e) => setProp((p: any) => (p.height = Number(e.target.value)))}
        />
        <input
          type="number"
          className="w-full border rounded px-2 py-1 text-sm mt-1"
          value={props.height || 40}
          onChange={(e) => setProp((p: any) => (p.height = Number(e.target.value)))}
        />
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

export default SpacerSettings;
