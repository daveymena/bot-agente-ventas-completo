import React from 'react';
import { Editor, Frame, Element } from '@craftjs/core';
import { EditorPanel } from '../editor/EditorPanel';
import { TextComponent } from '../editor/TextComponent';
import { ImageComponent } from '../editor/ImageComponent';
import { ProductListComponent } from '../editor/ProductListComponent';

const EditorPage = () => (
  <Editor resolver={{ TextComponent, ImageComponent, ProductListComponent }}>
    <div className="flex h-screen">
      <div className="w-1/4 border-r overflow-auto">
        <EditorPanel />
      </div>
      <div className="flex-1 overflow-auto">
        <Frame canvas>
          <Element canvas is={TextComponent} text="Título de la tienda" fontSize="32px" color="#333" />
          <Element canvas is={ImageComponent} src="https://placehold.co/800x200" alt="Hero" />
          <Element canvas is={ProductListComponent} />
        </Frame>
      </div>
    </div>
  </Editor>
);

export default EditorPage;
