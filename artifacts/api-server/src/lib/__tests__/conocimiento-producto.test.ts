import { describe, it, expect } from "vitest";
import {
  responderPregunta, preguntasSinResponder, tieneConocimiento, aperturaPara,
} from "../conocimiento-producto";

/**
 * Cuando el cliente preguntaba algo que no estaba en la ficha, el modelo lo
 * respondía de memoria. De ahí salieron el "certificado de participación"
 * inventado, el "Portuñol" como idioma y los plazos de entrega imaginarios.
 *
 * Acá cada pregunta conocida tiene UNA respuesta escrita por el negocio.
 */
const PIANO = 123;
const PERRO = 76;

describe("las preguntas de siempre tienen respuesta verificada", () => {
  it("certificado: dice que NO, que es lo que declara el negocio", () => {
    const r = responderPregunta(PIANO, "y trae certificado?");
    expect(r?.texto).toMatch(/no emite certificado/i);
    expect(r?.sinResponder).toBe(false);
  });

  it("garantía: 7 días, como está en el perfil", () => {
    expect(responderPregunta(PIANO, "tiene garantia?")?.texto).toMatch(/7 d[ií]as/);
  });

  it("presencial: dice que es online, no inventa una sede", () => {
    // "¿Dónde es la academia?" fue el mensaje que costó un cliente real.
    const r = responderPregunta(PIANO, "donde es la academia?");
    expect(r?.texto).toMatch(/online/i);
    expect(r?.texto).toMatch(/sin sede|no hay sede/i);
  });

  // Esta prueba pedía /drive/i y con eso fijaba una promesa FALSA: los
  // productos con `teraboxPath` se entregan por Terabox, no por Drive. Ahora
  // verifica lo que de verdad tiene que cumplirse -- que no se nombre ningún
  // servicio, porque depende del producto.
  it("cómo llega: un enlace de acceso, sin nombrar el servicio", () => {
    expect(responderPregunta(PERRO, "como me llega?")?.texto).toMatch(/enlace de acceso/i);
    expect(responderPregunta(PERRO, "como me llega?")?.texto).not.toMatch(/drive|terabox|mega|dropbox/i);
  });
});

describe("cada producto responde lo suyo", () => {
  it("qué incluye el piano habla de partituras", () => {
    expect(responderPregunta(PIANO, "que incluye?")?.texto).toMatch(/partituras/i);
  });

  it("qué incluye educanino habla de conductas, no de partituras", () => {
    const r = responderPregunta(PERRO, "que incluye?")?.texto ?? "";
    expect(r).toMatch(/obediencia/i);
    expect(r).not.toMatch(/partitura/i);
  });

  it("la del producto le gana a la genérica", () => {
    // Las dos matchean "qué incluye"; tiene que ganar la del curso.
    expect(responderPregunta(PERRO, "que trae el curso")?.id).toBe("perro_incluye");
  });
});

describe("un problema concreto del perro encuentra su módulo", () => {
  it("mensajes reales de cliente", () => {
    for (const m of ["mi perro muerde", "ladra todo el dia", "es muy agresivo", "destruye todo cuando salgo"]) {
      const r = responderPregunta(PERRO, m);
      expect(r, m).not.toBeNull();
      expect(r!.texto, m).toMatch(/agresividad|conductas|ansiedad/i);
    }
  });
});

