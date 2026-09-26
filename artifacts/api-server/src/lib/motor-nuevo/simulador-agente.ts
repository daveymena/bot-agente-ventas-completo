/**
 * SIMULADOR DE AGENTE — Bucle de conversación cliente simulado ↔ vendedor real.
 *
 * Corre simulaciones sin tocar conversaciones reales en la BD.
 * Todo en memoria: `responder` no escribe en la base.
 *
 * Reusa el motor v2 (`responder`) tal cual lo usa producción, sin modificaciones.
 */

import { crearClienteLLM, armarCadena, type Candidato } from "./cliente-llm";
import { responder, montosInventados } from "./motor";
import { evaluarChat, type TurnoEvaluado } from "../evaluador-de-chats";
import { cargarCatalogoDelNegocio, cargarGuion, cargarVozDelNegocio, cargarConocimiento } from "./adaptador";
import { estadoInicial, EstadoConversacion } from "./estado-conversacion";

export interface ClienteLLMConfig {
  cadena: Candidato[];
  tenantId?: number | null;
}
import type { PerfilCliente } from "./cliente-simulado";

export interface TurnoSimulacion {
  numeroTurno: number;
  quienDice: "cliente" | "vendedor";
  texto: string;
  timestamp: Date;
}

export interface ResultadoSimulacion {
  perfilCliente: PerfilCliente;
  turnos: TurnoSimulacion[];
  estadoFinal: EstadoConversacion;
  cerroEn: "compra" | "abandono" | "limite_turnos";
  resumenProblemas: { problema: string; turno: number }[];
}

/**
 * Lee la decisión que el cliente simulado declaró con su marca explícita.
 * Sin marca, sigue conversando: un "sí" o un "ok" sueltos no son una compra.
 */
export function leerDecisionDelCliente(texto: string): { mensaje: string; senoal: "continua" | "compra" | "abandona" } {
  if (texto.includes("[CLIENTE_COMPRA]")) {
    return { mensaje: texto.replace("[CLIENTE_COMPRA]", "").trim(), senoal: "compra" };
  }
  if (texto.includes("[CLIENTE_ABANDONA]")) {
    return { mensaje: texto.replace("[CLIENTE_ABANDONA]", "").trim(), senoal: "abandona" };
  }
  return { mensaje: texto.trim(), senoal: "continua" };
}

/**
 * Genera el próximo mensaje del cliente simulado usando LLM.
 * El cliente "actúa" el rol según su perfil.
 */
