/**
 * PWA/APK 07-10-2026: el push no debe romper nada si VAPID no está
 * configurado, y el shell PWA (manifest + SW) debe tener las piezas
 * que exigen Play Store / TWA (iconos 192+512+maskable, start_url,
 * SW con handler push y notificationclick).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enviarPushAlDueno } from "../push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(__dirname, "../../../../ventas-pro");

describe("push sin VAPID no rompe", () => {
  it("devuelve {0,0} sin tocar la DB", async () => {
    const r = await enviarPushAlDueno(1, { titulo: "t", cuerpo: "c" });
    expect(r).toEqual({ enviadas: 0, fallidas: 0 });
  });
});

describe("shell PWA para APK", () => {
  it("manifest con iconos, shortcuts y screenshots", () => {
    const m = JSON.parse(fs.readFileSync(path.join(front, "public/manifest.json"), "utf-8"));
    const sizes = (m.icons || []).map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons || []).some((i: any) => i.purpose === "maskable")).toBe(true);
    expect(m.start_url).toBeTruthy();
    expect((m.shortcuts || []).length).toBeGreaterThanOrEqual(3);
    expect((m.screenshots || []).length).toBeGreaterThanOrEqual(1);
  });
  it("sw.js con push + click + cache", () => {
    const sw = fs.readFileSync(path.join(front, "public/sw.js"), "utf-8");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("showNotification");
  });
});
