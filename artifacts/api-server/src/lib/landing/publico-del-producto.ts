/**
 * ¿PARA QUIÉN ES EL PRODUCTO? → colores y lenguaje de la landing
 * ==============================================================
 *
 * Pedido del dueño (23-09-2026): "coherencia en cada landing según el
 * producto: si es unisex, colores neutros; si es para mujer, colores
 * femeninos; si es para hombre, colores de forma masculina; si es para niños,
 * colores de niños. Todo profesional."
 *
 * Hasta acá el color salía del color más saturado de la foto o del RUBRO, y
 * el rubro lo pone Dropi: los correctores de postura venían en "Belleza y
 * cuidado personal" (→ rosa #D63384) aunque la ficha dijera "unisex, para
 * hombres y mujeres". El público manda sobre el rubro.
 *
 * Se lee de lo que escribió el dueño o el proveedor (nombre, categoría,
 * descripción, características): es dato del PRODUCTO, no una interpretación
 * de lo que escribe un cliente. Sin señales, "general": no se fuerza nada.
 */

export type Publico = "unisex" | "mujer" | "hombre" | "ninos" | "bebes" | "general";

export interface LecturaDePublico {
  publico: Publico;
  /** La palabra que lo decidió, para poder explicarlo y corregirlo. */
  senal: string | null;
  porque: string;
}

export interface PaletaDePublico {
  /** Acento para botones, precio y destacados. */
  acento: string;
  /** Segundo color, para detalles e íconos. */
  secundario: string;
  /** Fondo suave de secciones. */
  tinte: string;
  /** Texto encima del acento. */
  sobreAcento: string;
  /** Cómo tiene que sentirse, en palabras (va al agente de la landing). */
  tono: string;
  /** Cómo hablarle a ese público (va al agente de la landing). */
  lenguaje: string;
  /** Lo que NO se usa con este público. */
  evitar: string;
}

