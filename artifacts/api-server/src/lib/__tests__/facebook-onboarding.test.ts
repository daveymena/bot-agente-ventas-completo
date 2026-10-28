import { describe, expect, it, vi } from "vitest";
import { appFacebookParaLogin, listarPaginasFacebook, elegirPaginaFacebook, puedePublicarFacebook } from "../facebook-onboarding";

const env = { FB_APP_ID: "platform", FB_APP_SECRET: "platform-secret", FB_LOGIN_CONFIG_ID: "platform-config" };
const pages = [{ id: "a", name: "Negocio A", access_token: "secret-a" }, { id: "b", name: "Negocio B", access_token: "secret-b" }];

describe("OAuth de Facebook por negocio", () => {
  it("la app propia gana sin mezclar claves ni config_id de la plataforma", () => {
    expect(appFacebookParaLogin({ appId: "own", appSecret: "own-secret" }, env)).toEqual({ appId: "own", appSecret: "own-secret", loginConfigId: "", origen: "negocio" });
    expect(appFacebookParaLogin({ appId: "own" }, env).appSecret).toBe("");
  });
  it("los negocios sin app propia usan la app SaaS, sin exigir una app por cliente", () => {
    expect(appFacebookParaLogin({}, env)).toEqual({ appId: "platform", appSecret: "platform-secret", loginConfigId: "platform-config", origen: "plataforma" });
  });
  it("no elige automáticamente la primera de varias páginas", () => {
    expect(elegirPaginaFacebook(pages)).toBeNull();
    expect(elegirPaginaFacebook(pages, "b")).toBe(pages[1]);
    expect(elegirPaginaFacebook(pages, "not-authorized")).toBeNull();
  });
  it("al reconectar conserva la página anterior si sigue autorizada", () => {
    expect(elegirPaginaFacebook(pages, null, "b")).toBe(pages[1]);
    expect(elegirPaginaFacebook(pages, "a", "b")).toBe(pages[0]);
    expect(elegirPaginaFacebook([pages[1]])).toBe(pages[1]);
  });
  it("pagina Graph y deduplica sin enviar tokens a un host provisto por paging.next", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [pages[0]], paging: { next: "https://untrusted.example", cursors: { after: "next-cursor" } } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: pages }) });
    expect(await listarPaginasFacebook("user-token", fetchImpl)).toEqual(pages);
    const url = new URL(fetchImpl.mock.calls[1][0]);
    expect(url.hostname).toBe("graph.facebook.com");
    expect(url.searchParams.get("after")).toBe("next-cursor");
    expect(url.searchParams.get("access_token")).toBe("user-token");
  });
  it("no trata un permiso denegado como una lista vacía", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "pages_show_list required" } }) });
    await expect(listarPaginasFacebook("token", fetchImpl)).rejects.toThrow("pages_show_list required");
  });
  it("el permiso de publicación usa tasks o permisos de usuario", () => {
    expect(puedePublicarFacebook(["CREATE_CONTENT"], [])).toBe(true);
    expect(puedePublicarFacebook([], ["pages_manage_posts"])).toBe(true);
    expect(puedePublicarFacebook(["ANALYZE"], [])).toBe(false);
  });
});
