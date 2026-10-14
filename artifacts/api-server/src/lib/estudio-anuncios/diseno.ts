/**
 * Estudio de anuncios — punto de entrada del modelo de diseño.
 *
 * El esquema (capas, formatos, validación) vive en esquema.ts; las maquetas
 * en maquetas.ts; estilos y temas en estilos.ts / temas.ts; las escenas y
 * guiones de vídeo en escenas.ts. Este archivo lo reexporta todo para que el
 * resto del servidor (y las pruebas) sigan importando desde "./diseno".
 */
export * from "./esquema";
export * from "./maquetas";
export * from "./escenas";
export { ESTILOS, ESTILOS_BASE, estiloPorId, resolverEstilo, botonPara, resumenDeEstilos, estiloDePaleta, type Estilo, type EstiloResuelto, type Paleta } from "./estilos";
export { TEMAS, TEMAS_LISTA, temaPorId, decoracionesDeTema, cintaDeTema, resumenDeTemas, type Tema, type Decoracion } from "./temas";