async function generarMensajeCliente({
  perfil,
  historial,
  producto,
  llm,
}: {
  perfil: PerfilCliente;
  historial: { role: "customer" | "agent"; content: string }[];
  producto: { name: string; description: string; price?: number };
  llm: ReturnType<typeof crearClienteLLM>;
}): Promise<{ mensaje: string; senoal: "continua" | "compra" | "abandona" } | null> {
  const ultimoDelVendedor = historial.length > 0 && historial[historial.length - 1].role === "agent"
    ? historial[historial.length - 1].content
    : "";

  const prompt = `Eres un cliente simulado con estas características:

Nombre: ${perfil.nombre}
Descripción: ${perfil.descripcion}
Objetivo: ${perfil.objetivoInicial}
Intención de compra: ${perfil.intencionCompra}%
Sensibilidad al precio: ${perfil.sensibilidadPrecio}%
Confianza inicial: ${perfil.confianza}%
Paciencia: ${perfil.paciencia} turnos

Instrucciones de rol:
${perfil.instruccionesDeRol}

Producto: ${producto.name}
Descripción: ${producto.description}
${producto.price ? `Precio: ${producto.price}` : ""}

Historial de conversación:
${historial.map((m) => `${m.role === "customer" ? "Tú (cliente)" : "Vendedor"}: ${m.content}`).join("\n")}

Último mensaje del vendedor: "${ultimoDelVendedor}"

Tu turno. Responde como el cliente según tu perfil:
- Si es tu primer turno, saluda y presenta tu interés.
- Si es un turno posterior, responde a lo que dijo el vendedor.
- Sé natural, no suenes a script.
- Puedes hacer preguntas, expresar dudas, objete, o indicar que quieres comprar.

Si en este turno decides comprar, escribe tu mensaje y al final agrega exactamente [CLIENTE_COMPRA].
Si en este turno decides irte sin comprar, escribe tu mensaje y al final agrega exactamente [CLIENTE_ABANDONA].
Si sigues conversando, no agregues ninguna marca.

Responde solo el mensaje del cliente, sin explicaciones.`;

  try {
    // La decisión la declara el cliente simulado con una marca explícita, no
    // se adivina por palabras sueltas: "sí", "ok" o "no" aparecen en casi
    // cualquier mensaje y cortaban la simulación en el primer turno. La marca
    // tampoco va como stop sequence: el modelo se detendría antes de escribirla.
    const respuesta = await llm.crear({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    return leerDecisionDelCliente(respuesta.content ?? "");
  } catch (e) {
    console.error("[simulador] Error al generar mensaje del cliente:", e);
    return null;
  }
}

/**
 * Corre una simulación completa: cliente ↔ vendedor, hasta compra/abandono/límite.
 */
export async function correrSimulacionCliente({
  tenantId,
  perfilCliente,
  productoId,
  llmConfig,
  maxTurnos = 8,
}: {
  tenantId: number;
  perfilCliente: PerfilCliente;
  productoId: number;
  llmConfig: ClienteLLMConfig;
  maxTurnos?: number;
}): Promise<ResultadoSimulacion> {
  // Carga contexto del negocio
  const catalogo = await cargarCatalogoDelNegocio(tenantId);
  const producto = catalogo.find((p) => p.id === productoId);

  if (!producto) {
    throw new Error(`Producto ${productoId} no encontrado en catálogo del tenant ${tenantId}`);
  }

  const voz = await cargarVozDelNegocio(tenantId);
  const conocimiento = await cargarConocimiento(tenantId);
  const guion = await cargarGuion(tenantId, catalogo, producto.id);

  // Cliente LLM para el rol del cliente
  const clienteLlm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });

  // Cliente LLM para el vendedor (motor v2)
  const vendedorLlm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });

  // Historial de conversación
  const historial: { role: "customer" | "agent"; content: string }[] = [];
  const turnos: TurnoSimulacion[] = [];
  const problemas: { problema: string; turno: number }[] = [];
  const turnosEvaluados: TurnoEvaluado[] = [];

  /**
   * Cierra la simulación: corre el evaluador de chats (el mismo de la sombra
   * de WhatsApp) sobre la charla entera y suma lo que encuentre. Así los
   * hallazgos salen de la conversación real, no de una lista fija.
   */
  const cerrar = (cerroEn: ResultadoSimulacion["cerroEn"]): ResultadoSimulacion => {
    try {
      const hallazgos = evaluarChat(
        turnosEvaluados,
        catalogo.map((c) => ({ id: c.id, name: c.name, price: c.price ?? 0, kind: c.kind ?? null })),
      );
      for (const h of hallazgos) problemas.push({ problema: `${h.regla}: ${h.detalle}`, turno: h.turno + 1 });
    } catch (e) {
      problemas.push({ problema: `No se pudo evaluar la charla: ${(e as any)?.message}`, turno: 0 });
    }
    return { perfilCliente, turnos, estadoFinal: estadoVendedor, cerroEn, resumenProblemas: problemas };
  };

  // Estado inicial del vendedor
  let estadoVendedor = estadoInicial(999_999); // ID ficticio, en memoria

  // Bucle: cliente → vendedor → cliente
  for (let turnoNum = 1; turnoNum <= maxTurnos; turnoNum++) {
    // 1. Cliente envía mensaje
    const respuestaCliente = await generarMensajeCliente({
      perfil: perfilCliente,
      historial,
      producto: { name: producto.name, description: producto.description ?? "", price: producto.price ?? undefined },
      llm: clienteLlm,
    });

    if (!respuestaCliente) {
      break; // Error LLM, termina simulación
    }

    const mensajeCliente = respuestaCliente.mensaje;
    historial.push({ role: "customer", content: mensajeCliente });
    turnos.push({
      numeroTurno: turnoNum,
      quienDice: "cliente",
      texto: mensajeCliente,
      timestamp: new Date(),
    });

    if (respuestaCliente.senoal === "compra") return cerrar("compra");
    if (respuestaCliente.senoal === "abandona") return cerrar("abandono");

    // 2. Vendedor responde (motor v2)
    try {
      const resultadoVendedor = await responder({
        llm: vendedorLlm,
        estado: estadoVendedor,
        historial,
        catalogo,
        conocimiento,
        guion,
        voz,
      });

      estadoVendedor = resultadoVendedor.estado;

      const partes = resultadoVendedor.partes as any[];
      const textoVendedor = partes
        .filter((p) => p.kind === "text" || p.kind === "voz")
        .map((p) => (p.kind === "voz" ? `🎙️ (nota de voz) ${p.content}` : p.content))
        .join("\n");
      const tarjetas = partes.filter((p) => p.kind === "card").map((p) => ({ productId: p.productId, seccion: p.seccion ?? null }));

      // Una respuesta que es SOLO una ficha es una respuesta: antes contaba
      // como "no devolvió respuesta" y cortaba la simulación.
      if (!textoVendedor && !tarjetas.length) {
        problemas.push({ problema: "El vendedor no respondió nada", turno: turnoNum });
        break;
      }
      const loQueVio = [textoVendedor, ...tarjetas.map((t) => `[ficha "${t.seccion || "completa"}" de ${catalogo.find((c) => c.id === t.productId)?.name ?? `#${t.productId}`}]`)]
        .filter(Boolean)
        .join("\n");

      historial.push({ role: "agent", content: loQueVio });
      turnos.push({
        numeroTurno: turnoNum,
        quienDice: "vendedor",
        texto: loQueVio,
        timestamp: new Date(),
      });
      turnosEvaluados.push({ mensaje: mensajeCliente, texto: textoVendedor, tarjetas });

      // Un precio que el vendedor ESCRIBIÓ y no está en el catálogo (la misma
      // red del motor). Antes era una regex que marcaba cualquier "$36.000",
      // aunque fuera el precio real.
      const inventados = montosInventados(textoVendedor, catalogo);
      if (inventados.length) {
        problemas.push({
          problema: `Escribió un precio que no está en el catálogo: ${inventados.map((n) => n.toLocaleString("es-CO")).join(", ")}`,
          turno: turnoNum,
        });
      }
    } catch (e) {
      problemas.push({ problema: `Error del vendedor: ${(e as any).message}`, turno: turnoNum });
      break;
    }
  }

  // Terminó por límite de turnos
  return cerrar("limite_turnos");
}

/**
 * Corre varias simulaciones (múltiples arquetipos).
 */
export async function correrMultiplesSimulaciones({
  tenantId,
  perfiles,
  productoId,
  llmConfig,
  maxTurnos = 8,
  errores,
}: {
  tenantId: number;
  perfiles: PerfilCliente[];
  productoId: number;
  llmConfig: ClienteLLMConfig;
  maxTurnos?: number;
  /**
   * Aquí se anota por qué falló cada simulación. Antes el error solo iba a la
   * consola y el resultado era "0 simulaciones, sin problemas": un verde falso
   * (producción, 26-09-2026: el producto #1 no existía en ese catálogo).
   */
  errores?: string[];
}): Promise<ResultadoSimulacion[]> {
  const resultados: ResultadoSimulacion[] = [];

  for (const perfil of perfiles) {
    try {
      console.log(`[simulador] Corriendo: ${perfil.nombre}...`);
      const resultado = await correrSimulacionCliente({
        tenantId,
        perfilCliente: perfil,
        productoId,
        llmConfig,
        maxTurnos,
      });
      resultados.push(resultado);
      console.log(`[simulador]   ✓ Cerró en: ${resultado.cerroEn}, ${resultado.turnos.length} turnos`);
    } catch (e) {
      console.error(`[simulador]   ✗ Error: ${(e as any).message}`);
      errores?.push(`${perfil.nombre}: ${(e as any).message}`);
    }
  }

  return resultados;
}
