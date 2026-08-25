import { describe, it, expect } from "vitest";
import { construirMetaCorreo } from "../tenant-email";
import { configCorreoDe } from "../tenant-email";
import { credencialesEmailDe } from "../tenant-email-credentials";
import { parseEmailMeta } from "../tenantManager";

/**
 * La pantalla de Configuracion -> Email guarda en `metadata.email`. Habia DOS
 * lectores y solo uno miraba esa clave: el estado y el boton de "probar" si,
 * pero el envio real de la recuperacion de clave no -- leia
 * `metadata.emailCredentials`, que nadie escribe. Resultado: el admin cargaba
 * su SMTP, todo se veia bien, y el correo no salia nunca.
 *
 * Estas pruebas atan el que ESCRIBE con el que ENVIA, que es justo el par que
 * estaba desconectado.
 */
describe("credenciales de correo: lo que se guarda es lo que se envia", () => {
  const guardado = construirMetaCorreo(
    {},
    { host: "smtp.gmail.com", port: 465, user: "ventas@ejemplo.com", pass: "clave-secreta", enabled: true },
  );

  it("guarda bajo la clave `email`, que es la documentada", () => {
    expect(guardado.email).toBeDefined();
    expect(guardado.email.user).toBe("ventas@ejemplo.com");
  });

  it("nunca guarda la contrasena en claro", () => {
    expect(JSON.stringify(guardado)).not.toContain("clave-secreta");
  });

  it("el envio de recuperacion recibe las credenciales que se guardaron", () => {
    // Este es el caso que fallaba: sin el arreglo, user salia vacio y
    // crearTransporter() devolvia null sin decir nada.
    const tenant: any = { id: "1", brandName: "TecnoVariedades", emailCredentials: parseEmailMeta(guardado) };
    const creds = credencialesEmailDe(tenant);
    expect(creds.user).toBe("ventas@ejemplo.com");
    expect(creds.pass).toBe("clave-secreta");
    expect(creds.propias).toBe(true);
  });

  it("el estado que ve el admin coincide con lo que se enviara", () => {
    const cfg = configCorreoDe({ id: "1", metadata: guardado });
    const tenant: any = { id: "1", emailCredentials: parseEmailMeta(guardado) };
    expect(cfg.propio).toBe(true);
    expect(cfg.user).toBe(credencialesEmailDe(tenant).user);
  });
});
