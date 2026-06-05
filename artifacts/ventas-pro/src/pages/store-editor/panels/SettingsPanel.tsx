import React from 'react';
import { useEditor, useNode } from '@craftjs/core';

export const SettingsPanel = () => {
  const { actions, query, nodes } = useEditor((state) => ({
    nodes: state.nodes,
  }));

  const selectedNodeId = Object.keys(nodes).find((id) => nodes[id].events.selected);
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Propiedades</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? (
          <div>
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
              <p className="text-xs font-medium text-blue-700">{selectedNode.data.displayName}</p>
            </div>
            {selectedNode.related?.settings ? (
              <React.Suspense fallback={<div className="p-4 text-xs text-gray-400">Cargando...</div>}>
                <selectedNode.related.settings />
              </React.Suspense>
            ) : (
              <div className="p-4 text-sm text-gray-400">Sin configuración disponible</div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🎨</div>
            <p className="text-sm text-gray-400">
              Selecciona un elemento en el canvas para editar sus propiedades
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
