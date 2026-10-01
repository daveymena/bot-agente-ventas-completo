import type { Metadata } from 'next';
import { ForgeApp } from '@/components/forge/ForgeApp';

export const metadata: Metadata = {
  title: 'Landing Forge Premium · VentasProIA',
  description: 'Generador de landings de alta conversión para tráfico de Facebook e Instagram Ads.',
};

export default function PremiumPage() {
  return <ForgeApp />;
}
