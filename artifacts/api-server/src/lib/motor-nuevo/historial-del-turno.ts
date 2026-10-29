import type { Parte, Producto } from "./herramientas";
import { laSeccionMuestraContenido, resumenDeLaFicha } from "./lo-que-dice-la-ficha";

/** Memoria común a WhatsApp y al probador: incluye lo que salió en las fichas. */
export function textoDelTurnoParaHistorial(partes: Parte[], catalogo: Producto[]): string {
  const texto = partes
    .filter((p) => p.kind === "text" || p.kind === "voz")
    .map((p) => p.kind === "voz" ? `🎙️ (nota de voz) ${p.content || ""}` : p.kind === "text" ? p.content || "" : "")
    .join("\n\n").trim();
  const fichas = partes.filter((p) => p.kind === "card").map((p) => {
    const prod = catalogo.find((x) => x.id === p.productId);
    const sec = p.seccion || "completa";
    const precio = prod?.price != null && Number(prod.price) > 0 ? ` — $${Number(prod.price).toLocaleString("es-CO")}` : "";
    const marca = `[ficha ${sec} de ${prod?.name ?? p.productId}${sec === "precio" || sec === "completa" ? precio : ""}]`;
    if (!prod || !laSeccionMuestraContenido(sec)) return marca;
    const hechos = resumenDeLaFicha(prod);
    return hechos ? `${marca}\nLo que le mostró: ${hechos}` : marca;
  });
  return [texto, ...fichas].filter(Boolean).join("\n\n");
}
