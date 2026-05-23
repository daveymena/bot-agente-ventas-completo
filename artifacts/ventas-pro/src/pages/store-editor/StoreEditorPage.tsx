import React, { useState } from 'react';
import { Editor, Frame, Element } from '@craftjs/core';

import { TextComponent } from './components/TextComponent';
import { ImageComponent } from './components/ImageComponent';
import { ButtonComponent } from './components/ButtonComponent';
import { HeroComponent } from './components/HeroComponent';
import { ProductListComponent } from './components/ProductListComponent';
import { FeaturesSection } from './components/FeaturesSection';
import { ColumnsSection } from './components/ColumnsSection';
import { Spacer } from './components/Spacer';
import { Divider } from './components/Divider';

import { Toolbar } from './panels/Toolbar';
import { EditorToolbox } from './panels/EditorToolbox';
import { SettingsPanel } from './panels/SettingsPanel';

const resolver = {
  TextComponent,
  ImageComponent,
  ButtonComponent,
  HeroComponent,
  ProductListComponent,
  FeaturesSection,
  ColumnsSection,
  Spacer,
  Divider,
};

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const viewportWidths: Record<ViewportSize, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export default function StoreEditorPage() {
  const [isPreview, setIsPreview] = useState(false);
  const [responsiveMode, setResponsiveMode] = useState<ViewportSize>('desktop');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const serialized = JSON.stringify({ savedAt: new Date().toISOString(), version: 2 });
      localStorage.setItem('store_layout', serialized);
      alert('✅ Diseño guardado correctamente');
    } catch {
      alert('❌ Error al guardar el diseño');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Editor resolver={resolver}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#f0f0f0' }}>
        <Toolbar
          onSave={handleSave}
          onPreview={() => setIsPreview(!isPreview)}
          isPreview={isPreview}
          onResponsive={setResponsiveMode}
          responsiveMode={responsiveMode}
        />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {!isPreview && (
            <div style={{ width: '240px', flexShrink: 0, overflow: 'auto' }}>
              <EditorToolbox />
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: viewportWidths[responsiveMode],
                minHeight: 'calc(100vh - 120px)',
                background: '#ffffff',
                borderRadius: responsiveMode === 'desktop' ? '0' : '12px',
                boxShadow: responsiveMode === 'desktop' ? 'none' : '0 4px 24px rgba(0,0,0,0.15)',
                transition: 'width 0.3s ease',
                overflow: 'hidden',
              }}
            >
              <Frame>
                <Element canvas is={TextComponent} text="Bienvenido a tu tienda" fontSize={32} bold textAlign="center" padding={40} />
                <Element canvas is={ImageComponent} src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800" height="300px" />
                <Element canvas is={ProductListComponent} />
              </Frame>
            </div>
          </div>
          {!isPreview && (
            <div style={{ width: '300px', flexShrink: 0, overflow: 'auto', borderLeft: '1px solid #e5e7eb' }}>
              <SettingsPanel />
            </div>
          )}
        </div>
      </div>
    </Editor>
  );
}
