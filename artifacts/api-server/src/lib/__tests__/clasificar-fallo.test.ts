/**
 * Un proveedor sin crédito no se arregla en 5 segundos.
 *
 * Todos los mensajes de error de acá abajo son REALES: salieron de probar los
 * proveedores de producción el 2026-08-22. El cooldown era de 5 segundos y
 * recién después de 2 fallos, así que el bot reintentaba en CADA mensaje uno
 * que estaba sin saldo y otro con la cuota agotada hasta dentro de 21 horas.
 * Cada reintento se lleva su timeout con un cliente esperando.
 */
import { describe, it, expect } from "vitest";
import { clasificarFallo, resetProviderRotation, reportProviderResult, getOptimizedProviderOrder } from "../optimized-rotation";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

describe("Clasificar por qué falló un proveedor", () => {
  it("sin medio de pago: se aparta de una y por horas", () => {
    const r = clasificarFallo("CreditsError: No payment method. Add a payment method here: https://opencode.ai/...");
    expect(r.clase).toBe("sin_credito");
    expect(r.inmediato).toBe(true);
    expect(r.cooldownMs).toBeGreaterThanOrEqual(6 * HORA);
  });

  it("cuota gratuita agotada: se aparta de una, no se reintenta cada mensaje", () => {
    for (const e of [
      "Error from provider (Console): Rate limit exceeded. Please try again later.",
      "FreeUsageLimitError: Rate limit exceeded",
      "429 Too Many Requests",
    ]) {
      const r = clasificarFallo(e);
      expect(r.clase).toBe("cuota_agotada");
      expect(r.inmediato).toBe(true);
      expect(r.cooldownMs).toBeGreaterThanOrEqual(1 * HORA);
    }
  });

  it("credencial inválida o vencida: se aparta por horas", () => {
    const r = clasificarFallo('{"message":"Bad credentials","status":"401"}');
    expect(r.clase).toBe("sin_clave");
    expect(r.inmediato).toBe(true);
  });

  it("un MODELO caído NO aparta al proveedor entero", () => {
    // opencode_zen tiene 64 modelos: que uno esté muerto no lo deja inútil.
    //
    // Este test comprobaba la clase Y un cooldown corto, usando lo segundo como
    // prueba de lo primero. No lo era: lo que impide apartar al proveedor es el
    // corte temprano de `reportFailure` para esta clase (ver el test de abajo,
    // que ahora lo fija directamente), no el valor del enfriamiento. La
    // penitencia de Atlas es por proveedor|MODELO, así que un enfriamiento
    // largo saca al modelo muerto y deja intactos a los demás de esa cuenta.
    for (const e of [
      "400 Error from provider (Console): Upstream request failed: Model is unavailable.",
      "401 Model ling-3.0-flash-free is not supported",
      "The model `llama-3.1-8b-instant` does not exist or you do not have access to it",
    ]) {
      expect(clasificarFallo(e).clase).toBe("modelo_caido");
    }
  });

  // "unavailable" sí puede ser un tropiezo pasajero del proveedor de arriba, y
  // conserva la segunda oportunidad y el enfriamiento corto de siempre.
  it("un modelo caído por un tropiezo del upstream se reintenta pronto", () => {
    const r = clasificarFallo("400 Error from provider (Console): Upstream request failed: Model is unavailable.");
    expect(r.inmediato).toBe(false);
    expect(r.cooldownMs).toBeLessThan(2 * MINUTO);
  });

  // Este caso estaba junto con el timeout bajo "cooldown corto", y son dos
  // cosas distintas: un tropiezo de red falla en el acto, así que reintentarlo
  // es barato y suele ser de verdad pasajero. Ese es el que conserva el
  // enfriamiento corto original.
  it("un tropiezo de red es transitorio de verdad: cooldown corto", () => {
    const r = clasificarFallo("Connection error.: fetch failed: getaddrinfo ENOTFOUND models.inference.ai.azure.com");
    expect(r.clase).toBe("lento");
    expect(r.cooldownMs).toBeLessThanOrEqual(5 * MINUTO);
  });

  // El timeout NO es barato, y por eso se separó del caso de arriba.
  //
  // Trace real del admin (2026-08-24) pidiéndole a Atlas crear un anuncio: de
  // los 135 s del turno, 131 se fueron en tres modelos que agotaron su ventana
  // sin devolver una letra (55 s + 51 s + 25 s). El turno se cortó sin crear
  // nada, dos veces seguidas.
  //
  // Con el enfriamiento de 2 minutos, esos modelos volvían a estar disponibles
  // antes de que el admin terminara de leer la respuesta anterior. Un fallo que
  // cuesta 55 s no puede tener un castigo más blando que uno que cuesta 0,3 s
  // ("sin crédito" aparta 6 horas).
  it("un modelo que se cuelga la ventana entera se aparta de verdad", () => {
    for (const e of ["Request timed out.", "The operation was aborted due to timeout"]) {
      const r = clasificarFallo(e);
      expect(r.clase).toBe("lento");
      expect(r.cooldownMs).toBeGreaterThanOrEqual(10 * MINUTO);
    }
  });

  it("lo que no se reconoce no se castiga de más", () => {
    const r = clasificarFallo("algo raro pasó");
    expect(r.clase).toBe("desconocido");
    expect(r.inmediato).toBe(false);
    expect(r.cooldownMs).toBeLessThanOrEqual(1 * MINUTO);
  });

  it("sin mensaje de error tampoco explota", () => {
    expect(clasificarFallo(undefined).clase).toBe("desconocido");
    expect(clasificarFallo("").clase).toBe("desconocido");
  });

  // El orden se mantiene --sin crédito espera mucho más que uno lento-- pero la
  // distancia se acortó a propósito: el factor 50 salía de cuando un timeout
  // esperaba 2 minutos, y ese castigo resultó ser demasiado blando para el
  // fallo que MÁS tiempo cuesta (ver el test del modelo que se cuelga). Con 6 h
  // contra 15 min la diferencia sigue siendo de 24 veces.
  it("un proveedor sin crédito espera MUCHO más que uno lento", () => {
    const sinCredito = clasificarFallo("No payment method");
    const lento = clasificarFallo("Request timed out.");
    expect(sinCredito.cooldownMs).toBeGreaterThan(lento.cooldownMs * 10);
  });
});

