import React from 'react';
import { useNode } from '@craftjs/core';

export interface ButtonProps {
  text: string;
  url: string;
  variant: 'filled' | 'outline' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  color: string;
  backgroundColor: string;
  borderRadius: number;
  fullWidth: boolean;
  icon: string;
  margin: number;
}

const defaultProps: ButtonProps = {
  text: 'Botón',
  url: '#',
  variant: 'filled',
  size: 'md',
  color: '#ffffff',
  backgroundColor: '#3b82f6',
  borderRadius: 8,
  fullWidth: false,
  icon: '',
  margin: 8,
};

const sizeMap = { sm: { px: 10, py: 6, fs: 14 }, md: { px: 20, py: 10, fs: 16 }, lg: { px: 28, py: 14, fs: 18 } };

export const ButtonComponent = (props: Partial<ButtonProps>) => {
  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((node) => ({ selected: node.events.selected }));

  const { text, url, variant, size, color, backgroundColor, borderRadius, fullWidth, margin } = {
    ...defaultProps,
    ...props,
  };

  const s = sizeMap[size];

  const variantStyles = {
    filled: { backgroundColor, color, border: 'none' },
    outline: { backgroundColor: 'transparent', color: backgroundColor, border: `2px solid ${backgroundColor}` },
    ghost: { backgroundColor: 'transparent', color: backgroundColor, border: 'none' },
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: '4px',
        margin: `${margin}px`,
        textAlign: 'center',
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => { e.preventDefault(); }}
        style={{
          display: fullWidth ? 'block' : 'inline-block',
          padding: `${s.py}px ${s.px}px`,
          fontSize: `${s.fs}px`,
          borderRadius: `${borderRadius}px`,
          cursor: 'pointer',
          textDecoration: 'none',
          fontWeight: 600,
          transition: 'all 0.2s',
          ...variantStyles[variant],
        }}
        onMouseEnter={(e) => {
          if (variant === 'filled') e.currentTarget.style.opacity = '0.9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        {text}
      </a>
    </div>
  );
};

ButtonComponent.craft = {
  displayName: 'Botón',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/ButtonSettings')),
  },
};
