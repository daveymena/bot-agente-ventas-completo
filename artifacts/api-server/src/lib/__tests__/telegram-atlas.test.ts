import { describe, it, expect } from "vitest";
import { signedCookie } from "cookie-parser";
import { cookieFirmadaDeTenant } from "../telegram-atlas";

describe("Telegram → Atlas: la cookie local es la misma que valida cookie-parser", () => {
  it("firma tenant_id igual que res.cookie(signed:true)", () => {
    process.env.COOKIE_SECRET = "secreto-de-prueba";
    const cookie = cookieFirmadaDeTenant(7);
    const valor = decodeURIComponent(cookie.replace(/^tenant_id=/, ""));
    expect(valor.startsWith("s:7.")).toBe(true);
    expect(signedCookie(valor, "secreto-de-prueba")).toBe("7");
    expect(signedCookie(valor, "otro-secreto")).toBe(false);
  });
});
