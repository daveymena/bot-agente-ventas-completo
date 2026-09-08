/**
 * ============================================================
 * DIAGNÓSTICO: QUÉ ESTÁ FALLANDO, EN UNA SOLA PANTALLA
 * ============================================================
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * El 2026-09-07 se perdió una tarde entera averiguando por qué la pantalla de
 * campañas no mostraba nada. Se probaron tres hipótesis y las tres eran falsas,
 * porque se dedujeron leyendo el código en vez de mirar el estado real: desde
 * afuera no se puede ver la sesión del dueño, y cada pantalla resume tanto que
 * termina escondiendo el motivo.
 *
 * Lo que destrabó el problema fue abrir el endpoint crudo en el navegador. Esto
 * es eso mismo, sin tener que saber qué URL abrir.
 *
 * ── La regla de este archivo ──────────────────────────────────────────────
 *
 * Cada cosa que se revisa responde TRES preguntas, no una:
 *
 *   1. ¿está bien?      (ok / falla / no configurado)
 *   2. ¿por qué no?     el motivo TEXTUAL, no una etiqueta
 *   3. ¿qué hago?       la acción concreta
 *
 * "No hay campañas" era una respuesta a la primera pregunta que se hacía pasar
 * por respuesta a las tres. Eso es lo que costó la tarde.
 *
 * ⚠️ NUNCA se devuelve un secreto. Tokens, claves y contraseñas se reportan
 * como "hay / no hay", jamás su valor: esto lo va a copiar y pegar el dueño en
 * un chat.
 */
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export interface Revision {
  /** Qué se revisó, en palabras del dueño. */
  que: string;
  estado: "ok" | "falla" | "sin-configurar";
  /** Qué se vio. Una línea. */
  detalle: string;
  /** El error textual de quien sea que lo haya rechazado. Sin recortar. */
  motivo?: string;
  /** Qué hacer. Vacío cuando está bien. */
  queHacer?: string;
}

/** Une varias revisiones en un texto que el dueño pueda pegar en un chat. */
function comoTexto(revisiones: Revision[], extra: Record<string, unknown>): string {
  const icono = (e: string) => (e === "ok" ? "OK  " : e === "falla" ? "FALLA" : "FALTA");
  const lineas = [
    `DIAGNOSTICO VentasPro — ${new Date().toISOString()}`,
    `negocio: ${extra.negocio} (id ${extra.tenantId})`,
    "",
  ];
  for (const r of revisiones) {
    lineas.push(`[${icono(r.estado)}] ${r.que}: ${r.detalle}`);
    if (r.motivo) lineas.push(`         motivo: ${r.motivo}`);
    if (r.queHacer) lineas.push(`         hacer: ${r.queHacer}`);
  }
  return lineas.join("\n");
}

