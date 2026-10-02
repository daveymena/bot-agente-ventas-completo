/**
 * Datos de envío para pago CONTRA ENTREGA.
 *
 * Los nombres de los campos y cuáles son obligatorios son los MISMOS que usa
 * el bot de WhatsApp (`CAMPOS_DE_ENVIO` en api-server/src/lib/dropshipping.ts)
 * y los mismos que guarda la tabla `dropshipping_orders`. Si acá se llamaran
 * distinto, el pedido tomado en la tienda llegaría incompleto a la
 * transportadora mientras el del bot llega bien.
 *
 * El orden también viene de allá y es deliberado: se arranca por lo que la
 * gente ya tiene en la cabeza (nombre, ciudad) y la cédula queda de última,
 * que es la que más fricción genera.
 */
export interface DatosDeEnvio {
  nombre: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  barrio: string;
  telefono: string;
  documento: string;
  notas: string;
}

export const ENVIO_VACIO: DatosDeEnvio = {
  nombre: '', ciudad: '', departamento: '', direccion: '',
  barrio: '', telefono: '', documento: '', notas: '',
};

/** Obligatorios, en el orden en que se piden. Espejo de CAMPOS_DE_ENVIO. */
export const CAMPOS_OBLIGATORIOS: Array<keyof DatosDeEnvio> = [
  'nombre', 'ciudad', 'departamento', 'direccion', 'telefono', 'documento',
];

export const ETIQUETAS: Record<keyof DatosDeEnvio, string> = {
  nombre: 'Nombre completo de quien recibe',
  ciudad: 'Ciudad',
  departamento: 'Departamento',
  direccion: 'Dirección exacta',
  barrio: 'Barrio',
  telefono: 'Celular de contacto',
  documento: 'Cédula',
  notas: 'Indicaciones para la entrega',
};

export function faltantes(d: DatosDeEnvio): Array<keyof DatosDeEnvio> {
  return CAMPOS_OBLIGATORIOS.filter(c => !String(d[c] ?? '').trim());
}

/**
 * La transportadora rechaza cédulas y celulares mal formados, y eso aparece
 * recién al despachar -- cuando el cliente ya se fue. Se valida acá, donde
 * todavía se puede corregir. Los rangos son los que ya usa el lector de texto
 * libre del bot (extraerDatosDeEnvio): documento 6-10 dígitos, celular 10.
 */
export function errorDeFormato(d: DatosDeEnvio): string | null {
  const doc = d.documento.replace(/\D/g, '');
  if (doc && (doc.length < 6 || doc.length > 10)) {
    return 'La cédula debe tener entre 6 y 10 dígitos.';
  }
  const tel = d.telefono.replace(/\D/g, '');
  if (tel && tel.length < 10) {
    return 'El celular debe tener 10 dígitos (ej. 300 123 4567).';
  }
  return null;
}

/** Departamentos de Colombia. Se elige de una lista y no se escribe libre
 *  porque "Cundinamarca" mal escrito frena el despacho. */
export const DEPARTAMENTOS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar',
  'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó',
  'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira',
  'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío',
  'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima',
  'Valle del Cauca', 'Vaupés', 'Vichada',
];

/** Si escriben una ciudad grande, el departamento se deduce solo -- un campo
 *  menos que llenar. Mismo mapa que usa el bot. */
