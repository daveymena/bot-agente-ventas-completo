// Script para generar productos con información completa desde nombres reales de Google Drive
const fs = require('fs');
const path = require('path');

// Leer los nombres extraídos
const driveNamesPath = path.join(__dirname, 'drive-names-extracted.json');
const driveNames = JSON.parse(fs.readFileSync(driveNamesPath, 'utf8'));

// Leer las URLs originales
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

// Función para limpiar el nombre (quitar emoji y número inicial)
function cleanProductName(name) {
  // Quitar emoji 📂 y número inicial (ej: "📂81. ")
  return name.replace(/^📂\d+\.\s*/, '').trim();
}

// Función para determinar la categoría basada en el nombre
function getCategory(name) {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('comic') || nameLower.includes('diseño gráfico') || nameLower.includes('diseño gráfico')) {
    return 'Diseño Gráfico';
  }
  if (nameLower.includes('idioma') || nameLower.includes('inglés') || nameLower.includes('idiomas')) {
    return 'Idiomas';
  }
  if (nameLower.includes('programación') || nameLower.includes('desarrollo web') || nameLower.includes('excel')) {
    return 'Programación';
  }
  if (nameLower.includes('marketing') || nameLower.includes('seo')) {
    return 'Marketing';
  }
  if (nameLower.includes('fotografía') || nameLower.includes('fotomontaje')) {
    return 'Fotografía';
  }
  if (nameLower.includes('música') || nameLower.includes('dj') || nameLower.includes('producción')) {
    return 'Música';
  }
  if (nameLower.includes('fitness') || nameLower.includes('gimnasio') || nameLower.includes('gastronomía')) {
    return 'Salud y Deporte';
  }
  if (nameLower.includes('reparación') || nameLower.includes('computadora') || nameLower.includes('celular')) {
    return 'Tecnología';
  }
  if (nameLower.includes('arquitectura') || nameLower.includes('construcción') || nameLower.includes('obras')) {
    return 'Construcción';
  }
  if (nameLower.includes('psicología') || nameLower.includes('educación') || nameLower.includes('aula')) {
    return 'Educación';
  }
  if (nameLower.includes('libro') || nameLower.includes('books')) {
    return 'Libros';
  }
  
  return 'General';
}

// Función para generar descripción basada en el nombre
function generateDescription(name) {
  const cleanName = cleanProductName(name);
  return `Acceso completo a ${cleanName}. Contenido actualizable, soporte técnico y descargas ilimitadas. Ideal para aprender y crecer profesionalmente.`;
}

// Función para generar features basadas en el nombre
function generateFeatures(name) {
  const cleanName = cleanProductName(name);
  const features = [
    "Acceso permanente",
    "Contenido actualizable",
    "Soporte técnico",
    "Descargas ilimitadas"
  ];
  
  // Agregar features específicas según el nombre
  if (cleanName.toLowerCase().includes('idioma') || cleanName.toLowerCase().includes('inglés')) {
    features.push("Cursos de conversación");
    features.push("Gramática y pronunciación");
  }
  if (cleanName.toLowerCase().includes('diseño') || cleanName.toLowerCase().includes('grafico')) {
    features.push("Herramientas de diseño");
    features.push("Proyectos prácticos");
  }
  if (cleanName.toLowerCase().includes('programación') || cleanName.toLowerCase().includes('web')) {
    features.push("Código fuente");
    features.push("Proyectos reales");
  }
  if (cleanName.toLowerCase().includes('fotografía') || cleanName.toLowerCase().includes('fotomontaje')) {
    features.push("Edición profesional");
    features.push("Técnicas avanzadas");
  }
  
  return features;
}

// Función para generar precio basado en el índice (de mayor a menor)
function generatePrice(index, total) {
  // Los primeros (más grandes) son más caros
  const position = total - index;
  const basePrice = 199.99;
  const minPrice = 49.99;
  const step = (basePrice - minPrice) / (total - 1);
  
  return (basePrice - (step * (position - 1))).toFixed(2);
}

// Procesar todos los productos
const products = driveNames.map((item, index) => {
  const cleanName = cleanProductName(item.name);
  const total = driveNames.length;
  
  return {
    id: index + 1,
    name: cleanName,
    description: generateDescription(item.name),
    price: parseFloat(generatePrice(index, total)),
    currency: "USD",
    category: getCategory(item.name),
    kind: "digital",
    image_url: `https://drive.google.com/thumbnail?sz=w400&id=${item.id}`,
    drive_folder_id: item.id,
    drive_url: driveUrls[index],
    features: generateFeatures(item.name),
    deliveryLink: driveUrls[index]
  };
});

// Guardar como JSON
const outputPath = path.join(__dirname, 'products-full.json');
fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));

console.log(`✅ Generados ${products.length} productos con información completa`);
console.log(`📄 Guardado en: ${outputPath}`);
console.log('\n📋 Productos generados:');
products.forEach((p, i) => {
  console.log(`${i + 1}. ${p.name} - $${p.price} - ${p.category}`);
});

// Mostrar resumen por categoría
const categories = {};
products.forEach(p => {
  categories[p.category] = (categories[p.category] || 0) + 1;
});

console.log('\n📊 Resumen por categoría:');
Object.entries(categories).forEach(([cat, count]) => {
  console.log(`   ${cat}: ${count} productos`);
});
