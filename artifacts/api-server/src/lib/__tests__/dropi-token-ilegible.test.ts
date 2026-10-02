import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import {
  diagnosticarValorTokenDropi,
  mensajeTokenDropi,
  explicarRechazo,
} from "../dropi-directo";

/**
 * El token de Dropi guardado puede estar MUERTO aunque exista la fila.
 *
 * Medido en vivo (29-09-2026): el tenant tenía apiKeys.dropi.apiKey
 * indescifrable con la clave actual. Como `decryptSecret` devuelve "" en
 * silencio, todo parecía "nunca configurado" y Atlas pedía el token en loop.
 * "Ausente" e "ilegible" piden mensajes distintos.
 */
const CLAVE_TEST = "clave-fija-de-prueba-dropi-12345";

function encriptarComoVault(plano: string): string {
  const key = crypto.createHash("sha256").update(CLAVE_TEST).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plano, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "enc:v1:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

const JWT_FALSO = "eyJhbGciOiJIUzI1NiJ9.eyJpbnRlZ3JhdGlvbl91cmwiOiJodHRwczovL3RpZW5kYS50ZXN0LyJ9.firma";

describe("diagnóstico del token de Dropi guardado", () => {
  beforeAll(() => {
    // La clave se deriva lazy en el primer uso: fijarla antes de diagnosticar.
    process.env.CREDENTIALS_ENCRYPTION_KEY = CLAVE_TEST;
  });

  it("ausente cuando no hay nada guardado", () => {
    expect(diagnosticarValorTokenDropi(null)).toEqual({ estado: "ausente" });
    expect(diagnosticarValorTokenDropi("")).toEqual({ estado: "ausente" });
    expect(diagnosticarValorTokenDropi("   ")).toEqual({ estado: "ausente" });
  });

  it("ok cuando descifra y es JWT", () => {
    const r = diagnosticarValorTokenDropi(encriptarComoVault(JWT_FALSO));
    expect(r.estado).toBe("ok");
  });

  it("ilegible cuando el cifrado no abre (clave rotada)", () => {
    const bueno = encriptarComoVault(JWT_FALSO);
    // Corromper el final rompe el tag GCM: auth falla igual que con otra clave.
    const corrupto = bueno.slice(0, -6) + "AAAAAA";
    expect(diagnosticarValorTokenDropi(corrupto)).toEqual({ estado: "ilegible" });
  });

  it("ilegible cuando no es JWT (basura o texto plano legacy)", () => {
    expect(diagnosticarValorTokenDropi("abc123")).toEqual({ estado: "ilegible" });
    expect(diagnosticarValorTokenDropi("un-token-viejo-sin-puntos")).toEqual({ estado: "ilegible" });
  });

  it("el mensaje dice exactamente qué hacer en cada caso", () => {
    expect(mensajeTokenDropi({ estado: "ausente" })).toContain("dropi_conectar");
    const ileg = mensajeTokenDropi({ estado: "ilegible" });
    expect(ileg).toContain("Mis Integraciones");
    expect(ileg).not.toContain("primero dropi_conectar");
  });
});

describe("token rechazado por Dropi: la guía dice lo correcto", () => {
  // JWT falso con integration_url (tipo WooCommerce) e ip vacía: el caso del
  // token que "debería" abrir y no abre. Verificado en vivo (29-09-2026): un
  // WooCommerce válido SÍ abre directo, así que el diagnóstico es REVOCADO,
  // no "el directo es imposible".
  const payload = { integration_url: "https://tienda.test/", ip_url: [], exp: 4929000868 };
  const falso = "aaa." + Buffer.from(JSON.stringify(payload)).toString("base64") + ".bbb";

  it("Access denied sin IP restringida → revocado, con pasos", async () => {
    const texto = await explicarRechazo(falso, "Access denied", "161.97.182.95");
    expect(texto).toContain("REVOCADO");
    expect(texto).toContain("Mis Integraciones");
  });

  it("token de sesión del panel → lo dice directo", async () => {
    const sesion = "aaa." + Buffer.from(JSON.stringify({})).toString("base64") + ".bbb";
    const texto = await explicarRechazo(sesion, "not issued to this api", "161.97.182.95");
    expect(texto).toContain("SESIÓN");
  });
});
