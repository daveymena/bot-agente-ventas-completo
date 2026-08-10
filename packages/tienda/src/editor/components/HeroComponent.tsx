import { placeholderBanner } from "../../lib/placeholder-image";
import React from 'react';
import { useNode, Element } from '@craftjs/core';
import { TextComponent } from './TextComponent';
import { ButtonComponent } from './ButtonComponent';

export interface HeroProps {
  backgroundImage: string;
  overlayColor: string;
  overlayOpacity: number;
  height: string;
  padding: number;
  contentWidth: string;
  textAlign: 'left' | 'center' | 'right';
}

const defaultProps: HeroProps = {
  backgroundImage: placeholderBanner("Portada"),
  overlayColor: '#000000',
  overlayOpacity: 0.4,
  height: '500px',
  padding: 60,
  contentWidth: '800px',
  textAlign: 'center',
};

export const HeroComponent = (props: Partial<HeroProps>) => {
  const {
    connectors: { connect, drag },
    selected,
  } = useNode((node) => ({ selected: node.events.selected }));

  const { backgroundImage, overlayColor, overlayOpacity, height, padding, contentWidth, textAlign } = {
    ...defaultProps,
    ...props,
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        position: 'relative',
        minHeight: height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${padding}px 20px`,
        overflow: 'hidden',
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: overlayColor,
          opacity: overlayOpacity,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: contentWidth,
          width: '100%',
          textAlign,
        }}
      >
        <Element is={TextComponent} canvas id="hero-title" text="Título principal de la tienda" fontSize={42} color="#ffffff" bold textAlign={textAlign} />
        <Element is={TextComponent} canvas id="hero-subtitle" text="Subtítulo descriptivo que invite al usuario a explorar tus productos" fontSize={18} color="#e0e0e0" textAlign={textAlign} />
        <Element is={ButtonComponent} canvas id="hero-button" text="Ver productos" size="lg" />
      </div>
    </div>
  );
};

HeroComponent.craft = {
  displayName: 'Hero',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/HeroSettings')),
  },
};
