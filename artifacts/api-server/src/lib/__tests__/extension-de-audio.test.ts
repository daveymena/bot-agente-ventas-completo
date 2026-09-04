/**
 * La extensión con la que se le manda el audio a Whisper.
 *
 * Whisper decide cómo decodificar mirando el NOMBRE del archivo, así que
 * mandar audio webm llamado `nota.ogg` es pedirle que lo lea mal. Mientras
 * esto solo recibía notas de voz de WhatsApp (siempre ogg) daba igual; con el
 * micrófono de Atlas es la ruta normal, y `webm` --lo que graba Chrome-- no
 * estaba en la tabla.
 */
import { describe, it, expect } from "vitest";
import { extensionDeAudio } from "../media-entrante";

describe("extensión según el tipo de audio", () => {
  /** Lo que graba un navegador. Es el caso que faltaba. */
  it("Chrome: audio/webm;codecs=opus", () => {
    expect(extensionDeAudio("audio/webm;codecs=opus")).toBe("webm");
  });

  it("Safari: audio/mp4", () => {
    expect(extensionDeAudio("audio/mp4")).toBe("m4a");
  });

  it("wav", () => {
    expect(extensionDeAudio("audio/wav")).toBe("wav");
  });

  /** WhatsApp: el caso para el que se escribió esto originalmente. */
  it("WhatsApp: audio/ogg;codecs=opus", () => {
    expect(extensionDeAudio("audio/ogg; codecs=opus")).toBe("ogg");
  });

  it("mp3 y mpeg son lo mismo", () => {
    expect(extensionDeAudio("audio/mpeg")).toBe("mp3");
    expect(extensionDeAudio("audio/mp3")).toBe("mp3");
  });

  it("no le importan las mayúsculas", () => {
    expect(extensionDeAudio("AUDIO/WEBM")).toBe("webm");
  });

  /**
   * Ante algo desconocido cae en ogg, que es lo que llegaba antes de existir
   * esta función: lo desconocido se comporta como se comportaba todo.
   */
  it("lo desconocido cae en ogg", () => {
    expect(extensionDeAudio("")).toBe("ogg");
    expect(extensionDeAudio("cualquier/cosa")).toBe("ogg");
    expect(extensionDeAudio(undefined as any)).toBe("ogg");
  });
});
