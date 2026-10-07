/**
 * Esperar a que la base esté lista ANTES de que un reloj dé su primera vuelta.
 *
 * `db` de `@workspace/db` es `undefined` hasta que `initDb()` termina. Todo lo
 * que arranca al cargar `app.ts` (schedulers, barridos, el auto-arranque de
 * WhatsApp) corría antes de eso. Log real de producción, 07-10-2026, todo
 * ANTES de "[DB] Lista para usar":
 *
 *   [FollowUpScheduler] Failed to process due follow-ups error: {}
 *   [RemarketingScheduler] Error en tick inicial err: Cannot read properties of undefined (reading 'select')
 *   [MarketingExecutor] no se pudo agendar el barrido err: Cannot read properties of undefined (reading 'select')
 *   [TenantManager] Failed to get tenant by ID {id:1} error: {}
 *
 * Los dos primeros solo perdían la primera vuelta; el tercero quedaba MUERTO
 * (el barrido de tareas aprobadas no se volvía a agendar nunca) y el cuarto
 * arrancaba WhatsApp con el negocio de relleno en vez del real. Ya había
 * pasado con el sondeo de Telegram (19-09). La regla, para no repetirlo:
 * todo arranque que toca la base espera esta promesa, no un `setTimeout`.
 *
 * Nunca lanza: si la base no levanta, `ensureDbReady` ya lo registró y cada
 * consumidor falla con su propio log, como antes.
 */
export async function cuandoLaBaseEsteLista(): Promise<void> {
  try {
    const m: any = await import("@workspace/db");
    if (typeof m.ensureDbReady === "function") await m.ensureDbReady();
  } catch {
    /* un mock de pruebas sin ensureDbReady, o la base caída: sigue igual */
  }
}
