import React from 'react';
import { useNode } from '@craftjs/core';

export interface SpacerProps {
  height: number;
  backgroundColor: string;
}

const defaultProps: SpacerProps = {
  height: 40,
  backgroundColor: 'transparent',
};

export const Spacer = (props: Partial<SpacerProps>) => {
  const { connectors: { connect, drag }, selected } = useNode((node) => ({ selected: node.events.selected }));
  const { height, backgroundColor } = { ...defaultProps, ...props };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        height: `${height}px`,
        backgroundColor,
        border: selected ? '2px dashed #3b82f6' : '2px dashed transparent',
        borderRadius: '4px',
        cursor: 'row-resize',
      }}
    />
  );
};

Spacer.craft = {
  displayName: 'Espaciador',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/SpacerSettings')),
  },
};
