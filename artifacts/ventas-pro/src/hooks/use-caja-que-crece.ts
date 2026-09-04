import { useEffect, useRef } from "react";

/**
 * Una caja de escribir que crece con lo que se escribe.
 *
 * El problema, señalado por el admin el 2026-09-02 con una captura de su
 * celular: *"el chat de escritura debería renderizarse al texto interno e ir
 * creciendo si no cabe, así como en este momento re escribo y el chat aumenta
 * el espacio arriba y abajo. Esto pasa casi en todos lados de la app"*.
 *
 * Tenía razón en las dos mitades. En Atlas había un `<textarea rows={1}>` con
 * un comentario que decía "campo que CRECE con lo que se escribe" y nada que lo
 * hiciera crecer: `min-h` y `max-h` de CSS dejan la caja clavada en el mínimo y
 * el texto scrollea por dentro. Y en la pantalla de conversaciones era peor
 * todavía --un `<input>` de una línea--, así que una respuesta larga a un
 * cliente se iba de costado y no había forma de releerla antes de mandarla.
 *
 * ── Por qué hace falta JavaScript ────────────────────────────────────────
 *
 * Un `<textarea>` no tiene alto automático: su alto es `rows`, y punto. No hay
 * CSS que lo haga seguir al contenido. Así que se mide.
 *
 * El truco es el `height = "auto"` de la primera línea. Sin él, el alto que ya
 * tenía la caja actúa de piso para `scrollHeight`, y entonces la caja crece
 * pero no se achica nunca al borrar. Es el error clásico de este arreglo, y por
 * eso las dos líneas van juntas y en ese orden.
 *
 * ── Por qué hay un tope ──────────────────────────────────────────────────
 *
 * Porque el alto se lo saca al área de mensajes. Una caja que crece sin límite
 * termina tapando lo que el otro acaba de escribir, que es justo lo que uno
 * necesita leer para contestar. Pasado el tope, scrollea por dentro.
 *
 * Uso:
 *
 *   const caja = useCajaQueCrece(texto);
 *   <Textarea ref={caja} value={texto} rows={1} className="resize-none ..." />
 *
 * El valor va como argumento --y no se lee del DOM-- para que el alto se
 * recalcule también cuando el texto cambia sin que nadie teclee: al mandar el
 * mensaje y vaciarlo, al restaurar un borrador, al pegar una sugerencia.
 */
export function useCajaQueCrece(valor: string, alturaMaxima = 176) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ⚠️ Las dos líneas van juntas: sin el "auto", `scrollHeight` nunca baja
    // del alto actual y la caja no se achica al borrar.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, alturaMaxima)}px`;
  }, [valor, alturaMaxima]);

  return ref;
}
