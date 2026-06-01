// Script para organizar Megapacks de Google Drive
// Extrae nombres, organiza por tamaño/precio y crea productos

const fs = require('fs');
const path = require('path');

// URLs de Google Drive (75 productos)
const driveUrls = [
  "https://drive.google.com/drive/folders/1OkiLvS4Jlfohj7f0F9914lnfSfkedM9p?usp=drive_link",
  "https://drive.google.com/drive/folders/1QNbNa7FFOUjU2Wd8fmpAOBJi5XYsPgvJ?usp=drive_link",
  "https://drive.google.com/drive/folders/11UWOG_OjzWAZyyoxl3vpu56_DxLkepqU?usp=drive_link",
  "https://drive.google.com/drive/folders/1HZi8eI8TO7N6x7ld6Z8x4nIlUs1o3tpQ?usp=drive_link",
  "https://drive.google.com/drive/folders/1_wuy7nghjwjf_pJg_IbFWf4fVjfdt_91?usp=drive_link",
  "https://drive.google.com/drive/folders/15A_20cdxgXwDCUEWddY6JMvFjxuwL-8c?usp=drive_link",
  "https://drive.google.com/drive/folders/1h5X8ksJXZGSqdXO6Gp4y6lD1O-Gux7tQ?usp=drive_link",
  "https://drive.google.com/drive/folders/1Mb04K4e0CfYZ5qkdpqQgbE-qsd5IPnVk?usp=drive_link",
  "https://drive.google.com/drive/folders/1XqIgPh-dnpmhed1qT59WVCsIvLcmrr6e?usp=drive_link",
  "https://drive.google.com/drive/folders/1Z-wlfVEa2QAdzVQ1K_ksdUpFSQePKQ9S?usp=drive_link",
  "https://drive.google.com/drive/folders/1wMqUIP3AQxh2mMn_6syfzbp-fHWNqO3e?usp=drive_link",
  "https://drive.google.com/drive/folders/1RFj8bTpKmpn35VH4sRhcT-ATwLE3bVwM?usp=drive_link",
  "https://drive.google.com/drive/folders/1G8ZP5Vg_3Vn1nRtVSkjxYwjXOLzw-XvU?usp=drive_link",
  "https://drive.google.com/drive/folders/1xz8l8aAiIdLDasBThWQ_puHG8ZalDg90?usp=drive_link",
  "https://drive.google.com/drive/folders/1kd7aqgo_cGbpfUs4Vwb7Lae5UiKaPVsU?usp=drive_link",
  "https://drive.google.com/drive/folders/1FZcxqQe9VF4DCZ0rIb3GGGZo1_NMojCn?usp=drive_link",
  "https://drive.google.com/drive/folders/1qbS_Lv1F7JX1xxkQ0tOMpbXV0v1w68VC?usp=drive_link",
  "https://drive.google.com/drive/folders/1THAdOVZlonWGlnrM_6rPL6jVi7WBniAk?usp=drive_link",
  "https://drive.google.com/drive/folders/1w_HG4r7vLkwIKjVZzzHIRp6FCxTUD6Iz?usp=drive_link",
  "https://drive.google.com/drive/folders/1xJh1wJav3yt8-sIJ-eYllP5M_cHmil97?usp=drive_link",
  "https://drive.google.com/drive/folders/1fHSoabb6hBQmQTSs_4NzvAhk11uvrBkX?usp=drive_link",
  "https://drive.google.com/drive/folders/1ZU6ofJ6e67Lwvt8CKnqCWwMvzUoYKncQ?usp=drive_link",
  "https://drive.google.com/drive/folders/1tarxNsTUxXLtSzifWe3P2RUhkpoemAxj?usp=drive_link",
  "https://drive.google.com/drive/folders/1q4y8bAH-NXlu7AvswF4P3VYymxVHQ9hq?usp=drive_link",
  "https://drive.google.com/drive/folders/1Ya5jGHKBPjxIxRZndLrb-iukOWbvkf21?usp=drive_link",
  "https://drive.google.com/drive/folders/1tKE4GiFq3N3odeGjTuU0nrQgOWZUhNgF?usp=drive_link",
  "https://drive.google.com/drive/folders/1qq6HGOrZRAJ4_lCdAlEIzH6LUq9tQBsw?usp=drive_link",
  "https://drive.google.com/drive/folders/15Fmu2UaqGv2GEXplj91M6FQouARkR8dV?usp=drive_link",
  "https://drive.google.com/drive/folders/1KEUL5j1HDT8J-J1MqmQ2jaGKyxlMDW_9?usp=drive_link",
  "https://drive.google.com/drive/folders/1uPiwtsCDryHF-LyHaHvXpv0Ebl1ck9a9?usp=drive_link",
  "https://drive.google.com/drive/folders/1xM6IylsuIHADmfVftmHYsAmRJfnwuNJo?usp=drive_link",
  "https://drive.google.com/drive/folders/1IliKLCntPplMNUCGs_5inAkCufOwXBis?usp=drive_link",
  "https://drive.google.com/drive/folders/1oXsN2hX8byp7n9czuCRaDUONILxYdlml?usp=drive_link",
  "https://drive.google.com/drive/folders/1gmsr943dcsgm5y1AcAoXOD_vGRRKhVr2?usp=drive_link",
  "https://drive.google.com/drive/folders/1lIYXk7__af6HRWzXx3V-mlTYHUJpE4fY?usp=drive_link",
  "https://drive.google.com/drive/folders/1rCmKvDqhSqAYLXDhow-QieKTd_1vYE-Z?usp=drive_link",
  "https://drive.google.com/drive/folders/1oha877iB_Z6Kmh7uC0jYuzCGzpvfDDp_?usp=drive_link",
  "https://drive.google.com/drive/folders/1OpQx43DWRLZsJ3nt9iYOniidr_nUAeL3?usp=drive_link",
  "https://drive.google.com/drive/folders/1VM5FV7rWMYhZiG5sNUNIkudqagm3Qedp?usp=drive_link",
  "https://drive.google.com/drive/folders/1GUzgDNtq43nkJQYPc_EnUAajansWw9mS?usp=drive_link",
  "https://drive.google.com/drive/folders/12cf-oPboTkEcNnQswHtulpiOd5mjp-rU?usp=drive_link",
  "https://drive.google.com/drive/folders/1IzcVPqeJFviIj1adOG5Wevv-A3ue3rce?usp=drive_link",
  "https://drive.google.com/drive/folders/1lwkmabZu6_tueSkTbD8tqjW_s5pQ-G9j?usp=drive_link",
  "https://drive.google.com/drive/folders/18bLJSGnUktHpQCkrhgxNbmdLoVQ3Uw8j?usp=drive_link",
  "https://drive.google.com/drive/folders/1c8WbPa5DUn60kOFQDnzYIJ4konRonYBb?usp=drive_link",
  "https://drive.google.com/drive/folders/1wKh-TGJG5Xns9AN2mUbfgWQ5VgM4gtpf?usp=drive_link",
  "https://drive.google.com/drive/folders/1mNtIyWf4OcJE6mBZYuWI3GJoKu5kjMGs?usp=drive_link",
  "https://drive.google.com/drive/folders/1FJRHM-F1DSQPCMUZ_XZVRNYdiUYYwvBd?usp=drive_link",
  "https://drive.google.com/drive/folders/1FlbQPrKD9Xnl-s12b_IwYfXbnH-lGITy?usp=drive_link",
  "https://drive.google.com/drive/folders/1_yU91jX7qhFoAZotKxFSQp97Df1yWJIq?usp=drive_link",
  "https://drive.google.com/drive/folders/11yNE6hP-O3plYkJ51uEnqqAUSDpeIHcR?usp=drive_link",
  "https://drive.google.com/drive/folders/1TYkP23mP2XwusI610eDzU-b6UkXdH039?usp=drive_link",
  "https://drive.google.com/drive/folders/17wfcNztBCJKH76KkyQ0Y3dTRo_1Yvv9m?usp=drive_link",
  "https://drive.google.com/drive/folders/1A7HNo0Udc8GDGRwL75illMjkhUXBlMsT?usp=drive_link",
  "https://drive.google.com/drive/folders/1cnkyxl_sy4xwxx6pxtRmcceYGHsRwQYO?usp=drive_link",
  "https://drive.google.com/drive/folders/1k8YJ1_VLfStY3VTAr5NXM5150EHDhB_Z?usp=drive_link",
  "https://drive.google.com/drive/folders/1L9ibzLVoC4ui05TPVHKSH1xwe2UnTwX3?usp=drive_link",
  "https://drive.google.com/drive/folders/1I6NboyUItOOcqiaNDgo44nwQqCkd9e_l?usp=drive_link",
  "https://drive.google.com/drive/folders/1uVXzzL_aJAcc9WfNwNvLztoHTX_Ebosd?usp=drive_link",
  "https://drive.google.com/drive/folders/1jyqiiV6lELw7wfPVe5Oaq2TliSwwhAGs?usp=drive_link",
  "https://drive.google.com/drive/folders/1gdyCA5It2qtpyMD4jF_sGfX63Do8bmKW?usp=drive_link",
  "https://drive.google.com/drive/folders/1G1LVh9ENN7UoROGm-zXla9YkYydHpNzh?usp=drive_link",
  "https://drive.google.com/drive/folders/1GlFylHZSijsVv7ibX0Qf6armpasr9oDj?usp=drive_link",
  "https://drive.google.com/drive/folders/1Rxc7dwMcUB54HLjsbzW7cQIW31nXrnzw?usp=drive_link",
  "https://drive.google.com/drive/folders/1f2fpt8pA535h5EDGBTA8Bxu0wmEIOHZy?usp=drive_link",
  "https://drive.google.com/drive/folders/1LmnN1URGfJgJ_c0yQ682y2rpfrznGriy?usp=drive_link",
  "https://drive.google.com/drive/folders/18BBOqD7rZzqLOtmkrTOWXtQCBVki9Fdy?usp=drive_link",
  "https://drive.google.com/drive/folders/1DHfAMFXd9u_F7AHmpMLeOYouHLNNTiMs?usp=drive_link",
  "https://drive.google.com/drive/folders/1KY5XUrO8VuIkvflY-yFqLudIxBjhglHS?usp=drive_link",
  "https://drive.google.com/drive/folders/196SMTqFc91IW0pxXhWj0fiYGxJYCzF8m?usp=drive_link",
  "https://drive.google.com/drive/folders/1fg_SpIlaJ59bH-jH91nT_pTjGfshuXop?usp=drive_link",
  "https://drive.google.com/drive/folders/1YFZ3IjUZjiBFYkgKyuADHVseSOQ7w0EF?usp=drive_link",
  "https://drive.google.com/drive/folders/1BwOD8G8DNRIFEOu97mBqdMtohyT8tNl5?usp=drive_link",
  "https://drive.google.com/drive/folders/1OfYcPn5UnlwBZ15GNGCyToVCv4xhaEUb?usp=drive_link",
  "https://drive.google.com/drive/folders/154AjtnTpPp8Xy7gqClutmEA5ByV3UELe?usp=drive_link",
  "https://drive.google.com/drive/folders/1-RIJyRowZR_Wvh7tmg6A7p4kI8bspqrJ?usp=drive_link",
  "https://drive.google.com/drive/folders/1udXRUHpa_pPPusFaF8zHpJTrcv_1iFF5?usp=drive_link",
  "https://drive.google.com/drive/folders/1zSaSxFPK2OVx8XlXc3Exw2LhNizdk5r3?usp=drive_link",
  "https://drive.google.com/drive/folders/1DhqmwTVl1pRgkz2fUBVassqi7TfCy2Ko?usp=drive_link",
  "https://drive.google.com/drive/folders/1YnIPCyHnYkSsqhihaeEC_tqXPm5YNxfE?usp=drive_link",
  "https://drive.google.com/drive/folders/1cC2KxNIKN0cNywfqKnmHvWVuyOI-F4k9?usp=drive_link"
];

