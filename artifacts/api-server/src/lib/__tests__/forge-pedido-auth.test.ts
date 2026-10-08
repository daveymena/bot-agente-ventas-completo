/**
 * Los pedidos de las landings de Landing Forge entran a VentasPro (Dropi con
 * el token del negocio). El endpoint es público: lo protege SOLO la clave
 * compartida, así que sin ella (o con una corta) no entra nada.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

async function llamar(cabeceras: Record<string, string>) {
  const { default: router } = await import("../../routes/landing-forge-entrada");
  const app = express();
  app.use(express.json());
  app.use("/api/landing-forge", router);
  const srv = app.listen(0);
  const { port } = srv.address() as AddressInfo;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/landing-forge/pedido`, {
      method: "POST", headers: { "Content-Type": "application/json", ...cabeceras }, body: JSON.stringify({ tenantId: 1, productId: 1 }),
    });
    return r.status;
  } finally {
    srv.close();
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/landing-forge/pedido", () => {
  it("sin clave configurada en el servidor: 401 aunque manden algo", async () => {
    vi.stubEnv("LANDINGFORGE_API_KEY", "");
    vi.stubEnv("LANDING_API_KEY", "");
    expect(await llamar({ "x-api-key": "lo-que-sea-1234567890" })).toBe(401);
  });
  it("con clave configurada: sin cabecera o con otra, 401", async () => {
    vi.stubEnv("LANDINGFORGE_API_KEY", "clave-compartida-larga-123");
    expect(await llamar({})).toBe(401);
    expect(await llamar({ "x-api-key": "clave-compartida-larga-124" })).toBe(401);
  });
});
