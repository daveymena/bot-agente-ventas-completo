import React from 'react';
import { useNode, Element } from '@craftjs/core';
import { TextComponent } from './TextComponent';
import { ImageComponent } from './ImageComponent';

export interface ColumnsProps {
  columns: 2 | 3;
  gap: number;
  padding: number;
  backgroundColor: string;
  columnRatio: '1-1' | '2-1' | '1-2';
}

const defaultProps: ColumnsProps = {
  columns: 2,
  gap: 24,
  padding: 40,
  backgroundColor: 'transparent',
  columnRatio: '1-1',
};

const ratioMap = {
  '1-1': ['1fr', '1fr'],
  '2-1': ['2fr', '1fr'],
  '1-2': ['1fr', '2fr'],
};

export const ColumnsSection = (props: Partial<ColumnsProps>) => {
  const {
    connectors: { connect, drag },
    selected,
  } = useNode((node) => ({ selected: node.events.selected }));

  const { columns, gap, padding, backgroundColor, columnRatio } = { ...defaultProps, ...props };

  const ratios = columns === 2 ? ratioMap[columnRatio] : ['1fr', '1fr', '1fr'];

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={{
        padding: `${padding}px 20px`,
        backgroundColor,
        border: selected ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: '4px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: ratios.slice(0, columns).join(' '),
          gap: `${gap}px`,
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} style={{ minHeight: '100px', padding: '8px' }} className="craft-column">
            <Element
              is={TextComponent}
              canvas
              id={`column-${i}-title`}
              text={`Columna ${i + 1}`}
              fontSize={20}
              bold
              textAlign="center"
            />
            <Element
              is={ImageComponent}
              canvas
              id={`column-${i}-image`}
              src={`https://placehold.co/600x400?text=Columna+${i + 1}`}
              height="200px"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

ColumnsSection.craft = {
  displayName: 'Columnas',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/ColumnsSettings')),
  },
};
