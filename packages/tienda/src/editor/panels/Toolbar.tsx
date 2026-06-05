import React from 'react';
import { useEditor } from '@craftjs/core';

interface ToolbarProps {
  onSave?: () => void;
  onPreview?: () => void;
  isPreview?: boolean;
  onResponsive?: (mode: 'desktop' | 'tablet' | 'mobile') => void;
  responsiveMode?: 'desktop' | 'tablet' | 'mobile';
}

export const Toolbar = ({ onSave, onPreview, isPreview, onResponsive, responsiveMode = 'desktop' }: ToolbarProps) => {
  const { actions, query, canUndo, canRedo } = useEditor((state) => ({
    canUndo: state.options?.canUndo ?? false,
    canRedo: state.options?.canRedo ?? false,
  }));

  const handleUndo = () => {
    if (canUndo) actions.history.undo();
  };

  const handleRedo = () => {
    if (canRedo) actions.history.redo();
  };

  const handleClear = () => {
    if (confirm('¿Estás seguro de que deseas limpiar el canvas?')) {
      actions.clearEvents();
      actions.setOptions((options: any) => (options = { ...options }));
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
      <div className="flex items-center gap-2">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Deshacer"
        >
          ↩
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Rehacer"
        >
          ↪
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Vista previa responsive */}
        {(['desktop', 'tablet', 'mobile'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onResponsive?.(mode)}
            className={`px-2 py-1.5 text-xs border rounded hover:bg-gray-50 ${responsiveMode === mode ? 'bg-blue-50 border-blue-300 text-blue-600' : ''}`}
            title={mode === 'desktop' ? 'Escritorio' : mode === 'tablet' ? 'Tablet' : 'Móvil'}
          >
            {mode === 'desktop' ? '🖥' : mode === 'tablet' ? '📱' : '📱'}
            {mode === 'desktop' ? ' Escritorio' : mode === 'tablet' ? ' Tablet' : ' Móvil'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {onSave && (
          <button
            onClick={onSave}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            💾 Guardar
          </button>
        )}
        {onPreview && (
          <button
            onClick={onPreview}
            className={`px-4 py-1.5 text-xs font-medium border rounded ${isPreview ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'bg-gray-50 hover:bg-gray-100'}`}
          >
            {isPreview ? '✕ Cerrar vista' : '👁 Vista previa'}
          </button>
        )}
      </div>
    </div>
  );
};
