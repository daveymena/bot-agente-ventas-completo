import React from 'react';
import { useNode } from '@craftjs/core';

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface FeaturesProps {
  columns: 2 | 3 | 4;
  gap: number;
  items: FeatureItem[];
  padding: number;
  backgroundColor: string;
}

const defaultItems: FeatureItem[] = [
  { icon: '🚀', title: 'Envío Rápido', description: 'Entrega en 24-48 horas en todas tus compras' },
  { icon: '💳', title: 'Pago Seguro', description: 'Paga con tarjeta, Nequi o PayPal con total seguridad' },
  { icon: '🎧', title: 'Soporte 24/7', description: 'Estamos aquí para ayudarte cuando nos necesites' },
  { icon: '🔒', title: 'Compra Protegida', description: 'Tus datos están seguros con nosotros' },
];

const defaultProps: FeaturesProps = {
  columns: 3,
  gap: 24,
  items: defaultItems,
  padding: 60,
  backgroundColor: '#ffffff',
};

export const FeaturesSection = (props: Partial<FeaturesProps>) => {
  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((node) => ({ selected: node.events.selected }));

  const { columns, gap, items, padding, backgroundColor } = { ...defaultProps, ...props };

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
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${gap}px`,
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        {items.map((item, index) => (
          <div key={index} style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>{item.icon}</div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0', color: '#1a1a1a' }}>
              {item.title}
            </h3>
            <p style={{ fontSize: '14px', color: '#666', margin: 0, lineHeight: 1.5 }}>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

FeaturesSection.craft = {
  displayName: 'Características',
  props: defaultProps,
  related: {
    settings: React.lazy(() => import('./settings/FeaturesSettings')),
  },
};
