import { describe, it, expect } from "vitest";
import { diagnosticoDeErrorDeMeta, ESTADO_DE_CUENTA_META, esErrorTransitorioDeMeta } from "../facebook";

/**
 * Los tokens de Meta VENCEN. Le va a pasar a todo el que use la app, y hasta
 * hoy les pasaba callado.
 *
 * Medido contra la cuenta de producción el 2026-08-29: el `FB_ACCESS_TOKEN`
 * del servicio había vencido el 10 de agosto — diecinueve días antes. Nada en
 * el sistema lo decía. Graph API contestaba esto, y esto mismo era lo que
 * salía al panel y a Atlas:
 *
 *   "Error validating access token: Session has expired on Monday,
 *    10-Aug-26 18:00:00 PDT" (código 190, subcódigo 463)
 *
 * En inglés, con vocabulario de Meta, y sin decir qué hacer. El admin no tiene
 * cómo saber que eso significa "entrá a Configuración y volvé a conectar".
 */

const errorReal = {
  message: "Error validating access token: Session has expired on Monday, 10-Aug-26 18:00:00 PDT.",
  type: "OAuthException",
  code: 190,
  error_subcode: 463,
};

describe("Traducir lo que dice Meta a lo que hay que hacer", () => {
  it("el token vencido dice que hay que reconectar, y cuándo venció", () => {
    const d = diagnosticoDeErrorDeMeta(errorReal);
    expect(d?.hayQueReconectar).toBe(true);
    expect(d?.motivo).toMatch(/VENCIÓ/);
    expect(d?.motivo).toMatch(/10-Aug-26/);
    expect(d?.motivo).toMatch(/Configuración/);
    // Y lo que de verdad importa que el admin entienda: mientras tanto no
    // sale ni un anuncio.
    expect(d?.motivo).toMatch(/no se puede publicar/i);
  });

  it("lo encuentra venga suelto o colgado de un Error", () => {
    // `fbPost` cuelga el error de Graph en `err.fbError` para poder decidir si
    // reintenta. Las dos formas circulan por el código.
    const e: any = new Error("algo");
    e.fbError = errorReal;
    expect(diagnosticoDeErrorDeMeta(e)?.hayQueReconectar).toBe(true);
  });

  it("distingue la app desautorizada de la sesión vencida", () => {
    // Son dos cosas distintas para el admin: una la causó él revocando la app.
    expect(diagnosticoDeErrorDeMeta({ code: 190, error_subcode: 458, message: "App not installed" })?.motivo)
      .toMatch(/desautorizada/i);
    expect(diagnosticoDeErrorDeMeta({ code: 190, error_subcode: 460, message: "password changed" })?.motivo)
      .toMatch(/contraseña/i);
  });

  it("los permisos faltantes no se confunden con un token muerto", () => {
    const d = diagnosticoDeErrorDeMeta({ code: 200, message: "(#200) Requires ads_management permission" });
    expect(d?.motivo).toMatch(/permisos de anuncios/i);
    expect(d?.hayQueReconectar).toBe(true);
  });

  it("la cuenta restringida NO se arregla reconectando, y lo dice", () => {
    // Reconectar acá sería mandar al admin a dar vueltas: el problema está en
    // el Administrador de Anuncios, no en la conexión.
    const d = diagnosticoDeErrorDeMeta({ code: 2635, message: "This Ad Account is disabled" });
    expect(d?.hayQueReconectar).toBe(false);
    expect(d?.motivo).toMatch(/NO van a entregar/);
  });

  it("un error que no es de conexión se deja pasar tal cual", () => {
    // Si se inventara un diagnóstico para todo, se taparía el detalle real de
    // Graph, que para los errores de armado es lo único accionable.
    expect(diagnosticoDeErrorDeMeta({ code: 100, message: "Invalid parameter" })).toBeNull();
    expect(diagnosticoDeErrorDeMeta(null)).toBeNull();
  });

  it("no se pisa con el reintento: un token vencido no es transitorio", () => {
    // Reintentar un token muerto es perder segundos por cada una de las cuatro
    // llamadas de la subida.
    expect(esErrorTransitorioDeMeta(errorReal)).toBe(false);
  });
});

describe("Una cuenta publicitaria que no puede gastar no es un 'conectado ✅'", () => {
  it("solo el estado 1 puede entregar anuncios", () => {
    expect(ESTADO_DE_CUENTA_META[1]?.puedeGastar).toBe(true);
    for (const estado of [2, 3, 7, 8, 9, 100, 101]) {
      expect(ESTADO_DE_CUENTA_META[estado]?.puedeGastar, `estado ${estado}`).toBe(false);
    }
  });

  it("el periodo de gracia por saldo pendiente se nombra por lo que es", () => {
    // Es el estado que las notas del admin le atribuyen a la cuenta que está
    // cargada en producción. "9" no le dice nada a nadie.
    expect(ESTADO_DE_CUENTA_META[9]?.texto).toMatch(/saldo pendiente/i);
    expect(ESTADO_DE_CUENTA_META[100]?.texto).toMatch(/FALTA DE PAGO/i);
  });
});
