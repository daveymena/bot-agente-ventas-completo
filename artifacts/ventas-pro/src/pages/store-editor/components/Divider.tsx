import React from 'react';
import { useNode } from '@craftjs/core';

export interface DividerProps {
  color: string;
  thickness: number;
  width: string;
  margin: number;
  style: 'solid' | 'dashed' | 'dotted';
}

const defaultProps: DividerProps = {
  color: '#e0e0e0',
  thickness: 1,
  width: '100%',
  margin: 24,
  style: 'solid',
};

export const Divider = (props: Partial<DividerProps>) => {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  const { color, thickness, width, margin, style } = { ...defaultProps, ...props };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: `${margin}px 0`,
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
      }}
    >
      <hr
        style={{
          border: 'none',
          borderTop: `${thickness}px ${style} ${color}`,
          width,
          margin: '0 auto',
        }}
      />
    </div>
  );
};

Divider.craft = {
  displayName: 'Divisor',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/DividerSettings')),
  },
};
