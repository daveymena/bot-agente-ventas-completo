/** Ruta activa: coincide exacta o por prefijo de sección. */
export function estaActiva(location: string, href: string, search = ""): boolean {
  const [ruta, consulta] = href.split("?");
  if (location !== ruta && !(ruta !== "/" && location.startsWith(`${ruta}/`))) return false;
  const actual = new URLSearchParams(search);
  if (consulta) return [...new URLSearchParams(consulta)].every(([key, value]) => actual.get(key) === value);
  return ruta !== "/estudio" || actual.get("espacio") !== "creativos";
}

