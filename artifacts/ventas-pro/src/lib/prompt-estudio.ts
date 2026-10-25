/** Una respuesta al plan debe llegar sin el prefijo editorial del estudio. */
export function promptDelEstudio(contexto: string, pedido: string, respuestaAlPlan = false): string {
  const limpio = pedido.trim();
  const decision = /^(s[ií](,? hacelo)?|no(,? dejalo as[ií])?)$/i.test(limpio);
  return respuestaAlPlan || decision ? limpio : `${contexto}\n\n${limpio}`;
}
