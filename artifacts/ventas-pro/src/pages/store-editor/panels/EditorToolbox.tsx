import React from 'react';
import { useEditor } from '@craftjs/core';
import { TextComponent } from '../components/TextComponent';
import { ImageComponent } from '../components/ImageComponent';
import { ButtonComponent } from '../components/ButtonComponent';
import { HeroComponent } from '../components/HeroComponent';
import { ProductListComponent } from '../components/ProductListComponent';
import { FeaturesSection } from '../components/FeaturesSection';
import { ColumnsSection } from '../components/ColumnsSection';
import { Spacer } from '../components/Spacer';
import { Divider } from '../components/Divider';

export interface ToolboxItem {
  name: string;
  icon: string;
  component: any;
  props?: Record<string, any>;
  category: string;
}

const items: ToolboxItem[] = [
  { name: 'Hero', icon: '🏠', component: HeroComponent, category: 'Secciones' },
  { name: 'Texto', icon: '📝', component: TextComponent, category: 'Básicos' },
  { name: 'Imagen', icon: '🖼', component: ImageComponent, category: 'Básicos' },
  { name: 'Botón', icon: '🔘', component: ButtonComponent, category: 'Básicos' },
  { name: 'Productos', icon: '📦', component: ProductListComponent, category: 'Tienda' },
  { name: 'Columnas', icon: '📐', component: ColumnsSection, category: 'Layout' },
  { name: 'Características', icon: '⭐', component: FeaturesSection, category: 'Secciones' },
  { name: 'Espaciador', icon: '⬜', component: Spacer, category: 'Layout' },
  { name: 'Divisor', icon: '➖', component: Divider, category: 'Layout' },
];

const categories = Array.from(new Set(items.map((i) => i.category)));

export const EditorToolbox = () => {
  const { connectors } = useEditor();

  return (
    <div className="h-full overflow-y-auto bg-gray-50 border-r border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Componentes</h3>
      </div>
      {categories.map((cat) => (
        <div key={cat} className="mb-2">
          <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
            {cat}
          </div>
          {items
            .filter((item) => item.category === cat)
            .map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg cursor-grab hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
                ref={(ref) => {
                  if (ref) {
                    connectors.create(ref, <item.component {...(item.props || {})} />);
                  }
                }}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium text-gray-600">{item.name}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};
