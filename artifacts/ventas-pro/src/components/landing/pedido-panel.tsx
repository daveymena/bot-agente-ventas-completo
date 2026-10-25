/**
 * El formulario de pedido de la landing: verificación por WhatsApp,
 * upsell/downsell y antifraude.
 *
 * Verificación y ofertas se guardan en `design.pedido` de ESTA landing; el
 * antifraude es del negocio (todas sus landings) y va por /antifraude. Las
 * reglas que se aplican viven en el servidor (lib/landing/pedido-seguro.ts):
 * este panel solo las escribe.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";

type Oferta = { activo?: boolean; productId?: number | null; cantidad?: number; precio?: number; titulo?: string };
type Pedido = { verificarWhatsapp?: boolean; upsell?: Oferta | null; downsell?: Oferta | null };
type Antifraude = { maxPedidosPorTelefono24h: number; maxPedidosPorIp24h: number; telefonosBloqueados: string[]; ipsBloqueadas: string[]; ciudadesBloqueadas: string[] };

const pesos = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CO");
const aLista = (t: string) => t.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function Fila({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-foreground mb-1">{titulo}</span>
      {children}
      {ayuda && <span className="block text-[10px] text-muted-foreground mt-1">{ayuda}</span>}
    </label>
  );
}

export function PedidoPanel({ landingId, design, productos, productoDeLanding, onGuardado }: {
  landingId: number;
  design: any;
  productos: { id: number; name: string; price?: string }[];
  productoDeLanding?: number | null;
  onGuardado: (design: any) => void;
}) {
  const inicial: Pedido = (design && typeof design === "object" && design.pedido) || {};
  const [pedido, setPedido] = useState<Pedido>(inicial);
  const [af, setAf] = useState<Antifraude | null>(null);
  const [textos, setTextos] = useState({ telefonos: "", ips: "", ciudades: "" });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => { setPedido((design && design.pedido) || {}); setAviso(null); }, [landingId, design]);
  useEffect(() => {
    api<Antifraude>("/api/landing-pages/antifraude").then((a) => {
      setAf(a);
      setTextos({ telefonos: a.telefonosBloqueados.join("\n"), ips: a.ipsBloqueadas.join("\n"), ciudades: a.ciudadesBloqueadas.join("\n") });
    }).catch(() => setAf(null));
  }, []);

  const up = pedido.upsell || null;
  const down = pedido.downsell || null;
  const ponerUp = (c: Partial<Oferta>) => setPedido((p) => ({ ...p, upsell: { cantidad: 1, ...(p.upsell || {}), ...c } }));
  const ponerDown = (c: Partial<Oferta>) => setPedido((p) => ({ ...p, downsell: { ...(p.downsell || {}), ...c } }));
  const downInvalido = !!(up?.precio && down?.precio && down.precio >= up.precio);

  async function guardar() {
    setGuardando(true); setAviso(null);
    try {
      const limpio: Pedido = {
        verificarWhatsapp: !!pedido.verificarWhatsapp,
        upsell: up && Number(up.precio) > 0 ? { ...up, precio: Math.round(Number(up.precio)), cantidad: Math.max(1, Number(up.cantidad) || 1) } : null,
        downsell: up && down && Number(down.precio) > 0 && !downInvalido ? { ...down, precio: Math.round(Number(down.precio)) } : null,
      };
      const nuevo = { ...(design || {}), pedido: limpio };
      await api(`/api/landing-pages/${landingId}`, { method: "PATCH", body: JSON.stringify({ design: nuevo }) });
      if (af) {
        const guardado = await api<Antifraude>("/api/landing-pages/antifraude", {
          method: "PUT",
          body: JSON.stringify({ ...af, telefonosBloqueados: aLista(textos.telefonos), ipsBloqueadas: aLista(textos.ips), ciudadesBloqueadas: aLista(textos.ciudades) }),
        });
        setAf(guardado);
      }
      onGuardado(nuevo);
      setAviso({ tipo: "ok", texto: "Guardado. La página publicada ya lo usa." });
    } catch (e: any) {
      setAviso({ tipo: "error", texto: `No se pudo guardar (${e.message}). Revisa tu conexión e intenta de nuevo.` });
    } finally { setGuardando(false); }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs">
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold">Confirmar por WhatsApp</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">El cliente nos envía un código desde su WhatsApp y recién ahí se despacha. Frena los pedidos con números falsos.</p>
            </div>
            <Switch checked={!!pedido.verificarWhatsapp} onCheckedChange={(v) => setPedido((p) => ({ ...p, verificarWhatsapp: v }))} aria-label="Confirmar pedidos por WhatsApp" />
          </div>
          {pedido.verificarWhatsapp && (
            <p className="rounded-md bg-amber-50 text-amber-900 px-2.5 py-2 text-[11px] leading-relaxed">
              Los pedidos sin confirmar quedan en <b>Pedidos</b> como "por verificar" durante 48 horas. Tu WhatsApp tiene que estar conectado para recibir los códigos.
            </p>
          )}
        </section>

        <section className="space-y-2.5 border-t pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold">Oferta extra (upsell)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Una casilla en el formulario para agregar algo más antes de confirmar.</p>
            </div>
            <Switch checked={!!up} onCheckedChange={(v) => setPedido((p) => ({ ...p, upsell: v ? { cantidad: 1, productId: null, precio: undefined, titulo: "" } : null, downsell: v ? p.downsell : null }))} aria-label="Ofrecer un extra" />
          </div>
          {up && (
            <div className="space-y-2.5">
              <Fila titulo="Qué se ofrece">
                <select className="h-8 w-full rounded-md border bg-background px-2" value={up.productId ?? ""} onChange={(e) => ponerUp({ productId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Más unidades del mismo producto</option>
                  {productos.filter((p) => p.id !== productoDeLanding).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Fila>
              <div className="grid grid-cols-2 gap-2">
                <Fila titulo="Unidades"><Input className="h-8" type="number" min={1} max={10} value={up.cantidad ?? 1} onChange={(e) => ponerUp({ cantidad: Number(e.target.value) })} /></Fila>
                <Fila titulo="Precio que se suma"><Input className="h-8" type="number" min={0} inputMode="numeric" placeholder="30000" value={up.precio ?? ""} onChange={(e) => ponerUp({ precio: Number(e.target.value) })} /></Fila>
              </div>
              <Fila titulo="Texto de la casilla" ayuda={`Se ve así: "${up.titulo || "Lleva otra unidad"}  +${pesos(Number(up.precio) || 0)}"`}>
                <Input className="h-8" maxLength={80} placeholder="Lleva otra unidad con descuento" value={up.titulo ?? ""} onChange={(e) => ponerUp({ titulo: e.target.value })} />
              </Fila>
              {up.productId && <p className="text-[10px] text-muted-foreground">Otro producto se registra como un pedido aparte con los mismos datos de envío.</p>}

              <div className="rounded-lg border p-2.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Segunda oportunidad (downsell)</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Si no marca la casilla, al confirmar se le ofrece una vez lo mismo más barato.</p>
                  </div>
                  <Switch checked={!!down} onCheckedChange={(v) => setPedido((p) => ({ ...p, downsell: v ? { precio: undefined, titulo: "" } : null }))} aria-label="Ofrecer un precio menor" />
                </div>
                {down && (
                  <div className="grid grid-cols-2 gap-2">
                    <Fila titulo="Precio menor"><Input className="h-8" type="number" min={0} inputMode="numeric" value={down.precio ?? ""} onChange={(e) => ponerDown({ precio: Number(e.target.value) })} aria-invalid={downInvalido} /></Fila>
                    <Fila titulo="Título"><Input className="h-8" maxLength={80} placeholder="¿Lo agregamos?" value={down.titulo ?? ""} onChange={(e) => ponerDown({ titulo: e.target.value })} /></Fila>
                  </div>
                )}
                {downInvalido && <p className="text-[11px] text-red-600">El precio menor tiene que ser más bajo que {pesos(Number(up.precio))}.</p>}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2.5 border-t pt-4">
          <div>
            <p className="text-[13px] font-semibold">Antifraude</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aplica a todas tus landings. Vacío o en 0 = sin límite. Al cliente frenado se le pide escribir por WhatsApp, sin decirle la regla.</p>
          </div>
          {af ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Fila titulo="Pedidos por celular al día"><Input className="h-8" type="number" min={0} max={50} value={af.maxPedidosPorTelefono24h || ""} placeholder="Sin límite" onChange={(e) => setAf({ ...af, maxPedidosPorTelefono24h: Number(e.target.value) || 0 })} /></Fila>
                <Fila titulo="Pedidos por conexión al día"><Input className="h-8" type="number" min={0} max={200} value={af.maxPedidosPorIp24h || ""} placeholder="Sin límite" onChange={(e) => setAf({ ...af, maxPedidosPorIp24h: Number(e.target.value) || 0 })} /></Fila>
              </div>
              <Fila titulo="Celulares bloqueados" ayuda="Uno por línea. Da igual si tienen +57 o espacios.">
                <Textarea rows={3} className="text-xs" value={textos.telefonos} onChange={(e) => setTextos((t) => ({ ...t, telefonos: e.target.value }))} />
              </Fila>
              <Fila titulo="Ciudades sin contraentrega" ayuda="Una por línea. Al cliente de esas ciudades se le avisa y se le invita a escribir.">
                <Textarea rows={2} className="text-xs" value={textos.ciudades} onChange={(e) => setTextos((t) => ({ ...t, ciudades: e.target.value }))} />
              </Fila>
              <Fila titulo="IPs bloqueadas" ayuda="Para avanzados. Una por línea.">
                <Textarea rows={2} className="text-xs font-mono" value={textos.ips} onChange={(e) => setTextos((t) => ({ ...t, ips: e.target.value }))} />
              </Fila>
            </>
          ) : <p className="text-[11px] text-muted-foreground">No se pudieron cargar las reglas antifraude.</p>}
          <p className="text-[10px] text-muted-foreground">Siempre activo: un campo invisible que solo llenan los robots.</p>
        </section>
      </div>
      <div className="px-3 py-2 border-t bg-muted/10 shrink-0 space-y-1.5">
        {aviso && <p role="status" className={`text-[11px] ${aviso.tipo === "ok" ? "text-emerald-700" : "text-red-600"}`}>{aviso.texto}</p>}
        <Button size="sm" className="h-8 text-xs w-full bg-violet-600 hover:bg-violet-700 text-white" disabled={guardando || downInvalido} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Guardar pedido
        </Button>
      </div>
    </div>
  );
}
