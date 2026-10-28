import { test } from "node:test";
import assert from "node:assert/strict";
import { urlLoginFacebook } from "../facebook-login";

test("el diálogo usa la versión y configuración de la app elegida", () => {
  const url = new URL(urlLoginFacebook({ appId: "own", enabled: true, loginConfigId: "own-config", apiVersion: "v23.0" }, "https://app.example/facebook")!);
  assert.equal(url.pathname, "/v23.0/dialog/oauth");
  assert.equal(url.searchParams.get("config_id"), "own-config");
  assert.equal(url.searchParams.has("scope"), false);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example/facebook");
});
test("no permite iniciar una conexión deshabilitada", () => {
  assert.equal(urlLoginFacebook({ appId: "own", enabled: false }, "https://app.example/facebook"), null);
});
test("la app sin Business Login pide permisos normales", () => {
  const url = new URL(urlLoginFacebook({ appId: "own", enabled: true }, "https://app.example/facebook")!);
  assert.ok(url.searchParams.get("scope")?.includes("pages_show_list"));
  assert.equal(url.searchParams.has("config_id"), false);
});
