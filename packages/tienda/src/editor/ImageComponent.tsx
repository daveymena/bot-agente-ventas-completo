import React from 'react';
import { useNode } from '@craftjs/core';

export const ImageComponent = ({ src = '', alt = 'Imagen', width = '100%', height = 'auto' }) => {
  const {
    connectors: { connect, drag },
    actions: { setProp },
    selected,
  } = useNode();

  return (
    <img
      ref={ref => connect(drag(ref))}
      src={src}
      alt={alt}
      style={{ width, height, cursor: 'pointer' }}
      onDoubleClick={e => {
        const newSrc = prompt('URL de la imagen', src) || src;
        setProp((props: any) => (props.src = newSrc));
      }}
    />
  );
};

ImageComponent.craft = {
  displayName: 'Imagen',
  props: {
    src: '',
    alt: 'Imagen',
    width: '100%',
    height: 'auto',
  },
};