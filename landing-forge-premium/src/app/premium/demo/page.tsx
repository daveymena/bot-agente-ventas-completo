import type { Metadata } from 'next';
import { DemoMatrix } from './DemoMatrix';

export const metadata: Metadata = {
  title: 'Demo · Landing Forge Premium',
  description: '4 plantillas × 4 temas renderizadas con productos reales del catálogo.',
};

export default function DemoPage() {
  return <DemoMatrix />;
}
