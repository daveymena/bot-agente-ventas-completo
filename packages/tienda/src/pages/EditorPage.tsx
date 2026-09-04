import { placeholderImage } from "../lib/placeholder-image";
import React, { useState, useEffect } from 'react';
import { Editor, Frame, Element } from '@craftjs/core';

// Componentes
import { TextComponent } from '../editor/components/TextComponent';
import { ImageComponent } from '../editor/components/ImageComponent';
import { ButtonComponent } from '../editor/components/ButtonComponent';
import { HeroComponent } from '../editor/components/HeroComponent';
import { ProductListComponent } from '../editor/components/ProductListComponent';
import { FeaturesSection } from '../editor/components/FeaturesSection';
import { ColumnsSection } from '../editor/components/ColumnsSection';
import { Spacer } from '../editor/components/Spacer';
import { Divider } from '../editor/components/Divider';

// Paneles
import { Toolbar } from '../editor/panels/Toolbar';
import { EditorToolbox } from '../editor/panels/EditorToolbox';
import { SettingsPanel } from '../editor/panels/SettingsPanel';

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

const EditorPage = () => {
  const [isPreview, setIsPreview] = useState(false);
  const [responsiveMode, setResponsiveMode] = useState<ViewportSize>('desktop');
  const [layout, setLayout] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cargar layout guardado desde backend
  useEffect(() => {
    const saved = localStorage.getItem('store_layout');
    if (saved) {
      setLayout(saved);
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Guardar en localStorage como placeholder
      const serialized = JSON.stringify({ 
        savedAt: new Date().toISOString(),
        version: 2,
      });
      localStorage.setItem('store_layout', serialized);
      alert('✅ Diseño guardado correctamente');
    } catch (err) {
      alert('❌ Error al guardar el diseño');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    setIsPreview(!isPreview);
  };

  const handleResponsive = (mode: ViewportSize) => {
    setResponsiveMode(mode);
  };

  return (
    <Editor resolver={resolver}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0' }}>
        {/* Toolbar */}
        <Toolbar
          onSave={handleSave}
          onPreview={handlePreview}
          isPreview={isPreview}
          onResponsive={handleResponsive}
          responsiveMode={responsiveMode}
        />

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Toolbox lateral izquierdo */}
          {!isPreview && (
            <div style={{ width: '240px', flexShrink: 0, overflow: 'auto' }}>
              <EditorToolbox />
            </div>
          )}

          {/* Canvas central */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: viewportWidths[responsiveMode],
                minHeight: 'calc(100vh - 140px)',
                background: '#ffffff',
                borderRadius: responsiveMode === 'desktop' ? '0' : '12px',
                boxShadow: responsiveMode === 'desktop' ? 'none' : '0 4px 24px rgba(0,0,0,0.15)',
                transition: 'width 0.3s ease',
                overflow: 'hidden',
              }}
            >
              <Frame>
                <Element
                  canvas
                  is={TextComponent}
                  text="Bienvenido a tu tienda"
                  fontSize={32}
                  bold
                  textAlign="center"
                  padding={40}
                />
                <Element
                  canvas
                  is={ImageComponent}
                  src={placeholderImage("Imagen")}
                  height="300px"
                />
                <Element
                  canvas
                  is={ProductListComponent}
                />
              </Frame>
            </div>
          </div>

          {/* Settings panel lateral derecho */}
          {!isPreview && (
            <div style={{ width: '300px', flexShrink: 0, overflow: 'auto' }}>
              <SettingsPanel />
            </div>
          )}
        </div>
      </div>
    </Editor>
  );
};

export default EditorPage;
