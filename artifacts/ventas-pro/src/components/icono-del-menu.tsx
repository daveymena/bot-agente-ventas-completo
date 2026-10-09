import type { ComponentType } from "react";

/**
 * Íconos del menú con vida (08-10). El dueño: "dale color a esos íconos, así
 * como los de las integraciones". Los logos de marca (WhatsApp, Dropi…) ya
 * venían a color; el resto eran trazos grises que se perdían. Cada sección
 * tiene su color fijo: el mismo en la barra lateral y en el celular, para
 * que se reconozca de un vistazo.
 */
const COLOR_POR_RUTA: Record<string, string> = {
  "/": "#6366f1",                 // Panel — índigo (color de la marca)
  "/conversations": "#0ea5e9",    // Conversaciones — celeste
  "/agents": "#8b5cf6",           // Agentes IA — violeta
  "/probar-vendedor": "#14b8a6",  // Probar vendedor — verde azulado
  "/ensenar-con-ejemplo": "#f59e0b", // Enseñar — ámbar
  "/leads": "#ec4899",            // Prospectos — rosa
  "/pedidos": "#f97316",          // Pedidos — naranja
  "/products": "#eab308",         // Productos — amarillo
  "/whatsapp-monitor": "#10b981", // Monitor WA — esmeralda
  "/admin/tenants": "#f59e0b",    // Administrador — dorado
  "/integraciones": "#06b6d4",    // Integraciones — cian
  "/code-agent": "#a855f7",       // Atlas — púrpura
  "/branding": "#f43f5e",         // Personalización — rosado intenso
  "/marketing": "#ef4444",        // Marketing — rojo
  "/landing-studio": "#3b82f6",   // Landing Studio — azul
  "/settings": "#64748b",         // Configuración — pizarra
  "/diagnostico": "#22c55e",      // Diagnóstico — verde
  "/ayuda": "#38bdf8",            // Ayuda — cielo
  "/pricing": "#eab308",          // Planes — oro
};

export function colorDelMenu(href: string): string {
  const base = href.split("?")[0];
  if (base.startsWith("/tienda/")) return "#10b981";
  return COLOR_POR_RUTA[base] ?? "#6366f1";
}

/** Los logos de marca ya traen su color: van sobre blanco, sin teñir. */
const esLogoDeMarca = (icon: any) => String(icon?.displayName || "").startsWith("Icono_");

/**
 * El ícono dentro de una baldosa redondeada con su color. `tam` es el lado
 * de la baldosa en píxeles; el ícono ocupa ~60%.
 */
export function IconoDelMenu({
  icon: Icon,
  href,
  tam = 28,
  activo = false,
}: {
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  href: string;
  tam?: number;
  activo?: boolean;
}) {
  const color = colorDelMenu(href);
  const marca = esLogoDeMarca(Icon);
  const lado = `${tam}px`;
  // Clases fijas (Tailwind no genera tamaños calculados en tiempo de ejecución).
  const tamIcono = tam >= 36 ? "h-6 w-6" : tam >= 30 ? "h-5 w-5" : "h-4 w-4";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
      style={{
        width: lado,
        height: lado,
        background: marca ? "#ffffff" : activo ? color : `${color}26`,
        boxShadow: activo ? `0 0 0 2px ${color}55, 0 4px 12px ${color}55` : undefined,
      }}
      aria-hidden="true"
    >
      <Icon className={`${tamIcono} shrink-0`} style={marca ? undefined : { color: activo ? "#ffffff" : color }} />
    </span>
  );
}
