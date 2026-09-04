import { darken, readableTextColor, tint } from './color';

/**
 * ============================================================
 * EL "SKIN" DE LA TIENDA — ESTILO MARKET
 * ============================================================
 *
 * Market (la plantilla de Envato que pidió el dueño) no es un diseño de un
 * solo color: se vende con CINCO skins intercambiables. La estructura --barra
 * superior, encabezado con buscador, navegación oscura con el menú vertical de
 * categorías, grillas con borde-- es siempre la misma; lo único que cambia
 * entre skins es el color de acento.
 *
 * Eso resuelve una contradicción que este proyecto arrastraba. El 22/08 la
 * paleta se congeló en el púrpura de otro kit (URBANisty) para que la tienda
 * quedara igual a la referencia, y el 30/08 el mismo dueño pidió que sirviera
 * "para todo estilo". Las dos cosas parecían incompatibles y no lo son: la
 * ESTRUCTURA se copia exacta del template, y el ACENTO sale del color que cada
 * negocio ya eligió en su panel. Una tienda de perros y una de cursos quedan
 * con el mismo esqueleto de mega-tienda y distinto color, que es exactamente
 * cómo se vende Market.
 *
 * ── Por qué no se derivan TODOS los colores del acento ───────────────────
 *
 * Los grises, el borde y la barra oscura son fijos. En Market esos valores no
 * cambian entre skins, y derivarlos del color del dueño fue justo lo que hizo
 * fracasar el intento anterior: alguien elige un amarillo, y el texto gris
 * "derivado" queda ilegible. Solo se deriva lo que de verdad varía.
 */

/** El naranja de Market cuando el negocio todavía no eligió color propio. */
export const ACENTO_POR_DEFECTO = '#F5811F';

/**
 * Las variables CSS de la tienda.
 *
 * ⚠️ Se conservan los nombres `--store-*` a propósito: ProductDetail, Cart y
 * Checkout ya los leen en decenas de clases `bg-[var(--store-primary)]`.
 * Cambiando los VALORES acá, toda la tienda adopta el skin sin tocar una sola
 * de esas páginas. Los `--mk-*` son los que agrega el diseño de Market.
 */
export function skinDeLaTienda(colorDelNegocio?: string | null): React.CSSProperties {
  const acento = normalizarHex(colorDelNegocio) || ACENTO_POR_DEFECTO;

  return {
    // ── Acento: lo único que cambia entre un negocio y otro ───────────────
    '--store-primary': acento,
    '--store-primary-hover': darken(acento, 0.12),
    '--store-on-primary': readableTextColor(acento),
    '--store-primary-soft': tint(acento, 0.94),

    // ── Estructura de Market: igual para todos ────────────────────────────
    // La barra de navegación oscura es la firma del template; no se tiñe del
    // color del negocio porque sobre un acento claro (un amarillo, un lima)
    // el menú blanco se vuelve ilegible.
    '--mk-nav': '#282828',
    '--mk-nav-hover': '#3a3a3a',
    '--mk-topbar': '#F7F7F7',
    '--mk-border': '#E5E5E5',
    '--mk-ink': '#333333',
    '--mk-muted': '#8A8A8A',
    '--mk-panel': '#FAFAFA',

    // Nombres que ya usaban otras páginas. Se mantienen para no romperlas.
    '--store-primary-deep': '#282828',
    '--store-ink': '#282828',
    '--store-yellow': '#FFC931',
    '--store-orange': acento,
    '--store-blue': '#3357D9',
    '--store-green': '#5FB336',
  } as React.CSSProperties;
}

/**
 * Acepta lo que el dueño haya guardado y devuelve un hex usable, o null.
 *
 * El campo del panel es texto libre: llegan valores con y sin `#`, en tres o
 * seis dígitos, y a veces vacíos. Un valor inválido metido directo en una
 * variable CSS no rompe con error: simplemente NO pinta, y la tienda aparece
 * en negro sin que nadie sepa por qué.
 */
function normalizarHex(v?: string | null): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const c = m[1];
  return `#${c.length === 3 ? c.split('').map((x) => x + x).join('') : c}`.toLowerCase();
}
