/**
 * Estudio de creativos para anuncios de Facebook / Instagram.
 *
 * Elegís el producto y aparecen las maquetas YA armadas con su foto, su
 * precio y las condiciones reales del negocio. Se toca como un editor de
 * diseño (capas, mover, redimensionar, colores, letras), se le piden ganchos
 * a la IA y se exporta el PNG que va al anuncio.
 *
 * Lo que se ve es lo que se exporta: el lienzo usa el mismo dibujante
 * (`@estudio/escena`) que Chromium en el servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Undo2, Redo2, Save, Download, Sparkles, Plus, Type, Image as ImageIcon, Square, Layers, LayoutGrid, Eye, EyeOff, Lock, ArrowUp, ArrowDown, Trash2, Palette, ShieldAlert, FolderOpen, Wand2, SlidersHorizontal, Copy } from "lucide-react";
import { Lienzo } from "@/components/creativos/lienzo";
import { Propiedades } from "@/components/creativos/propiedades";
import { capasAHtml, FORMATOS, idNuevo, normalizarEscena, revisarEscena, type Capa, type Escena, type Formato } from "@estudio/escena";
import { MAQUETAS, armarCreativo, maquetaPorId, type DatosCreativo } from "@estudio/maquetas-creativo";
import type { KitDeMarca } from "@estudio/kit";
import { enlaceDeFuentes, FUENTES } from "@estudio/fuentes";
import { tintaSobre } from "@estudio/retoque";

type Producto = { id: number; name: string };
type Variante = { gancho: string; apoyo: string; cta: string; angulo?: string };
type Guardado = { id: string; nombre: string; productId: number | null; maqueta: string | null; escena: Escena; png: string | null; actualizado: string };

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(opts?.headers || {}) }, ...opts });
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || b?.message || `Error ${r.status}`); }
  return r.status === 204 ? (undefined as T) : r.json();
}

/** Nombres de capa que las maquetas usan para el copy: así una variante de IA sabe dónde va. */
const NOMBRES_GANCHO = ["Gancho", "Gancho resaltado"];

function datosDesdeEscena(base: DatosCreativo, e: Escena | null): DatosCreativo {
  if (!e) return base;
  const texto = (nombres: string[]) => (e.capas.find((c) => c.tipo === "texto" && nombres.includes(c.nombre || "")) as any)?.texto as string | undefined;
  return { ...base, gancho: texto(NOMBRES_GANCHO) ?? base.gancho, apoyo: texto(["Apoyo"]) ?? base.apoyo, cta: texto(["Texto del botón"]) ?? base.cta };
}

/** Cambia un color por otro en todas las capas (y recalcula la tinta encima). */
function recolorear(e: Escena, viejo: string, nuevo: string): Escena {
  const v = viejo.toLowerCase(), tintaVieja = tintaSobre(viejo).toLowerCase(), tintaNueva = tintaSobre(nuevo);
  const cambia = (c?: string | null) => (c && c.toLowerCase() === v ? nuevo : c);
  return {
    ...e,
    fondo: cambia(e.fondo) || e.fondo,
    capas: e.capas.map((c) => {
      if (c.tipo === "forma") return { ...c, relleno: cambia(c.relleno) || c.relleno, borde: cambia(c.borde) };
      if (c.tipo === "degradado") return { ...c, desde: cambia(c.desde) || c.desde, hasta: cambia(c.hasta) || c.hasta };
      if (c.tipo === "texto") {
        // Texto que iba SOBRE el acento (botón, precio en estrella): su tinta se recalcula.
        const sobreAcento = e.capas.some((f) => f.tipo === "forma" && f.relleno.toLowerCase() === v && Math.abs(f.x - c.x) < 3 && Math.abs(f.y - c.y) < 3);
        const color = sobreAcento && c.color?.toLowerCase() === tintaVieja ? tintaNueva : cambia(c.color);
        return { ...c, color: color || c.color, fondo: cambia(c.fondo) ?? null, contorno: cambia(c.contorno) ?? null };
      }
      return c;
    }),
  };
}

function Miniatura({ escena, ancho = 150, onClick, activo, titulo }: { escena: Escena; ancho?: number; onClick?: () => void; activo?: boolean; titulo?: string }) {
  const f = FORMATOS[escena.formato];
  const escala = ancho / f.ancho;
  const html = useMemo(() => capasAHtml(escena), [escena]);
  return (
    <button onClick={onClick} title={titulo} className={`block rounded-md overflow-hidden ring-1 ring-black/10 hover:ring-2 hover:ring-violet-500 transition ${activo ? "ring-2 ring-violet-600" : ""}`} style={{ width: ancho, height: f.alto * escala }}>
      <div style={{ width: f.ancho, height: f.alto, maxWidth: "none", transform: `scale(${escala})`, transformOrigin: "top left", pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: html }} />
    </button>
  );
}

export interface PropsCreativos {
  params?: unknown;
  incrustado?: boolean;
  producto?: number | "";
  onProducto?: (id: number | "") => void;
  onContexto?: (c: { productId: number | null; productoNombre: string | null; creativo: { id: string | null; nombre: string } | null }) => void;
  /** En la suite: abrir el espacio Marca. */
  onIrAMarca?: () => void;
  registrarGuardado?: (espacio: string, fn: (() => Promise<void>) | null) => void;
}

