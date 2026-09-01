import { describe, it, expect } from "vitest";
import { elCierreOfrece, invitacionDe } from "../ficha-parcial";
import { videoDeProducto } from "../video-de-producto";

/**
 * Lo que el bot OFRECE y lo que después RECONOCE tienen que ser lo mismo.
 *
 * Conversación real (2026-09-01), con el mecanismo anti-checkout ya escrito:
 *
 *   bot:     "¿Te muestro el video? 🎬"
 *   cliente: "Si"
 *   bot:     [los tres medios de pago]
 *
 * El cierre lo ARMA `invitacionDe` al enviar (whatsapp.ts) y lo CLASIFICA
 * `elCierreOfrece` para guardarlo en la metadata (agent.ts). Son dos llamadas
 * distintas a la misma familia de reglas, y con argumentos distintos daban
 * respuestas distintas: se ofrecía el video y se guardaba "otro".
 *
 * Peor: un `ofreceLaFicha` equivocado APAGA el respaldo por expresión regular
 * del turno siguiente, que estaba escrito como `!ofrecioAntes && /regex/`. El
 * dato malo era peor que no tener dato.
 */

/** El producto tal como llega de la base: el video vive en `metadata`. */
const cursoConVideo = {
  id: 124,
  name: "CURSO DE PIANO COMPLETO",
  kind: "digital",
  metadata: { videoIntro: "https://drive.google.com/file/d/abc123/view" },
};

describe("El cierre de la ficha no puede mentir sobre lo que ofreció", () => {
  it("si la ficha completa ofrece el video, se clasifica como video", () => {
    const tieneVideo = !!videoDeProducto(cursoConVideo.metadata);
    expect(tieneVideo).toBe(true);

    // Así lo arma el render en whatsapp.ts: para "completa", `yaVioContenido`
    // llega en true porque esa misma ficha muestra el contenido.
    const texto = invitacionDe("completa", false, "573042748687", tieneVideo, true);
    expect(texto).toMatch(/video|c[oó]mo es por dentro/i);

    // Y así tiene que clasificarlo agent.ts, con LOS MISMOS argumentos.
    expect(elCierreOfrece("completa", false, tieneVideo, true)).toBe("video");
  });

  it("pasarle el metadata en vez del producto deja tieneVideo en false", () => {
    // Ésta es la línea que rompía todo: `videoDeProductoSeguro` lee `p.metadata`,
    // así que darle el metadata hace `metadata.metadata` -> undefined -> "".
    // Y "" es una respuesta válida ("no tiene video"), por eso nada fallaba.
    const comoSeLlamabaMal = (cursoConVideo.metadata as any)?.metadata;
    expect(!!videoDeProducto(comoSeLlamabaMal)).toBe(false);

    // Con tieneVideo en false el clasificador toma el atajo de "sin video" y
    // dice "otro", mientras el render --que sí lee bien-- ofrece el video.
    expect(elCierreOfrece("completa", false, false, true)).not.toBe("video");
  });

  it("clasificación y render coinciden en todas las secciones que ofrecen algo", () => {
    const secciones = ["completa", "info", "precio"] as const;
    for (const s of secciones) {
      for (const tieneVideo of [true, false]) {
        for (const yaVioContenido of [true, false]) {
          for (const esFisico of [true, false]) {
            const texto = invitacionDe(s, esFisico, "semilla-fija", tieneVideo, yaVioContenido);
            const clase = elCierreOfrece(s, esFisico, tieneVideo, yaVioContenido);
            if (!texto) continue;

            const textoOfreceVideo = /video|c[oó]mo es por dentro|c[oó]mo se ve en uso|pedacito/i.test(texto);
            const textoOfreceContenido =
              /qu[eé] trae|qu[eé] incluye|qu[eé] viene|todo lo que trae/i.test(texto);

            // Lo que importa: si el texto ofrece el video, la clase lo dice.
            if (textoOfreceVideo) {
              expect(clase, `sección ${s} (video=${tieneVideo}, vioContenido=${yaVioContenido}): "${texto}"`).toBe("video");
            } else if (textoOfreceContenido) {
              expect(clase, `sección ${s}: "${texto}"`).toBe("contenido");
            }
          }
        }
      }
    }
  });

  it("sin video cargado nunca se ofrece verlo", () => {
    // 75 de los 84 cursos no tienen video. Ofrecerlo ahí es prometer lo que no
    // existe, que es el error que se viene sacando de todos lados.
    for (const s of ["completa", "info", "precio"] as const) {
      const texto = invitacionDe(s, false, "semilla", false, false);
      expect(texto, `sección ${s}`).not.toMatch(/video|pedacito/i);
    }
  });
});
