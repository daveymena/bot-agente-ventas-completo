/**
 * Pedido del dueño (25-09-2026): Atlas debe saber a qué objetivo de Meta
 * acudir según cómo se lo pidan, no solo WhatsApp o la web.
 */
import { describe, test, expect } from "vitest";
import { objetivoDelCatalogo, explicarObjetivos, CATALOGO_DE_OBJETIVOS } from "../catalogo-objetivos-meta";
import { pedidoDelAdmin, interpretarObjetivo, rechazoPorObjetivoNoCreable } from "../objetivos-campana";

describe("cada frase lleva a su objetivo", () => {
  test.each([
    ["haz un anuncio a la landipage del corrector", "trafico_web"],
    ["quiero que me escriban por WhatsApp", "mensajes_whatsapp"],
    ["campaña de ventas para el extractor", "ventas_web"],
    ["que me conozcan en Cali", "reconocimiento"],
    ["un anuncio con formulario para captar datos", "clientes_potenciales_formulario"],
    ["quiero que me llamen por teléfono", "llamadas"],
    ["que me escriban por Messenger", "mensajes_messenger"],
    ["promocionar esta publicación para que comenten", "interaccion_publicacion"],
    ["quiero más seguidores", "me_gusta_pagina"],
    ["que vean el video del producto", "reproducciones_video"],
  ])("%s → %s", (frase, clave) => {
    expect(objetivoDelCatalogo(frase)?.clave).toBe(clave);
  });
});

describe("lo que todavía no se crea no se desvía a otra cosa", () => {
  test("formulario: viaja marcado y las herramientas lo rechazan explicando qué falta", async () => {
    const pedido = pedidoDelAdmin("crea un anuncio con formulario de clientes potenciales");
    expect(pedido).toBe("no-creable:clientes_potenciales_formulario");
    expect(interpretarObjetivo(pedido!)).toBeNull(); // no se convierte en ventas/web
    expect(await rechazoPorObjetivoNoCreable(pedido)).toMatch(/todavía NO la puede crear/);
  });

  test("si además nombra uno que sí se crea, gana ese", () => {
    expect(pedidoDelAdmin("revisa los comentarios y crea un anuncio a la landing")).toBe("trafico landing");
  });

  test("'llamada a la acción' no es una campaña de llamadas", () => {
    expect(objetivoDelCatalogo("mejora la llamada a la acción del anuncio")?.clave).not.toBe("llamadas");
  });

  test("los casos de antes siguen igual", () => {
    expect(pedidoDelAdmin("que me escriban por WhatsApp")).toBe("mensajes");
    expect(pedidoDelAdmin("dame el enlace")).toBeNull();
    expect(interpretarObjetivo("una a whatsapp y otra la landipage")).toBeNull();
  });
});

describe("Atlas puede explicarlos", () => {
  test("la explicación nombra los 6 objetivos de Meta y marca cuáles se crean", () => {
    const t = explicarObjetivos();
    for (const o of ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"]) expect(t).toContain(o);
    expect(CATALOGO_DE_OBJETIVOS.filter((o) => o.creable).map((o) => o.arma).sort()).toEqual(["mensajes", "reconocimiento", "trafico", "ventas"]);
  });
});
