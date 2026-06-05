import React from 'react';
import { useEditor } from '@craftjs/core';
import { TextComponent } from './TextComponent';
import { ImageComponent } from './ImageComponent';
import { ProductListComponent } from './ProductListComponent';

export const EditorPanel = () => {
  const { actions, query } = useEditor();

  const addNode = (component: any) => {
    actions.addNode(component);
  };

  return (
    <div className="p-4 bg-gray-50 h-full overflow-auto">
      <h3 className="font-bold mb-2">Componentes</h3>
      <button className="block w-full mb-2 p-2 bg-white border rounded" onClick={() => addNode(<TextComponent />)}>
        Texto
      </button>
      <button className="block w-full mb-2 p-2 bg-white border rounded" onClick={() => addNode(<ImageComponent />)}>
        Imagen
      </button>
      <button className="block w-full mb-2 p-2 bg-white border rounded" onClick={() => addNode(<ProductListComponent />)}>
        Lista de Productos
      </button>
    </div>
  );
};