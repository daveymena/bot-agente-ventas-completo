/**
 * Logos oficiales de los servicios con los que se integra VentasPro.
 *
 * Pedido del dueño (08-10-2026): donde la app nombra una marca (WhatsApp,
 * Facebook, Dropi, Mercado Pago…), mostrar su logo y no un ícono genérico
 * (un teléfono, un camión, una tarjeta). Los archivos están en
 * public/integraciones/: los SVG salen de Simple Icons (licencia CC0) con el
 * color oficial y los PNG son el ícono de app que publica cada marca.
 *
 * `iconoMarca` devuelve un componente con la misma forma que un ícono de
 * lucide ({ className }), para usarlo tal cual en los menús.
 */
import type { ComponentType } from "react";

export type Marca =
  | "whatsapp" | "messenger" | "instagram" | "facebook" | "meta" | "telegram"
  | "shopify" | "mercadolibre" | "woocommerce" | "falabella" | "aliexpress" | "dropi"
  | "mercadopago" | "paypal" | "nequi" | "daviplata";

const ARCHIVO: Record<Marca, string> = {
  whatsapp: "whatsapp.svg",
  messenger: "messenger.svg",
  instagram: "instagram.svg",
  facebook: "facebook.svg",
  meta: "meta.svg",
  telegram: "telegram.svg",
  shopify: "shopify.svg",
  mercadolibre: "mercadolibre.png",
  woocommerce: "woocommerce.png",
  falabella: "falabella.png",
  aliexpress: "aliexpress.png",
  dropi: "dropi.png",
  mercadopago: "mercadopago.png",
  paypal: "paypal.svg",
  nequi: "nequi.png",
  daviplata: "daviplata.png",
};

export function LogoMarca({ marca, className = "h-5 w-5" }: { marca: Marca; className?: string }) {
  const archivo = ARCHIVO[marca];
  // Los PNG son íconos de app cuadrados: se redondean como en el celular.
  const redondeo = archivo.endsWith(".png") ? " rounded-[22%]" : "";
  return (
    <img
      src={`/integraciones/${archivo}`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 object-contain${redondeo} ${className}`}
    />
  );
}

const cache = new Map<Marca, ComponentType<{ className?: string }>>();

/** Componente con forma de ícono de lucide, para listas de navegación. */
export function iconoMarca(marca: Marca): ComponentType<{ className?: string }> {
  let c = cache.get(marca);
  if (!c) {
    // El color de texto que traen las clases del menú no aplica a una imagen;
    // se conserva solo el tamaño.
    c = ({ className = "" }) => <LogoMarca marca={marca} className={className.split(" ").filter((k) => !k.startsWith("text-")).join(" ")} />;
    c.displayName = `Icono_${marca}`;
    cache.set(marca, c);
  }
  return c;
}
