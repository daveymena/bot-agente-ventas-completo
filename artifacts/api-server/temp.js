import { renderizarLandingEstilo } from "./src/lib/landing/renderer-estilo.js";

const a = {
  tenantId: 1,
  row: { name: "Mochila Antirrobo", slug: "mochila-antirrobo", sections: [], design: { estilo: "cod", estiloExtras: {} } },
  producto: {
    id: 123,
    name: "Mochila Antirrobo Manos Libres",
    description: "Seguridad y estilo para tu día a día",
    price: 5500000,
    imageUrl: "https://example.com/hero.jpg",
    images: ["https://example.com/1.jpg","https://example.com/2.jpg"],
    metadata: { dropiProductId: 9999 }
  },
  preview: true,
  pago: {}
};

renderizarLandingEstilo(a).then(html => console.log(html)).catch(err => console.error(err));