const CIUDAD_A_DEPARTAMENTO: Record<string, string> = {
  bogota: 'Bogotá D.C.', medellin: 'Antioquia', cali: 'Valle del Cauca',
  barranquilla: 'Atlántico', cartagena: 'Bolívar', cucuta: 'Norte de Santander',
  bucaramanga: 'Santander', pereira: 'Risaralda', 'santa marta': 'Magdalena',
  ibague: 'Tolima', manizales: 'Caldas', villavicencio: 'Meta', pasto: 'Nariño',
  monteria: 'Córdoba', neiva: 'Huila', armenia: 'Quindío', popayan: 'Cauca',
  sincelejo: 'Sucre', valledupar: 'Cesar', tunja: 'Boyacá', riohacha: 'La Guajira',
  quibdo: 'Chocó', florencia: 'Caquetá', yopal: 'Casanare', arauca: 'Arauca',
  mocoa: 'Putumayo', leticia: 'Amazonas', envigado: 'Antioquia',
  itagui: 'Antioquia', bello: 'Antioquia', soacha: 'Cundinamarca',
  soledad: 'Atlántico', palmira: 'Valle del Cauca', buenaventura: 'Valle del Cauca',
};

export function departamentoDeCiudad(ciudad: string): string | null {
  // Se quitan las tildes antes de buscar: la gente escribe "Medellin" tanto
  // como "Medellín", y el mapa está sin tildes.
  const limpia = ciudad
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  return CIUDAD_A_DEPARTAMENTO[limpia] || null;
}

/**
 * Ciudades principales por departamento, para el selector del checkout.
 * No es la lista completa de Colombia (son ~1.100 municipios): son las
 * ciudades donde realmente llegan las transportadoras de Dropi. Si el
 * cliente está en un municipio pequeño, escribe el nombre y el campo lo
 * acepta igual (el input tiene `list` = datalist con estas opciones).
 */
export const CIUDADES_POR_DEPARTAMENTO: Record<string, string[]> = {
  'Amazonas': ['Leticia', 'Puerto Nariño'],
  'Antioquia': ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Apartadó', 'Turbo', 'Poblado'],
  'Arauca': ['Arauca', 'Tame'],
  'Atlántico': ['Barranquilla', 'Soledad', 'Sabanalarga', 'Puerto Colombia'],
  'Bogotá D.C.': ['Bogotá D.C.', 'Usaquén', 'Chapinero', 'Kennedy'],
  'Bolívar': ['Cartagena', 'Barranquilla', 'Magangué', 'Turbaco'],
  'Boyacá': ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá'],
  'Caldas': ['Manizales', 'Villamaría', 'La Dorada'],
  'Caquetá': ['Florencia', 'San Vicente del Caguán'],
  'Casanare': ['Yopal', 'Aguazul'],
  'Cauca': ['Popayán', 'Santander de Quilichao'],
  'Cesar': ['Valledupar', 'Bosconia'],
  'Chocó': ['Quibdó', 'Istmina'],
  'Córdoba': ['Montería', 'Cereté', 'Sahagún'],
  'Cundinamarca': ['Soacha', 'Zipaquirá', 'Facatativá', 'Fusagasugá', 'Chía', 'Cajicá', 'Villapinzón'],
  'Guainía': ['Inírida'],
  'Guaviare': ['San José del Guaviare'],
  'Huila': ['Neiva', 'Pitalito', 'Garzón'],
  'La Guajira': ['Riohacha', 'Maicao', 'Uribia'],
  'Magdalena': ['Santa Marta', 'Ciénaga', 'Fundación'],
  'Meta': ['Villavicencio', 'Acacías', 'Granada'],
  'Nariño': ['Pasto', 'Tumaco', 'Ipiales'],
  'Norte de Santander': ['Cúcuta', 'Ocaña', 'Pamplona'],
  'Putumayo': ['Mocoa', 'Puerto Asís'],
  'Quindío': ['Armenia', 'Calarcá', 'Montenegro'],
  'Risaralda': ['Pereira', 'Dosquebradas', 'La Virginia'],
  'San Andrés y Providencia': ['San Andrés'],
  'Santander': ['Bucaramanga', 'Floridablanca', 'Girón', 'Barrancabermeja'],
  'Sucre': ['Sincelejo', 'Corozal'],
  'Tolima': ['Ibagué', 'Melgar', 'Espinal'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Buga', 'Jamundí'],
  'Vaupés': ['Mitú'],
  'Vichada': ['Puerto Carreño'],
};
