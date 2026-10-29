import { describe, it, expect } from "vitest";
import { verificarSignedRequest, firmarParaPrueba, codigoDeConfirmacion } from "../eliminacion-datos";

const SECRETO = "secreto-de-prueba";

describe("verificarSignedRequest", () => {
  it("acepta una solicitud firmada con el App Secret y devuelve el user_id", () => {
    const sr = firmarParaPrueba({ algorithm: "HMAC-SHA256", user_id: "12345" }, SECRETO);
    expect(verificarSignedRequest(sr, SECRETO)).toEqual({ ok: true, userId: "12345" });
  });

  it("rechaza una firma hecha con otro secreto", () => {
    const sr = firmarParaPrueba({ user_id: "12345" }, "otro");
    const r = verificarSignedRequest(sr, SECRETO);
    expect(r.ok).toBe(false);
  });

  it("rechaza un payload alterado después de firmar", () => {
    const sr = firmarParaPrueba({ user_id: "12345" }, SECRETO);
    const [firma] = sr.split(".");
    const otro = Buffer.from(JSON.stringify({ user_id: "99999" })).toString("base64url");
    expect(verificarSignedRequest(`${firma}.${otro}`, SECRETO).ok).toBe(false);
  });

  it("rechaza formato inválido, falta de secreto y falta de user_id", () => {
    expect(verificarSignedRequest("sinpunto", SECRETO).ok).toBe(false);
    expect(verificarSignedRequest(firmarParaPrueba({ user_id: "1" }, SECRETO), "").ok).toBe(false);
    expect(verificarSignedRequest(firmarParaPrueba({}, SECRETO), SECRETO).ok).toBe(false);
  });

  it("el código de confirmación es estable por usuario", () => {
    expect(codigoDeConfirmacion("12345")).toBe(codigoDeConfirmacion("12345"));
    expect(codigoDeConfirmacion("12345")).not.toBe(codigoDeConfirmacion("12346"));
    expect(codigoDeConfirmacion("12345")).toHaveLength(16);
  });
});