describe("las preguntas que frenan la venta ya están respondidas", () => {
  it("cuánto dura el piano: 19 módulos y 283 clases", () => {
    const r = responderPregunta(PIANO, "cuanto dura el curso?");
    expect(r?.sinResponder).toBe(false);
    expect(r?.texto).toMatch(/19 m[oó]dulos/i);
  });

  it("si necesita teclado: sí, y cualquiera sirve para empezar", () => {
    const r = responderPregunta(PIANO, "necesito un teclado?");
    expect(r?.sinResponder).toBe(false);
    expect(r?.texto).toMatch(/piano o teclado/i);
  });

  it("edad del piano: todas las edades", () => {
    expect(responderPregunta(PIANO, "sirve para mi hijo?")?.texto).toMatch(/todas las edades/i);
  });

  it("raza del perro: cualquiera, incluidos criollos", () => {
    expect(responderPregunta(PERRO, "sirve para un criollo?")?.texto).toMatch(/cualquier raza/i);
  });

  it("cachorro: desde cachorro hasta adulto mayor", () => {
    expect(responderPregunta(PERRO, "mi perro es cachorro, sirve?")?.texto).toMatch(/cachorro/i);
  });

  it("nunca devuelve una respuesta vacía", () => {
    for (const m of ["cuanto dura", "necesito teclado", "sirve para cachorros", "que raza"]) {
      const r = responderPregunta(PIANO, m) ?? responderPregunta(PERRO, m);
      if (r) expect(r.texto.length, m).toBeGreaterThan(10);
    }
  });

  it("se puede saber qué falta por responder", () => {
    // Hoy no falta ninguna. La función tiene que seguir existiendo para
    // cuando se agregue un producto nuevo con preguntas sin contestar.
    expect(Array.isArray(preguntasSinResponder())).toBe(true);
  });
});

describe("no finge saberlo todo", () => {
  it("una pregunta que no está en la lista devuelve null, y responde el modelo", () => {
    expect(responderPregunta(PIANO, "tu jefe como se llama?")).toBeNull();
    expect(responderPregunta(PIANO, "")).toBeNull();
  });

  it("sin producto en contexto igual responde lo común", () => {
    expect(responderPregunta(null, "tiene garantia?")).not.toBeNull();
  });

  it("solo hay conocimiento de los productos cargados", () => {
    expect(tieneConocimiento(PIANO)).toBe(true);
    expect(tieneConocimiento(999)).toBe(false);
    expect(tieneConocimiento(null)).toBe(false);
  });
});

describe("la apertura varía pero no promete nada", () => {
  it("no afirma nada del producto", () => {
    const prohibido = /excelente elecci[oó]n|te va a encantar|el mejor|buen[ií]simo que preguntes/i;
    for (const s of ["573001", "573002", "573003", "573004", "573005", "573006", ""]) {
      expect(aperturaPara(s)).not.toMatch(prohibido);
    }
  });

  it("dos clientes distintos no reciben siempre la misma", () => {
    const vistas = new Set(["1", "2", "3", "4", "5", "6"].map(aperturaPara));
    expect(vistas.size).toBeGreaterThan(1);
  });

  it("es corta: no puede comerse el mensaje", () => {
    expect(aperturaPara("573136174267").length).toBeLessThan(30);
  });
});

const IA = 124;

describe("curso de IA: solo lo que dice su propia descripción", () => {
  it("qué incluye lista lo que de verdad se entrega", () => {
    const r = responderPregunta(IA, "que incluye?")?.texto ?? "";
    expect(r).toMatch(/39 m[oó]dulos/i);
    expect(r).toMatch(/n8n/i);
    expect(r).toMatch(/openclaw/i);
    // El anuncio viejo prometía estas y NINGUNA está en el curso.
    expect(r).not.toMatch(/midjourney|dall|leonardo|crewai|langgraph|autogpt/i);
  });

  it("preguntar por una herramienta concreta la encuentra", () => {
    // Las del curso y las que NO están: ambas tienen que dar respuesta, y la
    // de las que no están tiene que decir que no.
    for (const m of ["enseña n8n?", "trabaja con claude?", "trae openclaw?"]) {
      expect(responderPregunta(IA, m), m).not.toBeNull();
    }
    expect(responderPregunta(IA, "trae midjourney?")?.id).toBe("ia_no_incluye");
  });

  it("si hay que programar: no, n8n es sin código", () => {
    expect(responderPregunta(IA, "hay que saber programar?")?.texto).toMatch(/no necesitas programar/i);
  });

  it("la duración sale del conteo real, y las horas siguen sin prometerse", () => {
    // Antes iba sin responder. Ahora los módulos están contados carpeta por
    // carpeta en la entrega; las HORAS siguen sin saberse.
    const r = responderPregunta(IA, "cuanto dura?");
    expect(r?.sinResponder).toBe(false);
    expect(r?.texto).toMatch(/39 m[oó]dulos/i);
    expect(r?.texto).not.toMatch(/\d+\s*horas/i);
  });

  it("cada curso responde lo suyo, sin mezclarse", () => {
    expect(responderPregunta(IA, "que incluye?")?.texto).not.toMatch(/partitura|perro/i);
    expect(responderPregunta(PIANO, "que incluye?")?.texto).not.toMatch(/n8n|chatgpt/i);
  });
});

