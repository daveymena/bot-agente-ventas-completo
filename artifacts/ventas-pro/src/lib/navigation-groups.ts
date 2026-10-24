export const navigationGroups = ['Operación', 'Automatización', 'Crecimiento', 'Sistema'] as const;
export function navigationGroup(href: string): typeof navigationGroups[number] {
  const route = href.split('?')[0];
  if (['/', '/conversations', '/leads', '/products', '/pedidos', '/punto-de-venta', '/woocommerce', '/dropi'].includes(route) || route.startsWith('/tienda/')) return 'Operación';
  if (['/agents', '/probar-vendedor', '/ensenar-con-ejemplo', '/whatsapp', '/code-agent'].includes(route)) return 'Automatización';
  if (['/facebook', '/marketing', '/estudio', '/landing-studio'].includes(route)) return 'Crecimiento';
  return 'Sistema';
}