const N = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Palabra entera (o frase) dentro del texto normalizado. */
function tiene(texto: string, clave: string): boolean {
  const esc = clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}(?![a-z0-9])`).test(texto);
}

const UNISEX = ["unisex", "hombre y mujer", "hombres y mujeres", "mujer y hombre", "mujeres y hombres", "hombre o mujer", "mujer o hombre", "para ambos sexos", "ambos generos", "para el y para ella", "dama y caballero", "damas y caballeros"];
const BEBES = ["bebe", "bebes", "recien nacido", "recien nacidos", "lactancia", "panal", "panales", "cuna", "biberon", "tetero", "maternidad"];
const NINOS = ["nino", "ninos", "nina", "ninas", "infantil", "infantiles", "kids", "escolar", "escolares", "montessori", "juguete", "juguetes", "para chicos"];
const MUJER = ["mujer", "mujeres", "dama", "damas", "femenino", "femenina", "para ella", "embarazada", "embarazadas", "brasier", "sosten", "cintura delgada", "moldeadora", "moldeador"];
// Sin "para él": normalizado queda "para el", que es "para el dolor",
// "para el hogar"... cualquier cosa.
const HOMBRE = ["hombre", "hombres", "caballero", "caballeros", "masculino", "masculina", "barba", "afeitadora", "afeitar"];

function primera(texto: string, lista: string[]): string | null {
  return lista.find((c) => tiene(texto, c)) ?? null;
}

export function publicoDelProducto(p: {
  nombre?: string | null;
  categoria?: string | null;
  descripcion?: string | null;
  caracteristicas?: unknown;
  /** products.kind. En un digital las "características" son la lista de contenidos. */
  tipo?: string | null;
}): LecturaDePublico {
  // En un pack digital las características son el ÍNDICE ("COMIDA PARA
  // BEBES" es una de las 28 secciones del recetario GASTRONOMÍA), no a quién
  // va dirigido. Solo cuentan en productos físicos.
  const esDigital = !!p.tipo && !/physical|fisico|dropshipping/i.test(String(p.tipo));
  const feats = !esDigital && Array.isArray(p.caracteristicas) ? (p.caracteristicas as unknown[]).join(" ") : "";
  // Qué pesa: nombre, categoría, características y el RESUMEN de la
  // descripción (sus primeros ~180 caracteres). Medido sobre los 151
  // productos reales (23-09-2026): con la descripción entera, "GASTRONOMÍA"
  // salía para bebés por un ítem de una lista de 292 recetas ("comida para
  // bebés"), las pulseras de chakras para mujer por la propiedad de una
  // piedra, y un kit capilar para hombre por un síntoma. Eso no dice PARA
  // QUIÉN es el producto.
  const resumen = String(p.descripcion || "").slice(0, 180);
  const texto = N([p.nombre, p.categoria, feats, resumen].filter(Boolean).join(" "));
  // La declaración de unisex sí se busca en toda la descripción: es
  // explícita ("puede ser usada por hombres y mujeres") y no confunde.
  const textoCompleto = N([p.nombre, p.categoria, feats, p.descripcion].filter(Boolean).join(" "));

  // 1. Unisex explícito manda sobre todo: "faja para hombres y mujeres" tiene
  //    las dos palabras sueltas y no es de ninguno de los dos.
  const u = primera(textoCompleto, UNISEX);
  if (u) return { publico: "unisex", senal: u, porque: `El producto dice "${u}": colores neutros, le habla a los dos.` };

  // 2. Bebés y niños antes que mujer/hombre: "ropa de niña" es para niños.
  const b = primera(texto, BEBES);
  if (b) return { publico: "bebes", senal: b, porque: `El producto es para bebés ("${b}"): pasteles suaves, confianza y cuidado.` };
  const k = primera(texto, NINOS);
  if (k) return { publico: "ninos", senal: k, porque: `El producto es para niños ("${k}"): colores alegres y claros.` };

  // 3. Mujer / hombre. Si aparecen los dos, es para los dos.
  const m = primera(texto, MUJER);
  const h = primera(texto, HOMBRE);
  if (m && h) return { publico: "unisex", senal: `${m} + ${h}`, porque: `El producto nombra a los dos ("${m}" y "${h}"): colores neutros.` };
  if (m) return { publico: "mujer", senal: m, porque: `El producto es para mujer ("${m}"): paleta femenina y elegante.` };
  if (h) return { publico: "hombre", senal: h, porque: `El producto es para hombre ("${h}"): paleta sobria y masculina.` };

  return { publico: "general", senal: null, porque: "El producto no dice para quién es: se usa el color del producto o del rubro." };
}

/**
 * Las paletas. Pensadas para verse PROFESIONALES, no de feria: acentos con
 * suficiente contraste para un botón (texto blanco encima) y tintes muy
 * suaves para los fondos.
 */
export const PALETAS: Record<Exclude<Publico, "general">, PaletaDePublico> = {
  unisex: {
    acento: "#1F2937",       // grafito
    secundario: "#0F766E",   // verde azulado sobrio
    tinte: "#F3F4F6",
    sobreAcento: "#FFFFFF",
    tono: "Neutro, sobrio y confiable: grafito, gris y blanco, con un verde azulado como detalle.",
    lenguaje: "Hablale a hombres y mujeres por igual: nada de \"para ella\" ni \"para él\"; fotos o ejemplos de los dos cuando haya.",
    evitar: "Rosas, lilas, fucsias y degradados pastel.",
  },
  mujer: {
    acento: "#B03A67",       // rosa profundo (no chicle)
    secundario: "#7C4D8B",   // malva
    tinte: "#FBF1F4",
    sobreAcento: "#FFFFFF",
    tono: "Femenino y elegante: rosa profundo, malva y blancos cálidos. Delicado pero con contraste, no infantil.",
    lenguaje: "Hablale a ella, en femenino y con calidez; beneficios de cómo se va a sentir y verse.",
    evitar: "Rosa chicle saturado, brillos y exceso de corazones: que se vea de marca, no de juguete.",
  },
  hombre: {
    acento: "#1E3A5F",       // azul marino
    secundario: "#3F6212",   // verde oliva
    tinte: "#EEF2F6",
    sobreAcento: "#FFFFFF",
    tono: "Masculino y sobrio: azul marino, gris carbón y verde oliva. Líneas rectas, contraste alto.",
    lenguaje: "Hablale a él, directo y concreto: qué resuelve, cómo se usa, cuánto dura.",
    evitar: "Rosas, lilas, pasteles y tipografías caligráficas.",
  },
  ninos: {
    acento: "#E8590C",       // naranja alegre
    secundario: "#1C7ED6",   // azul cielo intenso
    tinte: "#FFF8E6",
    sobreAcento: "#FFFFFF",
    tono: "Alegre, claro y seguro: naranja, azul cielo y amarillo suave. Formas redondeadas.",
    lenguaje: "Hablale al papá o a la mamá (es quien compra): seguridad, que es para su edad, que le va a gustar.",
    evitar: "Negros y grises pesados, y estética oscura.",
  },
  bebes: {
    acento: "#4F86B8",       // azul suave con contraste para botón
    secundario: "#E58FA8",   // rosa pastel
    tinte: "#F2F7FB",
    sobreAcento: "#FFFFFF",
    tono: "Suave y tierno: azul y rosa pastel, crema y mucho blanco. Calma y confianza.",
    lenguaje: "Hablale a la mamá o al papá: seguridad, materiales suaves, cuidado del bebé.",
    evitar: "Colores chillones, negros y contrastes agresivos.",
  },
};

export function paletaDelPublico(publico: Publico): PaletaDePublico | null {
  return publico === "general" ? null : PALETAS[publico];
}