describe("responde lo justo, sin desbordarse", () => {
  it("un dato simple cabe en una línea", () => {
    // "a veces se desborda al responder algo sencillo" (admin, 26/08).
    for (const [pid, m] of [[PIANO,"tiene garantia?"], [PIANO,"trae certificado?"],
                            [PIANO,"donde es la academia?"], [PERRO,"que raza sirve?"]] as const) {
      const t = responderPregunta(pid, m)!.texto;
      expect(t.includes("\n"), m).toBe(false);
      expect(t.length, m).toBeLessThan(110);
    }
  });

  it("las listas SÍ conservan su bloque aparte", () => {
    const t = responderPregunta(PIANO, "que incluye?")!.texto;
    expect(t).toContain("\n");
    expect(t.split("\n").filter(l=>l.trim().startsWith("✅")).length).toBeGreaterThan(2);
  });

  it("toda respuesta lleva al menos un emoji", () => {
    const conEmoji = /\p{Extended_Pictographic}/u;
    for (const [pid, m] of [[PIANO,"tiene garantia?"], [PERRO,"sirve para cachorros?"],
                            [124,"hay que programar?"]] as const) {
      expect(conEmoji.test(responderPregunta(pid, m)!.texto), m).toBe(true);
    }
  });
});

/**
 * El admin prendió la campaña de Facebook del curso de IA. Los mensajes que
 * llegan por ahí no son los de un catálogo: son objeciones. "¿Y si no sé nada
 * de tecnología?", "¿las herramientas son gratis?", "¿está en español?".
 *
 * Cada una de estas pruebas es una pregunta que llega de verdad, y lo que se
 * verifica en las dos direcciones: que la que SÍ está en la descripción salga
 * respondida, y que la que NO está salga como "lo confirmo" -- porque el
 * "grupo privado de Discord" y las "24 lecciones" que costaron devoluciones
 * salieron justo de contestar lo segundo como si fuera lo primero.
 */
describe("curso de IA: las objeciones que trae la campaña", () => {
  it("si sirve sin saber de tecnología: arranca por la introducción, sin prometer más", () => {
    for (const m of ["sirvo si empiezo desde cero?", "soy principiante", "es dificil?"]) {
      const r = responderPregunta(IA, m);
      expect(r?.sinResponder, m).toBe(false);
      expect(r?.texto, m).toMatch(/introducci[oó]n/i);
      // Lo verificable es que ARRANCA desde el principio. "No necesitas saber
      // nada" no lo dice nadie, y por eso no se firma.
      expect(r?.texto, m).not.toMatch(/no necesitas saber/i);
    }
  });

  it("si está actualizado: se nombran las herramientas vigentes, no el año", () => {
    // Decía "es de 2026". Envejece solo, y además el año salía del nombre del
    // anuncio, no del contenido. Ahora se sostiene en lo que trae el curso.
    for (const m of ["esta actualizado?", "no esta viejo el contenido?"]) {
      expect(responderPregunta(IA, m)?.texto, m).toMatch(/claude|n8n|openclaw/i);
    }
  });

  it("las plantillas del bonus: no están, así que no se prometen", () => {
    // El "BONUS: Plantillas listas para usar" era del anuncio viejo. Entre los
    // 39 módulos que se entregan no hay ninguna carpeta de plantillas.
    const r = responderPregunta(IA, "trae plantillas?");
    expect(r?.sinResponder).toBe(true);
  });

  it("qué es un agente autónomo: se explica con las herramientas reales", () => {
    const t = responderPregunta(IA, "que son los agentes autonomos?")?.texto ?? "";
    expect(t).toMatch(/n8n/i);
    expect(t).toMatch(/openclaw/i);
    expect(t).not.toMatch(/crewai|langgraph|autogpt/i);
  });

  it("crear imágenes o video: el curso NO lo cubre, y se dice antes de cobrar", () => {
    // Esta prueba exigía lo contrario y por eso pasaba en verde mientras el
    // bot prometía un módulo de IA creativa que no existe. Quien llegue del
    // anuncio viejo buscando eso tiene que enterarse ANTES de pagar.
    for (const m of ["sirve para crear imagenes?", "puedo hacer videos con esto?"]) {
      const t = responderPregunta(IA, m)?.texto ?? "";
      expect(t, m).not.toMatch(/midjourney|dall|leonardo/i);
      expect(t, m).toMatch(/no es el enfoque|no la cubre/i);
    }
  });

  it("prompts: ninguno de los 39 módulos es de prompting", () => {
    expect(responderPregunta(IA, "enseña a hacer prompts?")?.sinResponder).toBe(true);
  });
});

