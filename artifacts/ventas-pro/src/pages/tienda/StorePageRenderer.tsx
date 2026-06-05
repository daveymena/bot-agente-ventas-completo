import { useMemo } from 'react';
import { Editor, Frame } from '@craftjs/core';

import { TextComponent } from '../store-editor/components/TextComponent';
import { ImageComponent } from '../store-editor/components/ImageComponent';
import { ButtonComponent } from '../store-editor/components/ButtonComponent';
import { HeroComponent } from '../store-editor/components/HeroComponent';
import { ProductListComponent } from '../store-editor/components/ProductListComponent';
import { FeaturesSection } from '../store-editor/components/FeaturesSection';
import { ColumnsSection } from '../store-editor/components/ColumnsSection';
import { Spacer } from '../store-editor/components/Spacer';
import { Divider } from '../store-editor/components/Divider';

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

interface StorePageRendererProps {
  layout: unknown;
}

export function StorePageRenderer({ layout }: StorePageRendererProps) {
  const parsed = useMemo(() => {
    if (!layout) return null;
    try {
      return typeof layout === 'string' ? JSON.parse(layout) : layout;
    } catch {
      return null;
    }
  }, [layout]);

  if (!parsed) return null;

  return (
    <Editor resolver={resolver} enabled={false}>
      <Frame data={parsed} />
    </Editor>
  );
}
