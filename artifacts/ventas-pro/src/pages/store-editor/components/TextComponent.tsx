import React from 'react';
import { useNode } from '@craftjs/core';

export interface TextProps {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  padding: number;
  margin: number;
}

const defaultProps: TextProps = {
  text: 'Haz clic para editar este texto',
  fontSize: 16,
  fontFamily: 'Inter, sans-serif',
  color: '#1a1a1a',
  bold: false,
  italic: false,
  underline: false,
  textAlign: 'left',
  lineHeight: 1.5,
  padding: 8,
  margin: 0,
};

export const TextComponent = (props: Partial<TextProps>) => {
  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((node) => ({ selected: node.events.selected }));

  const { text, fontSize, fontFamily, color, bold, italic, underline, textAlign, lineHeight, padding, margin } = {
    ...defaultProps,
    ...props,
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: `${padding}px`,
        margin: `${margin}px`,
        textAlign,
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
        cursor: 'text',
        position: 'relative',
      }}
    >
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => setProp((props: any) => (props.text = e.currentTarget.textContent || ''))}
        style={{
          fontFamily,
          fontSize: `${fontSize}px`,
          color,
          fontWeight: bold ? 'bold' : 'normal',
          fontStyle: italic ? 'italic' : 'normal',
          textDecoration: underline ? 'underline' : 'none',
          lineHeight,
          outline: 'none',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};

TextComponent.craft = {
  displayName: 'Texto',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/TextSettings')),
  },
};
