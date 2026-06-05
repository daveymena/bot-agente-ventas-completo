import React, { useState } from 'react';
import { useNode } from '@craftjs/core';
import type { ImageProps } from '../ImageComponent';

export const ImageSettings = () => {
  const { actions: { setProp }, props } = useNode((node) => ({ props: node.data.props as ImageProps }));
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/public/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setProp((p: any) => (p.src = data.image));
      setAiPrompt('');
    } catch {
      alert('No se pudo generar la imagen');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">Imagen</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">URL de la imagen</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.src || ''}
          onChange={(e) => setProp((p: any) => (p.src = e.target.value))}
        />
      </div>

      <div className="border-t pt-4">
        <label className="block text-xs text-gray-500 mb-1">Generar con IA</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border rounded px-2 py-1 text-sm"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe la imagen..."
          />
          <button
            className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/80 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={generating || !aiPrompt.trim()}
          >
            {generating ? '...' : 'Generar'}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Texto alternativo</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.alt || ''}
          onChange={(e) => setProp((p: any) => (p.alt = e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ancho</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.width || '100%'}
            onChange={(e) => setProp((p: any) => (p.width = e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Alto</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.height || '300px'}
            onChange={(e) => setProp((p: any) => (p.height = e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Ajuste</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={props.objectFit || 'cover'}
          onChange={(e) => setProp((p: any) => (p.objectFit = e.target.value))}
        >
          <option value="cover">Cover (cubrir)</option>
          <option value="contain">Contain (contener)</option>
          <option value="fill">Fill (llenar)</option>
          <option value="none">None (ninguno)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Borde redondo</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={props.borderRadius || 0}
            onChange={(e) => setProp((p: any) => (p.borderRadius = Number(e.target.value)))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sombra</label>
          <input
            type="checkbox"
            className="w-4 h-4 block mt-4"
            checked={props.shadow || false}
            onChange={(e) => setProp((p: any) => (p.shadow = e.target.checked))}
          />
        </div>
      </div>
    </div>
  );
};

export default ImageSettings;
