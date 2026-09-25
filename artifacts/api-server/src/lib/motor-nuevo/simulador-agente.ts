/**
 * SIMULADOR DE AGENTE — Bucle de conversación cliente simulado ↔ vendedor real.
 *
 * Corre simulaciones sin tocar conversaciones reales en la BD.
 * Todo en memoria (`RepositorioEnMemoria`).
 *
 * Reusa el motor v2 (`responder`) tal cual lo usa producción, sin modificaciones.
 */

import { ClienteLLMConfig, crearClienteLLM, armarCadena } from "./cliente-llm";
import { responder } from "./motor";
import { cargarCatalogoDelNegocio, cargarGuion, cargarVozDelNegocio, cargarConocimiento } from "./adaptador";
import { estadoInicial, EstadoConversacion, RepositorioEnMemoria } from "./estado-conversacion";
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

Si decidiste comprar, el mensaje debe sonar como que quieres comprar.
Si decidiste abandonar (sin compra), el mensaje debe sonar como que te vas.
De lo contrario, continúa la conversación.

Responde solo el mensaje del cliente, sin explicaciones.`;

  try {
    const respuesta = await llm.message({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";

    // Detecta intención por keywords naturales
    const tieneCompra = /\b(lo quiero|me lo llevo|dale|listo|si|de una|perfecto|mándame|cómo pago|ok)\b/i.test(texto);
    const tieneAbandono = /\b(no|no me interesa|luego te llamo|mañana|otro día|después|no gracias|paso|no thanks)\b/i.test(texto) && !tieneCompra;

    if (tieneCompra) {
      return { mensaje: texto.trim(), senoal: "compra" };
    }
    if (tieneAbandono) {
      return { mensaje: texto.trim(), senoal: "abandona" };
    }

    return { mensaje: texto.trim(), senoal: "continua" };
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

  // Estado inicial del vendedor
  let estadoVendedor = estadoInicial(999_999); // ID ficticio, en memoria

  // Repositorio en memoria
  const repositorio = new RepositorioEnMemoria();

  // Bucle: cliente → vendedor → cliente
  for (let turnoNum = 1; turnoNum <= maxTurnos; turnoNum++) {
    // 1. Cliente envía mensaje
    const respuestaCliente = await generarMensajeCliente({
      perfil: perfilCliente,
      historial,
      producto: { name: producto.name, description: producto.description, price: producto.price },
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

    if (respuestaCliente.senoal === "compra") {
      return {
        perfilCliente,
        turnos,
        estadoFinal: estadoVendedor,
        cerroEn: "compra",
        resumenProblemas: problemas,
      };
    }

    if (respuestaCliente.senoal === "abandona") {
      return {
        perfilCliente,
        turnos,
        estadoFinal: estadoVendedor,
        cerroEn: "abandono",
        resumenProblemas: problemas,
      };
    }

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
        repositorio,
      });

      estadoVendedor = resultadoVendedor.estado;

      const textoVendedor = (resultadoVendedor.partes as any[])
        .filter((p) => p.kind === "text")
        .map((p) => p.content)
        .join("\n");

      if (!textoVendedor) {
        problemas.push({ problema: "Vendedor no devolvió respuesta", turno: turnoNum });
        break;
      }

      historial.push({ role: "agent", content: textoVendedor });
      turnos.push({
        numeroTurno: turnoNum,
        quienDice: "vendedor",
        texto: textoVendedor,
        timestamp: new Date(),
      });

      // Detectar problemas obvios (ej: precio inventado)
      if (textoVendedor.match(/\$\d+|€\d+|precio.*\d+/i) && !textoVendedor.toLowerCase().includes("según")) {
        problemas.push({
          problema: "Posible precio inventado (precio específico sin contexto)",
          turno: turnoNum,
        });
      }
    } catch (e) {
      problemas.push({ problema: `Error del vendedor: ${(e as any).message}`, turno: turnoNum });
      break;
    }
  }

  // Terminó por límite de turnos
  return {
    perfilCliente,
    turnos,
    estadoFinal: estadoVendedor,
    cerroEn: "limite_turnos",
    resumenProblemas: problemas,
  };
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
}: {
  tenantId: number;
  perfiles: PerfilCliente[];
  productoId: number;
  llmConfig: ClienteLLMConfig;
  maxTurnos?: number;
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
    }
  }

  return resultados;
}
