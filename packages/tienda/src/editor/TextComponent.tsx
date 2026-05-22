import React from 'react';
import { useNode } from '@craftjs/core';

export const TextComponent = ({ text = 'Texto editable', fontSize = '16px', color = '#000' }) => {
  const {
    connectors: { connect, drag },
    actions: { setProp },
    selected,
  } = useNode();

  return (
    <div
      ref={ref => connect(drag(ref))}
      style={{ fontSize, color, cursor: 'text' }}
      contentEditable
      suppressContentEditableWarning
      onBlur={e => setProp((props: any) => {
        props.text = e.currentTarget.textContent || '';
        return props;
      })}
    >
      {text}
    </div>
  );
};

TextComponent.craft = {
  displayName: 'Texto',
  props: {
    text: 'Texto editable',
    fontSize: '16px',
    color: '#000',
  },
  related: {},
};

TextComponent.craft = {
  displayName: 'Texto',
  props: {
    text: 'Texto editable',
    fontSize: '16px',
    color: '#000',
  },
  related: {},
};