export default function CreativosPage(props: PropsCreativos = {}) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productId, setProductIdLocal] = useState<number | "">(() => {
    if (props.producto !== undefined && props.producto !== "") return props.producto;
    const q = new URLSearchParams(window.location.search).get("producto");
    return q && Number(q) > 0 ? Number(q) : "";
  });
  const setProductId = (v: number | "") => { setProductIdLocal(v); props.onProducto?.(v); };
  useEffect(() => { if (props.producto !== undefined && props.producto !== productId) setProductIdLocal(props.producto); }, [props.producto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [datos, setDatos] = useState<DatosCreativo | null>(null);
  // Kit de marca del negocio: todas las maquetas salen con su identidad.
  const [kit, setKit] = useState<KitDeMarca>({});
  const [kitDefinido, setKitDefinido] = useState(false);
  const [recorteMotivo, setRecorteMotivo] = useState<string | null>(null);
  const [veredicto, setVeredicto] = useState<{ puntaje: number; aprobado: boolean; problemas: string[]; fortalezas: string[]; fuente: string } | null>(null);
  const [juzgando, setJuzgando] = useState(false);
  const [versionDatos, setVersionDatos] = useState(0);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [formato, setFormato] = useState<Formato>("4:5");
  const [escena, setEscenaCruda] = useState<Escena | null>(null);
  const [maqueta, setMaqueta] = useState<string | null>(null);
  const [creativoId, setCreativoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("Creativo");
  const [guardadoJSON, setGuardadoJSON] = useState("");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [panel, setPanel] = useState<"maquetas" | "capas" | "ia" | "editar">("maquetas");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [zonaSegura, setZonaSegura] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [motorIA, setMotorIA] = useState<string | null>(null);
  const [pedidoIA, setPedidoIA] = useState("");
  const [pensando, setPensando] = useState(false);
  const [lote, setLote] = useState<{ escena: Escena; maqueta: string; gancho: string }[] | null>(null);
  const [misCreativos, setMisCreativos] = useState<Guardado[] | null>(null);
  const pasado = useRef<Escena[]>([]);
  const futuro = useRef<Escena[]>([]);
  const [, setTic] = useState(0);
  const escenaRef = useRef<Escena | null>(null);
  escenaRef.current = escena;
  const textoRef = useRef<HTMLTextAreaElement>(null);

  const hayCambios = !!escena && JSON.stringify(escena) !== guardadoJSON;
  const capa = escena?.capas.find((c) => c.id === seleccion) || null;
  const avisos = useMemo(() => (escena ? revisarEscena(escena) : []), [escena]);

  // Fuentes del estudio, cargadas una vez para el lienzo.
  useEffect(() => {
    if (document.getElementById("vp-fuentes-estudio")) return;
    const l = document.createElement("link");
    l.id = "vp-fuentes-estudio"; l.rel = "stylesheet"; l.href = enlaceDeFuentes(FUENTES.map((f) => f.id));
    document.head.appendChild(l);
  }, []);

  useEffect(() => { api<Producto[]>("/api/products").then((p) => setProductos(Array.isArray(p) ? p : [])).catch(() => toast.error("No se pudieron cargar los productos")); }, []);

  useEffect(() => {
    if (typeof productId !== "number") { setDatos(null); return; }
    setCargandoDatos(true); setVariantes([]); setMotorIA(null);
    api<any>(`/api/creativos/producto/${productId}`)
      .then((d) => { setDatos(d.datos); setKit(d.kit || {}); setKitDefinido(!!d.kitDefinido); setRecorteMotivo(d.recorteMotivo || null); })
      .catch((e) => { toast.error(e.message); setDatos(null); })
      .finally(() => setCargandoDatos(false));
  }, [productId, versionDatos]);

  // Guardaron el kit (espacio Marca): se recargan datos y maquetas.
  useEffect(() => {
    const recargar = () => setVersionDatos((v) => v + 1);
    window.addEventListener("estudio:kit", recargar);
    return () => window.removeEventListener("estudio:kit", recargar);
  }, []);

  // ── Historial ────────────────────────────────────────────────────────────
  const marcar = useCallback(() => {
    if (!escenaRef.current) return;
    pasado.current.push(escenaRef.current);
    if (pasado.current.length > 120) pasado.current.shift();
    futuro.current = [];
    setTic((t) => t + 1);
  }, []);
  /** Cambio con historial. */
  const setEscena = useCallback((e: Escena) => { marcar(); setEscenaCruda(e); }, [marcar]);
  const deshacer = useCallback(() => { const p = pasado.current.pop(); if (!p || !escenaRef.current) return; futuro.current.push(escenaRef.current); setEscenaCruda(p); setTic((t) => t + 1); }, []);
  const rehacer = useCallback(() => { const f = futuro.current.pop(); if (!f || !escenaRef.current) return; pasado.current.push(escenaRef.current); setEscenaCruda(f); setTic((t) => t + 1); }, []);

  const abrirEscena = (e: Escena, opts: { maqueta?: string | null; id?: string | null; nombre?: string; guardado?: boolean } = {}) => {
    pasado.current = []; futuro.current = [];
    setEscenaCruda(e);
    setFormato(e.formato);
    setMaqueta(opts.maqueta ?? null);
    setCreativoId(opts.id ?? null);
    if (opts.nombre) setNombre(opts.nombre);
    setGuardadoJSON(opts.guardado ? JSON.stringify(e) : "");
    setSeleccion(null);
    setPng(null);
    setTic((t) => t + 1);
  };

  const confirmarDescartar = () => !hayCambios || window.confirm("Tenés cambios sin guardar en este creativo. ¿Descartarlos?");

  const usarMaqueta = (id: string, f: Formato = formato, d: DatosCreativo | null = datos) => {
    if (!d) return;
    if (escena && maqueta !== id && !confirmarDescartar()) return;
    const prod = productos.find((p) => p.id === productId);
    abrirEscena(normalizarEscena(armarCreativo(maquetaPorId(id), d, f, kit)), { maqueta: id, nombre: `${prod?.name || "Creativo"} · ${maquetaPorId(id).nombre}` });
  };

  const cambiarFormato = (f: Formato) => {
    setFormato(f);
    if (!escena) return;
    // Con maqueta conocida se vuelve a diagramar para el formato nuevo,
    // conservando los textos que se hayan cambiado.
    if (maqueta && datos) {
      const nueva = normalizarEscena(armarCreativo(maquetaPorId(maqueta), datosDesdeEscena(datos, escena), f, kit));
      setEscena(nueva);
      setSeleccion(null);
    } else {
      setEscena({ ...escena, formato: f });
    }
  };

  // ── Capas ────────────────────────────────────────────────────────────────
  const cambiarCapa = (id: string, patch: Partial<Capa>, conHistorial = true) => {
    const e = escenaRef.current;
    if (!e) return;
    const nueva = { ...e, capas: e.capas.map((c) => (c.id === id ? ({ ...c, ...patch } as Capa) : c)) };
    if (conHistorial) setEscena(nueva); else setEscenaCruda(nueva);
  };
  const agregarCapa = (c: Capa) => {
    if (!escena) return;
    setEscena({ ...escena, capas: [...escena.capas, c] });
    setSeleccion(c.id);
    setPanel("editar");
  };
  const duplicarCapa = () => {
    if (!escena || !capa) return;
    const copia = { ...capa, id: idNuevo(), x: capa.x + 2, y: capa.y + 2, nombre: capa.nombre ? `${capa.nombre} (copia)` : undefined } as Capa;
    const i = escena.capas.findIndex((c) => c.id === capa.id);
    const capas = [...escena.capas]; capas.splice(i + 1, 0, copia);
    setEscena({ ...escena, capas }); setSeleccion(copia.id);
  };
  const borrarCapa = (id = seleccion) => {
    if (!escena || !id) return;
    setEscena({ ...escena, capas: escena.capas.filter((c) => c.id !== id) });
    setSeleccion(null);
  };
  const moverCapa = (id: string, dir: 1 | -1) => {
    if (!escena) return;
    const i = escena.capas.findIndex((c) => c.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= escena.capas.length) return;
    const capas = [...escena.capas]; [capas[i], capas[j]] = [capas[j], capas[i]];
    setEscena({ ...escena, capas });
  };

  // Atajos de teclado.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") { e.preventDefault(); void guardar(); return; }
      if (enCampo) return;
      if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
      if (mod && ((k === "z" && e.shiftKey) || k === "y")) { e.preventDefault(); rehacer(); return; }
      if (mod && k === "d") { e.preventDefault(); duplicarCapa(); return; }
      if (!capa) return;
      if (k === "delete" || k === "backspace") { e.preventDefault(); borrarCapa(); return; }
      if (k === "escape") { setSeleccion(null); return; }
      const paso = e.shiftKey ? 2 : 0.25;
      const d: Record<string, [number, number]> = { arrowleft: [-paso, 0], arrowright: [paso, 0], arrowup: [0, -paso], arrowdown: [0, paso] };
      if (d[k] && !capa.bloqueada) { e.preventDefault(); cambiarCapa(capa.id, { x: +(capa.x + d[k][0]).toFixed(2), y: +(capa.y + d[k][1]).toFixed(2) }); }
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  });

  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  // ── Guardar / exportar ───────────────────────────────────────────────────
  const guardar = async (): Promise<string | null> => {
    const e = escenaRef.current;
    if (!e) return null;
    setGuardando(true);
    try {
      const c = await api<Guardado>("/api/creativos", { method: "POST", body: JSON.stringify({ id: creativoId, nombre, productId: productId || null, maqueta, escena: e }) });
      setCreativoId(c.id);
      setGuardadoJSON(JSON.stringify(e));
      setMisCreativos(null);
      toast.success("Creativo guardado");
      return c.id;
    } catch (err: any) { toast.error(`No se pudo guardar: ${err.message}`); return null; }
    finally { setGuardando(false); }
  };

  const exportar = async () => {
    const id = hayCambios || !creativoId ? await guardar() : creativoId;
    if (!id) return;
    setExportando(true);
    try {
      const r = await api<{ png: string; avisos: any[] }>(`/api/creativos/${id}/exportar`, { method: "POST" });
      setPng(r.png);
      toast.success("PNG listo para el anuncio");
      const a = document.createElement("a"); a.href = r.png; a.download = `${nombre.replace(/[^\w-]+/g, "-")}.png`; a.click();
    } catch (err: any) { toast.error(err.message); }
    finally { setExportando(false); }
  };

  const juzgar = async () => {
    const e = escenaRef.current;
    if (!e) return;
    setJuzgando(true); setVeredicto(null);
    try { setVeredicto(await api("/api/creativos/juzgar", { method: "POST", body: JSON.stringify({ escena: e }) })); setPanel((p) => (window.innerWidth < 1024 ? "editar" : p)); }
    catch (err: any) { toast.error(err.message); }
    finally { setJuzgando(false); }
  };
  // La suite guarda el creativo abierto antes de que Atlas trabaje (así lo ve).
  useEffect(() => {
    if (!props.registrarGuardado) return;
    props.registrarGuardado("creativos", async () => { if (escenaRef.current && (hayCambios || !creativoId)) await guardar(); });
    return () => props.registrarGuardado?.("creativos", null);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Un cambio en la escena deja viejo el veredicto.
  useEffect(() => { setVeredicto(null); }, [escena]);

  const subirImagen = async (archivo: File): Promise<string | null> => {
    if (archivo.size > 8 * 1024 * 1024) { toast.error("La imagen pesa más de 8 MB"); return null; }
    const dataUrl = await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(archivo); });
    try { return (await api<{ url: string }>("/api/creativos/subir-imagen", { method: "POST", body: JSON.stringify({ dataUrl, nombre: archivo.name }) })).url; }
    catch (e: any) { toast.error(e.message); return null; }
  };

  const abrirMisCreativos = async () => {
    try { setMisCreativos(await api<Guardado[]>("/api/creativos")); } catch (e: any) { toast.error(e.message); }
  };

  // ── IA ───────────────────────────────────────────────────────────────────
  const pedirGanchos = async (pedido?: string) => {
    if (typeof productId !== "number") { toast.info("Elegí un producto"); return; }
    setPensando(true);
    try {
      const r = await api<{ variantes: Variante[]; motor: string }>("/api/creativos/ganchos", { method: "POST", body: JSON.stringify({ productId, cantidad: 5, pedido: pedido || null }) });
      setVariantes(r.variantes);
      setMotorIA(r.motor);
      if (r.motor === "respaldo") toast.info("La IA no respondió: te muestro ganchos armados con la ficha del producto.");
    } catch (e: any) { toast.error(e.message); }
    finally { setPensando(false); }
  };

  const aplicarVariante = (v: Variante) => {
    if (!escena) { if (datos) { const d = { ...datos, gancho: v.gancho, apoyo: v.apoyo || datos.apoyo, cta: v.cta || datos.cta }; setDatos(d); usarMaqueta(maqueta || MAQUETAS[0].id, formato, d); } return; }
    // Reemplaza el texto en las capas que son gancho / apoyo / botón; si la
    // maqueta es conocida, se vuelve a diagramar (un gancho más largo
    // necesita otro tamaño de letra).
    if (maqueta && datos) {
      setEscena(normalizarEscena(armarCreativo(maquetaPorId(maqueta), { ...datosDesdeEscena(datos, escena), gancho: v.gancho, apoyo: v.apoyo || datos.apoyo, cta: v.cta || datos.cta }, escena.formato, kit)));
      setSeleccion(null);
      return;
    }
    setEscena({ ...escena, capas: escena.capas.map((c) => c.tipo !== "texto" ? c : NOMBRES_GANCHO.includes(c.nombre || "") ? { ...c, texto: v.gancho } : c.nombre === "Apoyo" && v.apoyo ? { ...c, texto: v.apoyo } : c.nombre === "Texto del botón" && v.cta ? { ...c, texto: v.cta } : c) });
  };

  /** Varios de una: las mejores maquetas para el formato × los ganchos. */
  const armarLote = () => {
    if (!datos) return;
    const ganchos = variantes.length ? variantes.slice(0, 3) : [{ gancho: datos.gancho, apoyo: datos.apoyo || "", cta: datos.cta }];
    const maquetas = [...MAQUETAS].sort((a, b) => Number(b.ideal === formato) - Number(a.ideal === formato)).slice(0, ganchos.length > 1 ? 3 : 6);
    const out: { escena: Escena; maqueta: string; gancho: string }[] = [];
    for (const g of ganchos) for (const m of maquetas) out.push({ escena: normalizarEscena(armarCreativo(m, { ...datos, gancho: g.gancho, apoyo: g.apoyo || datos.apoyo, cta: g.cta || datos.cta }, formato, kit)), maqueta: m.id, gancho: g.gancho });
    setLote(out);
  };

  const guardarLote = async () => {
    if (!lote) return;
    setGuardando(true);
    let ok = 0;
    for (const it of lote) {
      try { await api("/api/creativos", { method: "POST", body: JSON.stringify({ nombre: `${it.gancho.slice(0, 40)} · ${maquetaPorId(it.maqueta).nombre}`, productId: productId || null, maqueta: it.maqueta, escena: it.escena }) }); ok++; } catch { /* sigue */ }
    }
    setGuardando(false);
    setMisCreativos(null);
    toast.success(`${ok} creativos guardados. Abrilos desde "Mis creativos" para exportarlos.`);
  };

  const recolor = (nuevo: string) => {
    if (!escena || !datos) return;
    const actual = kit.acento || datos.acento;
    setEscena(recolorear(escena, actual, nuevo));
    setDatos({ ...datos, acento: nuevo, sobreAcento: tintaSobre(nuevo) });
    if (kit.acento) setKit({ ...kit, acento: nuevo });
  };

  // ── Suite: contexto para Atlas y recarga cuando Atlas creó o cambió algo ──
  useEffect(() => {
    props.onContexto?.({ productId: typeof productId === "number" ? productId : null, productoNombre: productos.find((p) => p.id === productId)?.name || null, creativo: escena ? { id: creativoId, nombre } : null });
  }, [productId, productos, creativoId, nombre, !!escena]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refrescar = async () => {
      // Atlas guarda sus creativos en la misma carpeta: se abre la lista para
      // que se vean, y el abierto se recarga si Atlas lo editó (y no hay cambios locales).
      if (creativoId && !hayCambios) {
        try { const c = await api<Guardado>(`/api/creativos/${creativoId}`); abrirEscena(normalizarEscena(c.escena), { maqueta: c.maqueta, id: c.id, nombre: c.nombre, guardado: true }); setPng(c.png); } catch { /* sigue */ }
      }
      setMisCreativos(null);
    };
    window.addEventListener("estudio:refrescar", refrescar);
    return () => window.removeEventListener("estudio:refrescar", refrescar);
  });

  const galeria = useMemo(() => (datos ? MAQUETAS.map((m) => ({ m, escena: normalizarEscena(armarCreativo(m, datos, formato, kit)) })) : []), [datos, formato, kit]);

  const nuevaCapa = {
    texto: (): Capa => ({ id: idNuevo("t"), tipo: "texto", nombre: "Texto", texto: "Escribí acá", x: 10, y: 40, w: 80, h: 12, tam: 6, peso: 800, color: "#ffffff", alinear: "center", vertical: "center", fuente: "inter", sombra: true } as Capa),
    imagen: (): Capa => ({ id: idNuevo("i"), tipo: "imagen", nombre: "Foto", src: datos?.fotos[0] || "", x: 20, y: 20, w: 60, h: 45, ajuste: "contain" } as Capa),
    forma: (): Capa => ({ id: idNuevo("f"), tipo: "forma", nombre: "Forma", forma: "pastilla", relleno: datos?.acento || "#4f46e5", x: 25, y: 70, w: 50, h: 8 } as Capa),
    sello: (): Capa => ({ id: idNuevo("f"), tipo: "forma", nombre: "Sello", forma: "estallido", relleno: datos?.acento || "#e5342a", x: 68, y: 6, w: 26, h: (26 * FORMATOS[formato].ancho) / FORMATOS[formato].alto, rot: -10 } as Capa),
    degradado: (): Capa => ({ id: idNuevo("d"), tipo: "degradado", nombre: "Sombra", desde: "rgba(0,0,0,0)", hasta: "rgba(0,0,0,.75)", angulo: 180, x: 0, y: 50, w: 100, h: 50 } as Capa),
  };

  // ── Vista ────────────────────────────────────────────────────────────────
  const tabs: { id: typeof panel; etiqueta: string; icono: any; soloMovil?: boolean }[] = [
    { id: "maquetas", etiqueta: "Maquetas", icono: LayoutGrid },
    { id: "ia", etiqueta: "IA", icono: Sparkles },
    { id: "capas", etiqueta: "Capas", icono: Layers },
    { id: "editar", etiqueta: "Editar", icono: SlidersHorizontal, soloMovil: true },
  ];

  const panelIzquierdo = (
    <>
      {panel === "maquetas" && (
        <div className="p-3 space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold">Empezá en 3 pasos</p>
            <div className="grid grid-cols-3 gap-2 text-[10px] leading-tight text-muted-foreground">
              <p><span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-white">1</span>Elegí producto</p>
              <p><span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-white">2</span>Tocá un diseño</p>
              <p><span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-white">3</span>Editá y exportá</p>
            </div>
          </div>
          {!datos ? (
            <p className="text-xs text-muted-foreground">{cargandoDatos ? "Leyendo foto, precio y condiciones del producto…" : "Elegí un producto arriba. La vista previa usa su foto, precio y condiciones reales."}</p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">Ya armadas con tus datos reales. Tocá una para editarla.</p>
              {!kitDefinido && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] space-y-1">
                  <p><b>Sin kit de marca:</b> los colores se adivinan desde la foto y las piezas pueden verse genéricas.</p>
                  {props.onIrAMarca ? <button className="underline font-semibold" onClick={props.onIrAMarca}>Definir mi marca →</button> : <a className="underline font-semibold" href="/estudio?espacio=marca">Definir mi marca →</a>}
                </div>
              )}
              {recorteMotivo && <p className="text-[10px] text-muted-foreground">Foto sin recortar ({recorteMotivo}). Con una foto de producto sobre fondo liso, el producto sale flotando.</p>}
              <div className="grid grid-cols-2 gap-2">
                {galeria.map(({ m, escena: e }) => (
                  <div key={m.id} className="space-y-1">
                    <Miniatura escena={e} ancho={128} onClick={() => usarMaqueta(m.id)} activo={maqueta === m.id} titulo={m.descripcion} />
                    <p className="text-[10px] font-semibold leading-tight">{m.nombre}{m.ideal === formato ? " ★" : ""}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {panel === "ia" && (
        <div className="p-3 space-y-3">
          <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/30 p-2 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-violet-600" /> Ganchos con IA</p>
            <p className="text-[10px] text-muted-foreground">Desde ángulos distintos (dolor, deseo, curiosidad…). No inventa descuentos, cifras ni testimonios: lo que trae un número que no está en la ficha se descarta.</p>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void pedirGanchos(pedidoIA.trim()); }}>
              <Input value={pedidoIA} onChange={(e) => setPedidoIA(e.target.value)} placeholder="Opcional: 'para mamás', 'más divertido'…" className="h-8 text-xs" />
              <Button type="submit" size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white shrink-0" disabled={pensando || typeof productId !== "number"}>
                {pensando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              </Button>
            </form>
          </div>
          {variantes.map((v, i) => (
            <button key={i} onClick={() => aplicarVariante(v)} className="w-full text-left rounded-lg border p-2 hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20">
              {v.angulo && <span className="text-[9px] uppercase font-bold text-violet-600">{v.angulo}</span>}
              <p className="text-sm font-bold leading-tight">{v.gancho}</p>
              {v.apoyo && <p className="text-[11px] text-muted-foreground">{v.apoyo}</p>}
              <p className="text-[10px] mt-0.5">Botón: <b>{v.cta}</b></p>
            </button>
          ))}
          {motorIA && <p className="text-[10px] text-muted-foreground">{motorIA === "ia" ? "Escritos por la IA activa del negocio." : "Armados con la ficha (la IA no respondió)."}</p>}
          <div className="rounded-lg border p-2 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Varios de una</p>
            <p className="text-[10px] text-muted-foreground">Arma {variantes.length ? "las 3 mejores maquetas × 3 ganchos" : "6 maquetas con el gancho actual"} en {FORMATOS[formato].nombre}, para probar en el anuncio cuál funciona.</p>
            <Button size="sm" variant="outline" className="w-full h-8 text-xs" disabled={!datos} onClick={armarLote}>Armar lote</Button>
          </div>
          {datos && escena && (
            <div className="rounded-lg border p-2 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> Cambiar el color de marca</p>
              <div className="flex flex-wrap gap-1">
                {["#e5342a", "#f97316", "#16a34a", "#0e9f8a", "#2563eb", "#4f46e5", "#7c3aed", "#db2777", "#111827", "#8c7a5b"].map((c) => (
                  <button key={c} onClick={() => recolor(c)} className={`h-6 w-6 rounded-full border ${datos.acento.toLowerCase() === c ? "ring-2 ring-offset-1 ring-violet-500" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {panel === "capas" && escena && (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-5 gap-1">
            {([["texto", Type, "Texto"], ["imagen", ImageIcon, "Foto"], ["forma", Square, "Forma"], ["sello", Sparkles, "Sello"], ["degradado", Layers, "Sombra"]] as const).map(([k, Icono, n]) => (
              <button key={k} onClick={() => agregarCapa(nuevaCapa[k]())} className="flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[10px] hover:bg-muted" title={`Agregar ${n.toLowerCase()}`}>
                <Icono className="h-3.5 w-3.5" />{n}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {[...escena.capas].reverse().map((c) => (
              <div key={c.id} onClick={() => { setSeleccion(c.id); }} className={`flex items-center gap-1 rounded-md border px-1.5 py-1 cursor-pointer ${seleccion === c.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "hover:bg-muted"} ${c.oculta ? "opacity-50" : ""}`}>
                <span className="text-muted-foreground">{c.tipo === "texto" ? <Type className="h-3 w-3" /> : c.tipo === "imagen" ? <ImageIcon className="h-3 w-3" /> : <Square className="h-3 w-3" />}</span>
                <span className="text-[11px] flex-1 truncate">{c.nombre || c.tipo}{c.tipo === "texto" ? <span className="text-muted-foreground"> — {c.texto}</span> : null}</span>
                {c.bloqueada && <Lock className="h-3 w-3 text-muted-foreground" />}
                <button onClick={(e) => { e.stopPropagation(); moverCapa(c.id, 1); }} className="p-0.5 hover:bg-background rounded" title="Traer adelante" aria-label="Traer adelante"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); moverCapa(c.id, -1); }} className="p-0.5 hover:bg-background rounded" title="Llevar atrás" aria-label="Llevar atrás"><ArrowDown className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); cambiarCapa(c.id, { oculta: !c.oculta }); }} className="p-0.5 hover:bg-background rounded" title={c.oculta ? "Mostrar" : "Ocultar"} aria-label={c.oculta ? "Mostrar" : "Ocultar"}>{c.oculta ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button>
                <button onClick={(e) => { e.stopPropagation(); borrarCapa(c.id); }} className="p-0.5 hover:bg-background rounded text-red-600" title="Borrar" aria-label="Borrar"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {panel === "capas" && !escena && <p className="p-3 text-xs text-muted-foreground">Elegí una maqueta para empezar.</p>}
    </>
  );

  const panelPropiedades = escena ? (
    <>
      {veredicto && (
        <div className={`mx-3 mt-3 rounded-lg border p-2 space-y-1 ${veredicto.aprobado ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-rose-300 bg-rose-50 dark:bg-rose-950/30"}`}>
          <p className="text-xs font-bold flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {veredicto.fuente.startsWith("reglas (")
            ? <>Reglas medibles: {veredicto.puntaje}/10 {veredicto.aprobado ? "· sin errores de legibilidad" : "· conviene mejorarla"}</>
            : <>Director de arte: {veredicto.puntaje}/10 {veredicto.aprobado ? "· lista para publicar" : "· conviene mejorarla"}</>}</p>
          {veredicto.problemas.slice(0, 5).map((p, i) => <p key={i} className="text-[10px]">• {p}</p>)}
          {veredicto.fortalezas.length > 0 && <p className="text-[10px] text-emerald-700 dark:text-emerald-300">✓ {veredicto.fortalezas.join(" · ")}</p>}
          <p className="text-[9px] text-muted-foreground">{veredicto.fuente}</p>
        </div>
      )}
      <Propiedades
        ref={textoRef}
        escena={escena}
        capa={capa}
        onCapa={(patch) => capa && cambiarCapa(capa.id, patch)}
        onEscena={(patch) => setEscena({ ...escena, ...patch })}
        onDuplicar={duplicarCapa}
        onBorrar={() => borrarCapa()}
        fotos={datos?.fotos || []}
        acento={datos?.acento}
        onSubirImagen={subirImagen}
      />
      {avisos.length > 0 && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1">
          <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-800 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5" /> Antes de publicar</p>
          {avisos.map((a, i) => (
            <button key={i} onClick={() => a.capa && setSeleccion(a.capa)} className="block text-left text-[10px] text-amber-900 dark:text-amber-200 hover:underline">• {a.texto}</button>
          ))}
        </div>
      )}
    </>
  ) : <p className="p-3 text-xs text-muted-foreground">Acá vas a ver las propiedades de lo que elijas en el lienzo.</p>;

  return (
    <MarcoCreativos incrustado={!!props.incrustado}>
      <div className="flex flex-col flex-1 min-h-0 bg-background">
        {/* Barra superior */}
        <div className="shrink-0 border-b px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-1">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"><ImageIcon className="h-4 w-4 text-violet-500" /></div>
            <span className="text-sm font-bold hidden md:block">Creativos</span>
          </div>
          <select value={productId} onChange={(e) => { if (!confirmarDescartar()) return; setProductId(e.target.value ? Number(e.target.value) : ""); setEscenaCruda(null); setMaqueta(null); setCreativoId(null); setPanel("maquetas"); }}
            className="h-8 rounded-md border bg-background px-2 text-xs min-w-0 flex-1 sm:flex-none sm:w-[200px]" aria-label="Producto">
            <option value="">Elegí un producto…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Formato">
            {(Object.keys(FORMATOS) as Formato[]).map((f) => (
              <button key={f} onClick={() => cambiarFormato(f)} aria-pressed={formato === f} title={`${FORMATOS[f].nombre}: ${FORMATOS[f].uso}`}
                className={`h-7 px-2 rounded text-[11px] font-semibold ${formato === f ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>{f}</button>
            ))}
          </div>
          {escena && <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 text-xs w-full sm:w-[200px] order-last sm:order-none" aria-label="Nombre del creativo" />}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={abrirMisCreativos} title="Mis creativos" aria-label="Mis creativos"><FolderOpen className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={!pasado.current.length} onClick={deshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer"><Undo2 className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={!futuro.current.length} onClick={rehacer} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer"><Redo2 className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!escena || guardando || (!hayCambios && !!creativoId)} onClick={() => void guardar()}>
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Save className="h-3.5 w-3.5 sm:mr-1" />}<span className="hidden sm:inline">{hayCambios || !creativoId ? "Guardar" : "Guardado"}</span>
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!escena || juzgando} onClick={() => void juzgar()} title="El director de arte revisa la pieza: legibilidad, contraste, jerarquía, producto visible">
              {juzgando ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 sm:mr-1" />}<span className="hidden sm:inline">Revisar</span>
            </Button>
            <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white" disabled={!escena || exportando} onClick={() => void exportar()}>
              {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Download className="h-3.5 w-3.5 sm:mr-1" />}<span className="hidden sm:inline">Exportar PNG</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Izquierda (escritorio) */}
          <aside className={`hidden lg:flex flex-col border-r min-h-0 ${props.incrustado ? "w-[260px] 2xl:w-[300px]" : "w-[300px]"}`}>
            <div className="flex border-b p-1 gap-1 shrink-0">
              {tabs.filter((t) => !t.soloMovil).map((t) => (
                <button key={t.id} onClick={() => setPanel(t.id)} aria-pressed={panel === t.id} className={`flex-1 h-8 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1 ${panel === t.id ? "bg-muted" : "text-muted-foreground"}`}>
                  <t.icono className="h-3.5 w-3.5" />{t.etiqueta}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">{panelIzquierdo}</div>
          </aside>

          {/* Lienzo */}
          <main className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(circle,#1e293b_1px,transparent_1px)] [background-size:18px_18px] p-3 sm:p-6 flex flex-col items-center">
            {escena ? (
              <>
                <div className="w-full max-w-[760px] flex items-center justify-between mb-2 text-[11px] text-muted-foreground">
                  <span>{FORMATOS[escena.formato].nombre} · {FORMATOS[escena.formato].ancho}×{FORMATOS[escena.formato].alto}</span>
                  {(escena.formato === "9:16" || escena.formato === "4:5") && (
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={zonaSegura} onChange={(e) => setZonaSegura(e.target.checked)} /> Zona segura de Meta</label>
                  )}
                </div>
                <div className="w-full max-w-[760px]">
                  <Lienzo
                    escena={escena}
                    seleccion={seleccion}
                    onSeleccionar={(id) => { setSeleccion(id); }}
                    onEmpezarCambio={marcar}
                    onMover={(id, caja) => cambiarCapa(id, caja, false)}
                    onDobleClic={(id) => { setSeleccion(id); if (window.innerWidth < 1024) { setPanel("editar"); setMobilePanelOpen(true); } setTimeout(() => { textoRef.current?.focus(); textoRef.current?.select(); }, 60); }}
                    zonaSegura={zonaSegura}
                    maxAlto={typeof window !== "undefined" ? Math.max(280, window.innerHeight - (mobilePanelOpen ? 500 : 220)) : 700}
                  />
                </div>
                {png && (
                  <div className="mt-3 text-xs flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                    <span className="text-emerald-700 font-semibold">PNG listo</span>
                    <a href={png} target="_blank" rel="noreferrer" className="underline truncate max-w-[220px]">{png}</a>
                    <button className="underline" onClick={() => { void navigator.clipboard?.writeText(new URL(png, window.location.origin).href); toast.success("URL copiada"); }}>Copiar URL</button>
                  </div>
                )}
              </>
            ) : (
              <div className="m-auto max-w-sm text-center space-y-3 py-10">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-500/10 grid place-items-center"><Sparkles className="h-7 w-7 text-violet-500" /></div>
                <p className="text-lg font-bold">Creativos para tus anuncios</p>
                <p className="text-sm text-muted-foreground">Elegí un producto y en segundos tenés {MAQUETAS.length} diseños armados con su foto, precio y condiciones reales, en el formato que pide Meta. Después los tocás como en un editor de diseño.</p>
                {datos && <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => usarMaqueta(MAQUETAS.find((m) => m.ideal === formato)?.id || MAQUETAS[0].id)}><Plus className="h-4 w-4 mr-1" /> Empezar con la recomendada</Button>}
              </div>
            )}
          </main>

          {/* Derecha (escritorio) */}
          <aside className={`hidden lg:block border-l overflow-y-auto ${props.incrustado ? "w-[260px] 2xl:w-[300px]" : "w-[300px]"}`}>{panelPropiedades}</aside>

          {/* Móvil: un panel debajo del lienzo, con pestañas */}
          <div className={`lg:hidden border-t flex flex-col shrink-0 min-h-0 transition-[height] duration-200 ${mobilePanelOpen ? "h-[min(46dvh,420px)]" : "h-11"}`}>
            <div className="flex p-1 gap-1 shrink-0 border-b">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => { if (panel === t.id) setMobilePanelOpen((open) => !open); else { setPanel(t.id); setMobilePanelOpen(true); } }} aria-pressed={panel === t.id && mobilePanelOpen} className={`flex-1 h-9 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${panel === t.id && mobilePanelOpen ? "bg-muted" : "text-muted-foreground"}`}>
                  <t.icono className="h-3.5 w-3.5" />{t.etiqueta}
                </button>
              ))}
            </div>
            <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${mobilePanelOpen ? "" : "hidden"}`}>{panel === "editar" ? panelPropiedades : panelIzquierdo}</div>
          </div>
        </div>
      </div>

      {/* Lote de variantes */}
      {lote && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setLote(null)}>
          <div className="w-full max-w-4xl rounded-xl bg-background p-4 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{lote.length} variantes para probar</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setLote(null)}>Cerrar</Button>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" disabled={guardando} onClick={() => void guardarLote()}>{guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}Guardar todas</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {lote.map((it, i) => (
                <div key={i} className="space-y-1">
                  <Miniatura escena={it.escena} ancho={180} onClick={() => { if (!confirmarDescartar()) return; abrirEscena(it.escena, { maqueta: it.maqueta, nombre: `${it.gancho.slice(0, 40)} · ${maquetaPorId(it.maqueta).nombre}` }); setLote(null); }} titulo="Abrir para editar" />
                  <p className="text-[10px] leading-tight"><b>{maquetaPorId(it.maqueta).nombre}</b> · {it.gancho}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mis creativos */}
      {misCreativos && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setMisCreativos(null)}>
          <div className="w-full max-w-4xl rounded-xl bg-background p-4 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">Mis creativos</p>
              <Button size="sm" variant="ghost" onClick={() => setMisCreativos(null)}>Cerrar</Button>
            </div>
            {misCreativos.length === 0 && <p className="text-sm text-muted-foreground">Todavía no guardaste ninguno.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {misCreativos.map((c) => (
                <div key={c.id} className="space-y-1">
                  <Miniatura escena={c.escena} ancho={180} titulo="Abrir" onClick={() => {
                    if (!confirmarDescartar()) return;
                    if (c.productId) setProductId(c.productId);
                    abrirEscena(normalizarEscena(c.escena), { maqueta: c.maqueta, id: c.id, nombre: c.nombre, guardado: true });
                    setPng(c.png);
                    setMisCreativos(null);
                  }} />
                  <p className="text-[10px] leading-tight font-semibold truncate">{c.nombre}</p>
                  <div className="flex gap-2 text-[10px]">
                    {c.png && <a href={c.png} target="_blank" rel="noreferrer" className="underline">PNG</a>}
                    <button className="text-red-600 underline" onClick={async () => {
                      if (!window.confirm(`¿Borrar "${c.nombre}"? No se puede deshacer.`)) return;
                      try { await api(`/api/creativos/${c.id}`, { method: "DELETE" }); setMisCreativos((l) => (l || []).filter((x) => x.id !== c.id)); if (creativoId === c.id) setCreativoId(null); } catch (e: any) { toast.error(e.message); }
                    }}>Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </MarcoCreativos>
  );
}

function MarcoCreativos({ incrustado, children }: { incrustado: boolean; children: React.ReactNode }) {
  return incrustado ? <div className="flex flex-col flex-1 min-h-0 h-full">{children}</div> : <Layout chatCompleto>{children}</Layout>;
}