router.get("/", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const revisiones: Revision[] = [];

    // ── WhatsApp ───────────────────────────────────────────────────────────
    try {
      const { whatsapp } = await import("../lib/whatsapp-singleton");
      const st: any = whatsapp.getStatus();
      const conectado = st?.state === "connected";
      revisiones.push({
        que: "WhatsApp",
        estado: conectado ? "ok" : "falla",
        detalle: conectado
          ? `conectado${st.phoneNumber ? ` (${st.phoneNumber})` : ""}`
          : `estado "${st?.state || "desconocido"}"`,
        motivo: conectado ? undefined : st?.lastError || undefined,
        queHacer: conectado
          ? undefined
          : st?.state === "qr"
            ? "Entrá a WhatsApp en el panel y escaneá el código QR."
            : "Entrá a WhatsApp en el panel y reconectá.",
      });
    } catch (e: any) {
      revisiones.push({ que: "WhatsApp", estado: "falla", detalle: "no se pudo leer el estado", motivo: e?.message });
    }

    // ── Facebook ───────────────────────────────────────────────────────────
    //
    // Es lo que costó la tarde: se revisa en CADENA y se corta en el primer
    // eslabón roto, diciendo cuál es. Antes todo terminaba en el mismo
    // "no hay campañas", sin importar dónde se hubiera cortado.
    try {
      const { FacebookService } = await import("../lib/facebook");
      const fb = new FacebookService(tenant || undefined);

      if (!fb.isConfigured()) {
        revisiones.push({
          que: "Facebook",
          estado: "sin-configurar",
          detalle: "no hay token para este negocio",
          queHacer: "Entrá a Facebook en el panel y conectá la cuenta.",
        });
      } else {
        const v = await fb.validate();
        revisiones.push({
          que: "Facebook · token",
          estado: v.ok ? "ok" : "falla",
          detalle: v.ok ? v.message : "el token no sirve",
          motivo: v.ok ? undefined : v.message,
          queHacer: v.ok ? undefined : "Reconectá Facebook: el token venció o se cerró la sesión.",
        });

        if (!fb.tieneCuentaPublicitaria()) {
          revisiones.push({
            que: "Facebook · cuenta publicitaria",
            estado: "sin-configurar",
            detalle: "no hay cuenta publicitaria cargada",
            queHacer: "Cargala en Facebook, en el panel. Sin ella no se pueden leer campañas.",
          });
        } else if (v.ok) {
          const { cuentas, error } = await fb.listarCuentasPublicitarias();
          const enUso = cuentas.find((c) => c.enUso);
          revisiones.push({
            que: "Facebook · cuenta publicitaria",
            estado: error ? "falla" : enUso ? "ok" : "falla",
            detalle: error
              ? "no se pudieron listar las cuentas"
              : enUso
                ? `usando "${enUso.nombre}" (${enUso.id})${enUso.activa ? "" : " — NO está activa en Meta"}`
                : `la cuenta configurada no está entre las ${cuentas.length} que ve este token`,
            motivo: error || undefined,
            queHacer: error
              ? "Reconectá Facebook."
              : enUso
                ? enUso.activa
                  ? undefined
                  : "Esa cuenta está deshabilitada o en revisión en Meta: no puede entregar anuncios."
                : `Cambiá la cuenta publicitaria. Disponibles: ${cuentas.map((c) => `${c.nombre} (${c.id})`).join(", ") || "ninguna"}`,
          });

          // Campañas: el dato que se estuvo persiguiendo.
          const datos = await fb.getCampaignMetrics({ days: 30 });
          const n = datos?.campaigns?.length ?? 0;
          revisiones.push({
            que: "Facebook · campañas",
            estado: n > 0 ? "ok" : "falla",
            detalle: n > 0 ? `${n} campaña(s) en los últimos 30 días` : "la cuenta no devolvió ninguna campaña",
            motivo: fb.lastCampaignListError || undefined,
            queHacer: n > 0 ? undefined : "Si tenés campañas en Meta, están en OTRA cuenta publicitaria.",
          });
        }
      }
    } catch (e: any) {
      revisiones.push({ que: "Facebook", estado: "falla", detalle: "no se pudo revisar", motivo: e?.message });
    }

    // ── Automatizaciones ───────────────────────────────────────────────────
    //
    // Lo que el dueño pregunto el 2026-09-08: "los agentes autonomos de
    // programar publicacion quedaron bien configurados?". No habia forma de
    // saberlo: los trabajos programados viven en la base y SOLO los podia ver
    // Atlas con `automatizacion_estado`. Ninguna pantalla los mostraba.
    //
    // Un agente que corre solo y no se puede ver es indistinguible de uno que
    // no corre. Lo mismo que paso con el guardian de gasto, que llego a marcar
    // "0 revisiones" sin que nadie se enterara.
    try {
      const { db, trabajosProgramados } = await import("@workspace/db");
      const { and, eq, asc } = await import("drizzle-orm");
      const tid = tenant?.id;

      if (!tid) {
        revisiones.push({
          que: "Automatizaciones",
          estado: "falla",
          detalle: "no se pudo identificar el negocio",
        });
      } else {
        const pendientes = await db
          .select()
          .from(trabajosProgramados)
          .where(and(eq(trabajosProgramados.tenantId, tid), eq(trabajosProgramados.estado, "pendiente")))
          .orderBy(asc(trabajosProgramados.correAt))
          .limit(50);

        const cuenta = (t: string) => pendientes.filter((x: any) => String(x.tipo || "").startsWith(t)).length;
        const publicaciones = cuenta("organico:");
        const guardia = cuenta("franjas:");
        const agencia = cuenta("agencia:");
        const proxima = pendientes[0] as any;

        const nada = pendientes.length === 0;
        revisiones.push({
          que: "Automatizaciones",
          // No es "falla": no tener nada agendado es una decision valida.
          estado: nada ? "sin-configurar" : "ok",
          detalle: nada
            ? "no hay nada agendado"
            : `${pendientes.length} tarea(s): ${publicaciones} publicacion(es), ` +
              `${guardia} de guardia horaria, ${agencia} de la agencia` +
              (proxima?.correAt ? ` · la proxima: ${new Date(proxima.correAt).toLocaleString("es-CO")}` : ""),
          queHacer: nada
            ? "Pedile a Atlas que active la publicacion automatica; te muestra el plan de la semana antes de agendar."
            : undefined,
        });
      }
    } catch (e: any) {
      revisiones.push({ que: "Automatizaciones", estado: "falla", detalle: "no se pudo revisar", motivo: e?.message });
    }

    // ── Base de datos ──────────────────────────────────────────────────────
    try {
      const { tablasFaltantes, ultimasMigraciones } = await import("../lib/autoMigrate");
      // ⚠️ Devuelve `null` cuando NO se pudo consultar, que no es lo mismo que
      // "no falta ninguna". Tratarlas igual seria repetir aca el error que este
      // archivo existe para evitar.
      const faltan = await tablasFaltantes();
      // La forma real es `{cuando, fallos: [{sql, error}]}`. Se muestra el
      // primer error textual: es el que dice por que falto una tabla.
      const fallos = ultimasMigraciones?.fallos || [];
      const fallo = fallos.length ? `${fallos.length} migracion(es) fallaron. Primera: ${fallos[0]!.error}` : "";
      revisiones.push({
        que: "Base de datos",
        estado: faltan === null ? "falla" : faltan.length === 0 ? "ok" : "falla",
        detalle:
          faltan === null
            ? "no se pudo consultar la base"
            : faltan.length === 0
              ? "responde y están todas las tablas"
              : `faltan tablas: ${faltan.join(", ")}`,
        motivo: fallo || undefined,
        queHacer:
          faltan === null
            ? "La base no contesta. Revisá que el contenedor de Postgres esté arriba."
            : faltan.length === 0
              ? undefined
              : "Revisá el arranque del servidor: una migración falló.",
      });
    } catch (e: any) {
      revisiones.push({ que: "Base de datos", estado: "falla", detalle: "no se pudo revisar", motivo: e?.message });
    }

    // ── La clave del baúl ──────────────────────────────────────────────────
    //
    // Sin ella, los tokens guardados dejan de servir en cada reinicio y todo lo
    // de arriba aparece como "sin configurar" sin ninguna explicación.
    try {
      const { tieneClaveFija } = await import("../lib/credentials-vault");
      const fija = tieneClaveFija();
      revisiones.push({
        que: "Clave de credenciales",
        estado: fija ? "ok" : "falla",
        detalle: fija ? "configurada y fija" : "aleatoria: se pierde en cada reinicio",
        queHacer: fija
          ? undefined
          : "Cargá CREDENTIALS_ENCRYPTION_KEY en las variables de entorno y reconectá Facebook una vez más.",
      });
    } catch { /* si no se puede leer, no se reporta un estado falso */ }

    const negocio = tenant?.brandName || tenant?.name || "desconocido";
    const extra = { tenantId: tenant?.id ?? null, negocio };
    const hayProblemas = revisiones.some((r) => r.estado !== "ok");

    return res.json({
      ok: !hayProblemas,
      ...extra,
      revisiones,
      // Listo para copiar y pegar. Es la razón principal de esta pantalla:
      // que el dueño pueda mandar el estado real sin transcribirlo a mano.
      texto: comoTexto(revisiones, extra),
    });
  } catch (e) {
    logger.error({ e }, "[Diagnostico] falló");
    return next(e);
  }
});

export default router;