// Función para extraer el ID de la URL
function extractDriveId(url) {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Función para generar nombre del Megapack basado en el ID
function generateMegapackName(id, index) {
  // Los primeros IDs parecen ser los más grandes (Mega Pack 1, 2, 3...)
  // Los últimos IDs parecen ser los más pequeños
  const total = driveUrls.length;
  const position = total - index; // Invertido: primeros son más grandes
  
  if (position <= 5) return `MEGAPACK ULTRA ${position}`;
  if (position <= 15) return `MEGAPACK PLUS ${position - 5}`;
  if (position <= 30) return `MEGAPACK PRO ${position - 15}`;
  if (position <= 50) return `MEGAPACK BASIC ${position - 30}`;
  return `MEGAPACK STANDARD ${position - 50}`;
}

// Función para generar descripción
function generateDescription(name, index) {
  const features = [
    "Acceso permanente",
    "Contenido actualizable",
    "Soporte técnico",
    "Descargas ilimitadas",
    "Material exclusivo"
  ];
  
  return `El ${name} incluye acceso completo a todos los recursos, actualizaciones perpetuas y soporte prioritario. Ideal para usuarios que buscan el máximo valor.`;
}

// Función para generar precio basado en posición (de mayor a menor)
function generatePrice(index) {
  const total = driveUrls.length;
  const position = total - index; // Primeros son más caros
  
  // Escala de precios: de $199.99 a $49.99
  const basePrice = 199.99;
  const minPrice = 49.99;
  const step = (basePrice - minPrice) / (total - 1);
  
  return (basePrice - (step * (position - 1))).toFixed(2);
}

// Procesar todos los URLs
const products = driveUrls.map((url, index) => {
  const driveId = extractDriveId(url);
  const name = generateMegapackName(driveId, index);
  
  return {
    id: index + 1,
    name: name,
    description: generateDescription(name, index),
    price: parseFloat(generatePrice(index)),
    currency: "USD",
    category: "Megapacks",
    kind: "digital",
    image_url: `https://drive.google.com/thumbnail?sz=w400&id=${driveId}`,
    drive_folder_id: driveId,
    drive_url: url,
    features: [
      "150+ clases",
      "Acceso permanente",
      "Soporte 24/7",
      "Actualizaciones gratis",
      "Certificado de finalización"
    ],
    deliveryLink: url
  };
});

// Guardar como JSON
const outputPath = path.join(__dirname, 'megapacks-organized.json');
fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));

console.log(`✅ Procesados ${products.length} Megapacks`);
console.log(`📄 Guardado en: ${outputPath}`);
console.log('\n📋 Productos organizados (de mayor a menor):');
products.forEach((p, i) => {
  console.log(`${i + 1}. ${p.name} - $${p.price} - ID: ${p.drive_folder_id}`);
});

// Mostrar resumen
const categories = {
  "MEGAPACK ULTRA": products.filter(p => p.name.includes("ULTRA")).length,
  "MEGAPACK PLUS": products.filter(p => p.name.includes("PLUS")).length,
  "MEGAPACK PRO": products.filter(p => p.name.includes("PRO")).length,
  "MEGAPACK BASIC": products.filter(p => p.name.includes("BASIC")).length,
  "MEGAPACK STANDARD": products.filter(p => p.name.includes("STANDARD")).length
};

console.log('\n📊 Resumen por categoría:');
Object.entries(categories).forEach(([cat, count]) => {
  console.log(`   ${cat}: ${count} productos`);
});
