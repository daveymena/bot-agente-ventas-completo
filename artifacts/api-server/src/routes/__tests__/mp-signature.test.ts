import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { firmaMpValida } from "../subscription-webhooks";

function reqFirmado(dataId: string, rid: string, ts: string, secreto: string) {
  const manifiesto = `id:${dataId};request-id:${rid};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return { headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid } };
}

describe("firmaMpValida (webhook MercadoPago)", () => {
  it("acepta una firma bien formada", () => {
    const req = reqFirmado("123", "abc", "1700000000", "secreto");
    expect(firmaMpValida(req, "123", "secreto")).toBe(true);
  });
  it("rechaza firma adulterada", () => {
    const req = reqFirmado("123", "abc", "1700000000", "secreto");
    req.headers["x-signature"] += "0";
    expect(firmaMpValida(req, "123", "secreto")).toBe(false);
  });
  it("rechaza otro secreto, otro id u otro request-id", () => {
    const req = reqFirmado("123", "abc", "1700000000", "secreto");
    expect(firmaMpValida(req, "123", "otro")).toBe(false);
    expect(firmaMpValida(req, "999", "secreto")).toBe(false);
    const req2 = reqFirmado("123", "zzz", "1700000000", "secreto");
    (req2.headers as any)["x-request-id"] = "abc";
    expect(firmaMpValida(req2, "123", "secreto")).toBe(false);
  });
  it("rechaza headers ausentes o secreto vacío", () => {
    expect(firmaMpValida({ headers: {} }, "123", "secreto")).toBe(false);
    const req = reqFirmado("123", "abc", "1700000000", "secreto");
    expect(firmaMpValida(req, "123", "")).toBe(false);
  });
});
