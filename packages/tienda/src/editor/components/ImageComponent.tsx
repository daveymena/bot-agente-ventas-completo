import { placeholderImage } from "../../lib/placeholder-image";
import React from 'react';
import { useNode } from '@craftjs/core';

export interface ImageProps {
  src: string;
  alt: string;
  width: string;
  height: string;
  objectFit: 'cover' | 'contain' | 'fill' | 'none';
  borderRadius: number;
  shadow: boolean;
  margin: number;
}

const defaultProps: ImageProps = {
  src: placeholderImage("Imagen"),
  alt: 'Imagen',
  width: '100%',
  height: '300px',
  objectFit: 'cover',
  borderRadius: 8,
  shadow: false,
  margin: 0,
};

export const ImageComponent = (props: Partial<ImageProps>) => {
  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((node) => ({ selected: node.events.selected }));

  const { src, alt, width, height, objectFit, borderRadius, shadow, margin } = {
    ...defaultProps,
    ...props,
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: '4px',
        margin: `${margin}px`,
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          borderRadius: `${borderRadius}px`,
          boxShadow: shadow ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        }}
        onDoubleClick={() => {
          const newSrc = prompt('URL de la imagen:', src);
          if (newSrc) setProp((props: any) => (props.src = newSrc));
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            width,
            height,
            objectFit,
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

ImageComponent.craft = {
  displayName: 'Imagen',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/ImageSettings')),
  },
};
