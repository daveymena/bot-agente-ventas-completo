import { describe, it, expect } from "vitest";
import { snippetDeMedicion, conMedicion } from "../monitor";

describe("medición de la landing (26-09-2026: no medía nada)", () => {
  it("con píxel: PageView, ViewContent con valor, InitiateCheckout y Purchase", () => {
    const s = snippetDeMedicion({ slug: "corrector-x", pixelId: "1234567890", producto: { name: "Corrector", price: "45000.00", currency: "COP" } });
    expect(s).toMatch(/fbq\('init','1234567890'\)/);
    expect(s).toMatch(/fbq\('track','PageView'\)/);
    expect(s).toMatch(/'ViewContent',\{content_name:"Corrector",value:45000,currency:"COP"\}/);
    expect(s).toMatch(/'InitiateCheckout'/);
    expect(s).toMatch(/'Purchase'/);
    expect(s).toMatch(/\/api\/landing-publica\/'\+encodeURIComponent\(S\)\+'\/evento/);
  });
  it("sin píxel válido no carga el de Meta, pero sí mide visitas", () => {
    const s = snippetDeMedicion({ slug: "x", pixelId: "abc<script>", producto: null });
    expect(s).not.toMatch(/fbevents/);
    expect(s).toMatch(/ev\('visita'/);
  });
  it("se pega antes de </body>", () => {
    expect(conMedicion("<html><body><p>a</p></body></html>", "<script>X</script>")).toBe("<html><body><p>a</p><script>X</script></body></html>");
  });
});
