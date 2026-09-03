import { describe, it, expect } from "vitest";
import {
  elCierreOfrece,
  elVideoYaSalio,
  invitacionDe,
  pidioElVideo,
  sePuedeOfrecerElVideo,
} from "../ficha-parcial";

/**
 * La conversación del 2026-09-02, 21:17 a 21:19.
 *
 * En dos minutos el bot ofreció un video y lo mandó en el mismo turno, volvió a
 * ofrecerlo dos minutos después de haberlo mandado, lo mandó por tercera vez, y
 * cerró preguntando "¿qué te pareció?" a alguien que ya sabía el precio y había
 * dicho que sí dos veces. Nadie le dijo nunca cómo pagar.
 *
 *   21:17 bot  "¿Te muestro el video? 🎬"
 *   21:17 bot  "🎬 Acá lo ves por dentro: ...terabox..."
 *   21:19 cli  "Que vale ?"
 *   21:19 bot  "💰 $60.000 COP — ¿Te muestro cómo es por dentro? 🎬"
 *   21:19 cli  "Si"
 *   21:19 bot  "🎬 Mira cómo son las clases: ...terabox..."
 *   21:19 bot  "¿Qué te pareció?"
 *
 * Estas pruebas fijan cada uno de esos cuatro defectos por separado.
 */

const TERABOX = "https://1024terabox.com/s/1HcIlWsyPjq5MSfwIZv8Pig";
const bot = (content: string) => ({ role: "assistant", content });
const cli = (content: string) => ({ role: "customer", content });

describe("saber si el video ya salió", () => {
  it("reconoce el video que va con la ficha, con su enlace real", () => {
    // ⚠️ Éste es el que fallaba. La guarda vieja buscaba la frase "Mira cómo
    // son las clases" o un enlace de Google Drive; la ficha manda otras tres
    // redacciones, y este negocio usa Terabox.
    const h = [cli("hola"), bot(`🎬 Acá lo ves por dentro: el video recorre todo lo que trae.\n${TERABOX}`)];
    expect(elVideoYaSalio(h, TERABOX)).toBe(true);
  });

  it("reconoce las otras dos redacciones de la ficha", () => {
    for (const t of [
      `🎬 Mirá este video antes de decidir: te muestra por dentro TODO lo que vas a ver.\n${TERABOX}`,
      `🎬 Te dejo el video para que veas de qué se trata, así no compras a ciegas 👇\n${TERABOX}`,
    ]) {
      expect(elVideoYaSalio([bot(t)], TERABOX)).toBe(true);
    }
  });

  it("sigue reconociendo el historial viejo, con Drive y con la frase de siempre", () => {
    expect(elVideoYaSalio([bot("🎬 Mira cómo son las clases:\nhttps://drive.google.com/file/d/abc")], "")).toBe(true);
  });

  it("no confunde un mensaje del cliente con un envío del bot", () => {
    expect(elVideoYaSalio([cli(`mirá esto ${TERABOX}`)], TERABOX)).toBe(false);
  });

  it("no da por enviado lo que nunca salió", () => {
    expect(elVideoYaSalio([cli("hola"), bot("¡Hola! ¿Qué necesitás?")], TERABOX)).toBe(false);
    expect(elVideoYaSalio([], TERABOX)).toBe(false);
    expect(elVideoYaSalio(null, TERABOX)).toBe(false);
  });
});

describe("el bot no pregunta y se contesta solo", () => {
  it("la ficha que MANDA el video no lo ofrece en el cierre", () => {
    // Las dos secciones que muestran el contenido mandan el video abajo.
    for (const seccion of ["completa", "info"] as const) {
      expect(sePuedeOfrecerElVideo({ seccion, tieneVideo: true, videoYaEnviado: false })).toBe(false);
    }
  });

  it("y ese cierre pasa a ofrecer lo único que falta: el precio", () => {
    const puede = sePuedeOfrecerElVideo({ seccion: "completa", tieneVideo: true, videoYaEnviado: false });
    expect(invitacionDe("completa", false, "", puede, true)).toMatch(/precio|cu[aá]nto/i);
  });

  it("una sección que NO manda el video sí puede ofrecerlo", () => {
    expect(sePuedeOfrecerElVideo({ seccion: "precio", tieneVideo: true, videoYaEnviado: false })).toBe(true);
  });
});

describe("no se ofrece lo que el cliente ya tiene", () => {
  it("después del precio, no se reofrece un video ya enviado", () => {
    expect(sePuedeOfrecerElVideo({ seccion: "precio", tieneVideo: true, videoYaEnviado: true })).toBe(false);
  });

  it("nunca se ofrece un video que el producto no tiene", () => {
    for (const seccion of ["precio", "completa", "info", "video"] as const) {
      expect(sePuedeOfrecerElVideo({ seccion, tieneVideo: false, videoYaEnviado: false })).toBe(false);
    }
  });

  it("el cierre del precio, con el video gastado, no vuelve sobre el video", () => {
    const puede = sePuedeOfrecerElVideo({ seccion: "precio", tieneVideo: true, videoYaEnviado: true });
    expect(invitacionDe("precio", false, "", puede, true)).not.toMatch(/video|por dentro|pedacito/i);
  });
});

describe("el cierre del video lleva a algún lado", () => {
  it("si todavía no sabe el precio, se lo ofrece", () => {
    expect(invitacionDe("video", false, "", true, true, false)).toMatch(/precio|cu[aá]nto/i);
  });

  it("si ya lo sabe, se le pregunta qué lo frena — no qué le pareció", () => {
    const c = invitacionDe("video", false, "", true, true, true);
    expect(c).toMatch(/duda|frena/i);
    expect(c).not.toMatch(/pareci/i);
  });
});

describe("el clasificador y el render no pueden separarse", () => {
  // Si `elCierreOfrece` dice "video" y el cierre real ofreció otra cosa, el
  // "sí" del turno siguiente se lee mal. Ya pasó una vez, por pasarle un
  // `metadata` donde iba un producto.
  it("una ficha que manda el video no queda clasificada como si lo ofreciera", () => {
    const puede = sePuedeOfrecerElVideo({ seccion: "completa", tieneVideo: true, videoYaEnviado: false });
    expect(elCierreOfrece("completa", false, puede, true)).toBe("precio");
  });

  it("con el video gastado, el cierre del precio tampoco se clasifica como video", () => {
    const puede = sePuedeOfrecerElVideo({ seccion: "precio", tieneVideo: true, videoYaEnviado: true });
    expect(elCierreOfrece("precio", false, puede, true)).not.toBe("video");
  });

  it("cuando SÍ lo ofrece, se clasifica como video", () => {
    const puede = sePuedeOfrecerElVideo({ seccion: "precio", tieneVideo: true, videoYaEnviado: false });
    expect(elCierreOfrece("precio", false, puede, true)).toBe("video");
  });
});

describe("pedirlo de nuevo no es lo mismo que recibirlo repetido", () => {
  it("reconoce al que lo pide con todas las letras", () => {
    for (const m of ["mandame el video", "tienes video?", "muestrame una clase", "pasame el vidio"]) {
      expect(pidioElVideo(m)).toBe(true);
    }
  });

  it("un “sí” suelto no es pedirlo", () => {
    expect(pidioElVideo("si")).toBe(false);
    expect(pidioElVideo("dale")).toBe(false);
  });
});
