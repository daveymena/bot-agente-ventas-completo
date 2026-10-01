/**
 * Departamentos de Colombia (32) + Bogotá D.C. con sus principales municipios.
 * Se usa en el formulario de pago contra entrega (ciudad dependiente del departamento).
 */

export interface Department {
  name: string;
  cities: string[];
}

export const COLOMBIA: Department[] = [
  { name: 'Bogotá D.C.', cities: ['Bogotá D.C.'] },
  {
    name: 'Amazonas',
    cities: ['Leticia', 'Puerto Nariño'],
  },
  {
    name: 'Antioquia',
    cities: [
      'Medellín', 'Bello', 'Itagüí', 'Envigado', 'Apartadó', 'Turbo', 'Rionegro', 'Sabaneta',
      'Caucasia', 'La Estrella', 'Copacabana', 'Girardota', 'Barbosa', 'Caldas', 'Marinilla',
      'Guarne', 'El Carmen de Viboral', 'La Ceja', 'Santa Fe de Antioquia', 'Necoclí',
      'Chigorodó', 'Carepa', 'Yarumal', 'Puerto Berrío', 'Segovia', 'Amagá', 'Andes', 'Támesis',
    ],
  },
  {
    name: 'Arauca',
    cities: ['Arauca', 'Arauquita', 'Saravena', 'Tame', 'Fortul', 'Puerto Rondón', 'Cravo Norte'],
  },
  {
    name: 'Atlántico',
    cities: [
      'Barranquilla', 'Soledad', 'Malambo', 'Sabanalarga', 'Puerto Colombia', 'Galapa',
      'Baranoa', 'Santo Tomás', 'Palmar de Varela', 'Sabanagrande', 'Polonuevo', 'Luruaco',
      'Repelón', 'Campo de la Cruz', 'Candelaria', 'Juan de Acosta', 'Tubará', 'Usiacurí',
    ],
  },
  {
    name: 'Bolívar',
    cities: [
      'Cartagena', 'Magangué', 'Turbaco', 'Arjona', 'El Carmen de Bolívar', 'Mompós',
      'San Juan Nepomuceno', 'Santa Rosa del Sur', 'Turbaná', 'María La Baja', 'Simití',
      'San Pablo', 'Clemencia', 'Villanueva', 'Santa Catalina', 'Mahates',
    ],
  },
  {
    name: 'Boyacá',
    cities: [
      'Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá', 'Paipa', 'Puerto Boyacá', 'Villa de Leyva',
      'Garagoa', 'Moniquirá', 'Nobsa', 'Samacá', 'Tibasosa', 'Soatá', 'Guateque', 'Ramiriquí',
      'Barbosa', 'Muzo', 'Aquitania',
    ],
  },
  {
    name: 'Caldas',
    cities: [
      'Manizales', 'La Dorada', 'Chinchiná', 'Villamaría', 'Riosucio', 'Anserma', 'Supía',
      'Neira', 'Palestina', 'Manzanares', 'Aguadas', 'Salamina', 'Pensilvania', 'Viterbo',
    ],
  },
  {
    name: 'Caquetá',
    cities: [
      'Florencia', 'San Vicente del Caguán', 'Puerto Rico', 'El Doncello', 'Curillo',
      'La Montañita', 'Belén de los Andaquíes', 'Cartagena del Chairá', 'El Paujil', 'Albania',
    ],
  },
  {
    name: 'Casanare',
    cities: ['Yopal', 'Aguazul', 'Villanueva', 'Tauramena', 'Paz de Ariporo', 'Monterrey', 'Maní', 'Trinidad', 'Orocué', 'Hato Corozal'],
  },
  {
    name: 'Cauca',
    cities: [
      'Popayán', 'Santander de Quilichao', 'Puerto Tejada', 'Patía (El Bordo)', 'Piendamó',
      'Corinto', 'Miranda', 'Guapi', 'Cajibío', 'Caloto', 'Timbío', 'El Tambo', 'Silvia', 'Morales',
    ],
  },
  {
    name: 'Cesar',
    cities: [
      'Valledupar', 'Aguachica', 'Codazzi', 'La Jagua de Ibirico', 'Bosconia', 'Curumaní',
      'El Copey', 'Chimichagua', 'San Alberto', 'San Diego', 'Pailitas', 'La Paz', 'Becerril',
    ],
  },
  {
    name: 'Chocó',
    cities: ['Quibdó', 'Istmina', 'Tadó', 'Condoto', 'Riosucio', 'Bahía Solano', 'Nuquí', 'Acandí', 'Unguía', 'El Carmen de Atrato'],
  },
  {
    name: 'Córdoba',
    cities: [
      'Montería', 'Lorica', 'Cereté', 'Sahagún', 'Montelíbano', 'Planeta Rica', 'Tierralta',
      'Ciénaga de Oro', 'San Pelayo', 'Puerto Libertador', 'Chinú', 'San Antero', 'Moñitos',
      'Tuchín', 'Ayapel',
    ],
  },
  {
    name: 'Cundinamarca',
    cities: [
      'Soacha', 'Fusagasugá', 'Facatativá', 'Zipaquirá', 'Chía', 'Mosquera', 'Madrid', 'Funza',
      'Girardot', 'Cajicá', 'Sibaté', 'Tocancipá', 'Villeta', 'La Calera', 'Cota', 'Tenjo',
      'Ubaté', 'Pacho', 'Anapoima', 'La Mesa', 'Sopó', 'Gachancipá', 'Guaduas', 'Chocontá',
      'Silvania', 'El Rosal', 'Subachoque', 'Tabio',
    ],
  },
  {
    name: 'Guainía',
    cities: ['Inírida', 'Barranco Minas', 'Mapiripana'],
  },
  {
    name: 'Guaviare',
    cities: ['San José del Guaviare', 'El Retorno', 'Calamar', 'Miraflores'],
  },
  {
    name: 'Huila',
    cities: [
      'Neiva', 'Pitalito', 'Garzón', 'La Plata', 'Campoalegre', 'Palermo', 'Gigante', 'Aipe',
      'San Agustín', 'Rivera', 'Timaná', 'Algeciras', 'Isnos', 'Suaza',
    ],
  },
  {
    name: 'La Guajira',
    cities: ['Riohacha', 'Maicao', 'Uribia', 'Manaure', 'San Juan del Cesar', 'Villanueva', 'Fonseca', 'Barrancas', 'Albania', 'Dibulla', 'Hatonuevo'],
  },
  {
    name: 'Magdalena',
    cities: [
      'Santa Marta', 'Ciénaga', 'Fundación', 'El Banco', 'Plato', 'Aracataca', 'Zona Bananera',
      'Pivijay', 'Santa Ana', 'Guamal', 'Sitionuevo', 'Puebloviejo', 'Algarrobo',
    ],
  },
  {
    name: 'Meta',
    cities: [
      'Villavicencio', 'Acacías', 'Granada', 'Puerto López', 'Puerto Gaitán', 'San Martín',
      'Cumaral', 'Restrepo', 'Castilla La Nueva', 'Vistahermosa', 'Puerto Lleras', 'El Dorado',
    ],
  },
  {
    name: 'Nariño',
    cities: [
      'Pasto', 'Ipiales', 'Tumaco', 'Túquerres', 'La Unión', 'Samaniego', 'Sandoná', 'Barbacoas',
      'El Charco', 'Buesaco', 'La Cruz', 'Guaitarilla', 'Cumbal', 'Pupiales',
    ],
  },
  {
    name: 'Norte de Santander',
    cities: [
      'Cúcuta', 'Ocaña', 'Pamplona', 'Villa del Rosario', 'Los Patios', 'Tibú', 'El Zulia',
      'Chinácota', 'Ábrego', 'Sardinata', 'Puerto Santander', 'Convención', 'Toledo',
    ],
  },
  {
    name: 'Putumayo',
    cities: ['Mocoa', 'Puerto Asís', 'Orito', 'Valle del Guamuez (La Hormiga)', 'Villagarzón', 'Sibundoy', 'San Miguel', 'Puerto Caicedo', 'Colón'],
  },
  {
    name: 'Quindío',
    cities: ['Armenia', 'Calarcá', 'La Tebaida', 'Montenegro', 'Quimbaya', 'Circasia', 'Filandia', 'Salento', 'Córdoba', 'Génova', 'Buenavista', 'Pijao'],
  },
  {
    name: 'Risaralda',
    cities: ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal', 'La Virginia', 'Marsella', 'Belén de Umbría', 'Quinchía', 'Apía', 'Santuario', 'Guática', 'Mistrató', 'Pueblo Rico'],
  },
  {
    name: 'San Andrés y Providencia',
    cities: ['San Andrés', 'Providencia'],
  },
  {
    name: 'Santander',
    cities: [
      'Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja', 'San Gil',
      'Socorro', 'Barbosa', 'Málaga', 'Vélez', 'Sabana de Torres', 'Puerto Wilches',
      'Lebrija', 'Rionegro', 'Zapatoca', 'Charalá', 'Cimitarra',
    ],
  },
  {
    name: 'Sucre',
    cities: [
      'Sincelejo', 'Corozal', 'Sampués', 'San Marcos', 'Tolú', 'Since', 'San Onofre',
      'Majagual', 'Coveñas', 'Los Palmitos', 'Ovejas', 'Galeras', 'Morroa',
    ],
  },
  {
    name: 'Tolima',
    cities: [
      'Ibagué', 'Espinal', 'Melgar', 'Honda', 'Líbano', 'Chaparral', 'Mariquita', 'Guamo',
      'Flandes', 'Purificación', 'Fresno', 'Lérida', 'Cajamarca', 'Venadillo', 'Ortega',
    ],
  },
  {
    name: 'Valle del Cauca',
    cities: [
      'Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Cartago', 'Buga', 'Jamundí', 'Yumbo',
      'Candelaria', 'Florida', 'Pradera', 'Zarzal', 'Roldanillo', 'Sevilla', 'La Unión',
      'Caicedonia', 'Dagua', 'Ginebra', 'El Cerrito', 'Andalucía', 'Bugalagrande',
    ],
  },
  {
    name: 'Vaupés',
    cities: ['Mitú', 'Carurú', 'Taraira'],
  },
  {
    name: 'Vichada',
    cities: ['Puerto Carreño', 'La Primavera', 'Santa Rosalía', 'Cumaribo'],
  },
];

export const DEPARTMENT_NAMES: string[] = COLOMBIA.map((d) => d.name);

export function citiesOf(department: string): string[] {
  return COLOMBIA.find((d) => d.name === department)?.cities ?? [];
}

/** Mapa compacto `{ "Antioquia": ["Medellín", ...] }` para embeber en la landing. */
export function colombiaMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of COLOMBIA) out[d.name] = d.cities;
  return out;
}