describe("curso de IA: lo que la descripción NO dice se dice que se confirma", () => {
  const sinRespuesta: Array<[string, string]> = [
    // Hubo un "Portuñol" inventado como idioma. El idioma no está declarado.
    ["esta en español?", "idioma"],
    // La descripción dice QUÉ enseña, nunca a QUIÉN va dirigido.
    ["soy ama de casa, me sirve?", "perfil del comprador"],
    ["para quien es este curso?", "perfil del comprador"],
    // Ninguna promesa de empleo ni de clientes: eso no lo firma el negocio.
    ["me sirve para conseguir trabajo?", "empleo"],
    ["puedo conseguir clientes con esto?", "clientes"],
    // Cuánto se demora en ver resultados tampoco está dicho.
    ["en cuanto tiempo veo resultados?", "tiempo hasta resultados"],
  ];

  it("todas devuelven sinResponder, nunca una cifra inventada", () => {
    for (const [m, quE] of sinRespuesta) {
      const r = responderPregunta(IA, m);
      expect(r, `${quE}: ${m}`).not.toBeNull();
      expect(r!.sinResponder, `${quE}: ${m}`).toBe(true);
      expect(r!.texto, `${quE}: ${m}`).toMatch(/confirmar/i);
    }
  });

  it("el costo de las herramientas se avisa ANTES de cobrar", () => {
    // Va respondida, no en null: que las suscripciones corran por cuenta del
    // cliente es la dirección prudente. Callarlo es lo que genera la
    // devolución, porque el cliente se entera después de pagar.
    for (const m of ["las herramientas son gratis?", "hay que pagar chatgpt plus aparte?"]) {
      const r = responderPregunta(IA, m);
      expect(r?.sinResponder, m).toBe(false);
      expect(r?.texto, m).toMatch(/por tu cuenta/i);
    }
  });

  it("el panel puede ver qué falta por responder del curso de IA", () => {
    const falta = preguntasSinResponder()
      .filter((f) => /INTELIGENCIA ARTIFICIAL/i.test(f.producto))
      .map((f) => f.pregunta);
    // ia_duracion salió de la lista: ya tiene respuesta verificada. Entraron
    // ia_prompts y ia_plantillas, que el anuncio viejo daba por hechas.
    for (const id of ["ia_idioma", "ia_perfil", "ia_empleo", "ia_resultados", "ia_prompts", "ia_plantillas"]) {
      expect(falta, id).toContain(id);
    }
  });
});