describe("Un modelo roto no puede tumbar al proveedor que se paga", () => {
  it("la respuesta vacía cuenta como modelo caído, no como fallo del proveedor", () => {
    // deepseek-v4-flash-vision-exp contesta 200 sin una sola letra (medido
    // 2026-08-22). Es un modelo roto disfrazado de éxito.
    const r = clasificarFallo("respuesta vacía");
    expect(r.clase).toBe("modelo_caido");
    expect(r.inmediato).toBe(false);
  });

  it("un modelo caído pasajero nunca dispara un cooldown largo", () => {
    for (const e of ["respuesta vacía", "Model is unavailable"]) {
      expect(clasificarFallo(e).cooldownMs).toBeLessThan(60_000);
    }
  });

  /**
   * LA garantía de verdad, fijada donde vive: `reportFailure` corta antes para
   * `modelo_caido` y ni siquiera le cuenta el fallo al proveedor.
   *
   * Esto es lo que impide que dos respuestas vacías del `vision-exp` aparten a
   * DeepSeek entero --el proveedor de PAGO, el que responde en 293 ms-- por
   * culpa de uno solo de sus modelos. Antes esa garantía se comprobaba de
   * refilón, exigiendo un cooldown corto; con el corte temprano, el valor del
   * enfriamiento acá da igual, y por eso `model_not_found` puede tener uno
   * largo sin poner en riesgo nada.
   */
  it("por más largo que sea el cooldown, un modelo caído no le cuenta al proveedor", () => {
    resetProviderRotation();
    const error404 = "The model `x` does not exist or you do not have access to it";

    // El enfriamiento de este fallo es de HORAS...
    expect(clasificarFallo(error404).cooldownMs).toBeGreaterThanOrEqual(60 * MINUTO);

    const antes = getOptimizedProviderOrder();
    // ...y aun así, reportarlo tres veces no saca al proveedor de la rotación.
    for (let i = 0; i < 3; i++) reportProviderResult("groq", false, undefined, error404);
    expect(getOptimizedProviderOrder()).toEqual(antes);

    // Contraste: un fallo que SÍ es del proveedor lo aparta.
    reportProviderResult("groq", false, undefined, "CreditsError: No payment method");
    expect(getOptimizedProviderOrder()).not.toEqual(antes);
  });
});

/**
 * Un modelo al que la cuenta NO tiene acceso no vuelve solo.
 *
 * Medido contra la cuenta real (2026-08-25), llamando a OpenCode directamente
 * modelo por modelo: `llama-3.1-8b-instant` y `llama-3.3-70b-versatile` figuran
 * en el catálogo de Groq pero devuelven 404 "does not exist or you do not have
 * access to it" en TODOS los intentos. El catálogo lista lo que Groq ofrece en
 * general, no lo que esta cuenta puede usar.
 *
 * Estaban clasificados con 30 segundos de enfriamiento, junto a la "respuesta
 * vacía". Son dos cosas distintas: una respuesta vacía puede ser un mal momento
 * del modelo; un modelo que no existe no va a empezar a existir. Con 30 s se
 * reintentaban en cada turno, para siempre, gastando un lugar de la cadena.
 *
 * El enfriamiento largo es seguro porque la penitencia es por MODELO, no por
 * proveedor: apartar el llama que no existe no toca a los otros de esa cuenta.
 */
describe("Modelo que la cuenta no puede usar", () => {
  const NO_EXISTEN = [
    "The model `llama-3.1-8b-instant` does not exist or you do not have access to it.",
    "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
    "401 Model ling-3.0-flash-free is not supported",
  ];

  it.each(NO_EXISTEN)("se aparta de una vez y por horas: %s", (e) => {
    const r = clasificarFallo(e);
    expect(r.clase).toBe("modelo_caido");
    expect(r.inmediato).toBe(true);
    expect(r.cooldownMs).toBeGreaterThanOrEqual(60 * MINUTO);
  });

  // El caso que NO cambia: una respuesta vacía puede ser pasajera, y además
  // apartar por eso al proveedor de pago ya costó caro antes.
  it("la respuesta vacía sigue con enfriamiento corto y segunda oportunidad", () => {
    const r = clasificarFallo("respuesta vacía");
    expect(r.clase).toBe("modelo_caido");
    expect(r.inmediato).toBe(false);
    expect(r.cooldownMs).toBeLessThan(2 * MINUTO);
  });

  // Y lo que importa de verdad: un 404 de UN modelo no puede llevarse puesto al
  // proveedor entero, que es lo que pasaría si se leyera como credencial mala.
  it("no lo confunde con una credencial rechazada", () => {
    expect(clasificarFallo("401 Model ling-3.0-flash-free is not supported").clase).not.toBe("sin_clave");
  });
});