describe("curso de IA: los patrones nuevos no le roban la respuesta a otra pregunta", () => {
  // Cada uno de estos mensajes contiene una palabra de las nuevas, pero está
  // preguntando OTRA cosa. Como el conocimiento REEMPLAZA lo que redactó el
  // modelo, un patrón de más se lleva por delante la respuesta correcta.
  it("el precio con '2026' en el nombre no se contesta con la fecha", () => {
    const r = responderPregunta(IA, "cuanto vale el curso de ia 2026?");
    expect(r?.id).not.toBe("ia_actualizado");
  });

  it("preguntar por la forma de pago del curso no cae en el costo de las herramientas", () => {
    const r = responderPregunta(IA, "es pago mensual o una sola vez?");
    expect(r?.id).not.toBe("ia_costo_herramientas");
  });

  it("'atienden 24/7?' es el horario de atención, no los agentes", () => {
    expect(responderPregunta(IA, "atienden 24/7?")?.id).toBe("horario_atencion");
  });

  it("preguntar por una herramienta suelta sigue listando las herramientas", () => {
    expect(responderPregunta(IA, "incluye n8n")?.id).toBe("ia_herramientas");
  });

  it("las comunes siguen ganando cuando la pregunta es de ellas", () => {
    expect(responderPregunta(IA, "trae certificado?")?.texto).toMatch(/no emite certificado/i);
    expect(responderPregunta(IA, "como me llega?")?.texto).toMatch(/enlace de acceso/i);
    expect(responderPregunta(IA, "como me llega?")?.texto).not.toMatch(/drive|terabox|mega|dropbox/i);
    expect(responderPregunta(IA, "tiene garantia?")?.texto).toMatch(/7 d[ií]as/);
  });
});

describe("curso de IA: no se mezcla con los otros dos cursos", () => {
  it("lo del piano no aparece en las respuestas de IA, ni al revés", () => {
    for (const m of ["que incluye?", "trae plantillas?", "que son los agentes?", "esta actualizado?"]) {
      const t = responderPregunta(IA, m)?.texto ?? "";
      expect(t, m).not.toMatch(/partitura|teclado|perro|cachorro|raza/i);
    }
    expect(responderPregunta(PIANO, "que incluye?")?.texto).not.toMatch(/prompt|midjourney|agentes/i);
    expect(responderPregunta(PERRO, "que incluye?")?.texto).not.toMatch(/prompt|midjourney|agentes/i);
  });

  it("una pregunta que solo existe en IA no se responde desde otro producto", () => {
    // Si estas dejaran de ser null, es que un patrón de IA se filtró a las
    // comunes -- y el cliente del piano recibiría una respuesta de IA.
    expect(responderPregunta(PIANO, "trae plantillas?")).toBeNull();
    expect(responderPregunta(PERRO, "enseña a hacer prompts?")).toBeNull();
    expect(responderPregunta(PIANO, "que son los agentes autonomos?")).toBeNull();
  });
});

describe("curso de IA: las respuestas nuevas cumplen la forma acordada", () => {
  const nuevas = ["soy principiante", "esta actualizado?", "trae plantillas?",
                  "que son los agentes autonomos?", "sirve para crear imagenes?",
                  "enseña a hacer prompts?"];

  it("un dato simple cabe en una línea", () => {
    for (const m of nuevas) {
      const t = responderPregunta(IA, m)!.texto;
      expect(t.includes("\n"), m).toBe(false);
      expect(t.length, m).toBeLessThan(110);
    }
  });

  it("todas llevan emoji", () => {
    const conEmoji = /\p{Extended_Pictographic}/u;
    for (const m of nuevas) {
      expect(conEmoji.test(responderPregunta(IA, m)!.texto), m).toBe(true);
    }
  });

  it("hablan como en Colombia: nada de voseo", () => {
    // "podés/querés/tenés" no lo dice un cliente colombiano, y suena a bot
    // importado. La lista incluye las respuestas y el fallback.
    const voseo = /\b(pod[eé]s|quer[eé]s|ten[eé]s|sab[eé]s|and[aá]|ten[eé]|fijate)\b/i;
    for (const m of [...nuevas, "las herramientas son gratis?", "esta en español?", "hay que programar?"]) {
      expect(voseo.test(responderPregunta(IA, m)!.texto), m).toBe(false);
    }
  });

  it("no promete lo que el negocio no puede sostener", () => {
    const prohibido = /te va a encantar|el m[aá]s vendido|garantizad\w+|el mejor curso|resultados asegurados|vas a ganar/i;
    for (const m of [...nuevas, "me sirve para conseguir trabajo?", "sirve para mi negocio?"]) {
      expect(responderPregunta(IA, m)!.texto, m).not.toMatch(prohibido);
    }
  });
});
