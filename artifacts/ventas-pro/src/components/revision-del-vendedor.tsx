/**
 * Revisión de una respuesta del vendedor, para el probador (09-10-2026).
 *
 * El dueño: "que el probador sea algo profesional, que sí corrija y mejore;
 * que no me responda eso porque es mentira". El servidor revisa cada
 * respuesta contra la ficha y la configuración (api-server/src/lib/
 * revisar-respuesta.ts); acá se muestra cada frase que no se puede sostener,
 * con su arreglo a un clic.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2, ShieldCheck, Truck, Wand2 } from "lucide-react";
import { toast } from "sonner";

export type Alerta = {
  tipo: "promesa" | "sin_configurar";
  frase: string;
  que: string;
  arreglo: string;
  correccion?: string;
  enlace?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.mensaje || data?.error || `Error ${r.status}`);
  return data as T;
}

/**
 * Sin alertas se muestra igual una marca discreta: así el dueño sabe que la
 * ausencia de avisos es un resultado y no que no se revisó.
 */
export function Revision(p: {
  alertas: Alerta[];
  estado?: "completada" | "no_disponible";
  /** Clave de la alerta que se está arreglando (`${i}:${frase}`). */
  ocupado: string | null;
  i: number;
  alCorregir: (a: Alerta) => void;
  alConfigurarEnvio: () => void;
}) {
  if (p.estado !== "completada" && p.alertas.length === 0) {
    return <p className="self-start rounded-full bg-white/60 px-2 py-0.5 text-[11px] text-slate-500">Revisión automática no disponible</p>;
  }
  if (p.alertas.length === 0) {
    return (
      <p title="Comprobaciones limitadas sobre promesas y configuración de envío. Revisa también los datos y la coherencia de la conversación." className="self-start inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[11px] text-emerald-700">
        <ShieldCheck className="h-3 w-3" /> Sin alertas en las comprobaciones automáticas
      </p>
    );
  }
  return (
    <div className="self-start w-full space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px]" role="status">
      <p className="flex items-center gap-1 font-semibold text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5" />
        {p.alertas.length === 1 ? "1 cosa que no se puede sostener" : `${p.alertas.length} cosas que no se pueden sostener`}
      </p>
      {p.alertas.map((a) => {
        const clave = `${p.i}:${a.frase}`;
        return (
          <div key={a.frase} className="rounded-md bg-white/80 p-2">
            <p className="text-slate-800">«{a.frase}»</p>
            <p className="mt-0.5 text-slate-600">{a.arreglo}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {a.tipo === "promesa" && a.correccion && (
                <Button size="sm" className="h-7 text-xs" disabled={!!p.ocupado} onClick={() => p.alCorregir(a)}>
                  {p.ocupado === clave ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
                  Corregir y volver a responder
                </Button>
              )}
              {a.tipo === "sin_configurar" && (
                <Button size="sm" className="h-7 text-xs" onClick={p.alConfigurarEnvio}>
                  <Truck className="mr-1 h-3.5 w-3.5" /> Configurar envío
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Costo = "incluido" | "valor" | "confirmar";
type Pago = "contraentrega" | "anticipado" | "ambos";

const OPCIONES_COSTO: Array<[Costo, string]> = [
  ["incluido", "Va incluido en el precio"],
  ["valor", "Tiene un costo"],
  ["confirmar", "Se confirma en cada pedido"],
];
const OPCIONES_PAGO: Array<[Pago, string]> = [
  ["contraentrega", "Contraentrega"],
  ["anticipado", "Antes del despacho"],
  ["ambos", "Las dos"],
];

/**
 * El envío del negocio, cargado desde el probador. No había ninguna pantalla
 * para esto: el negocio quedaba con el relleno del código y la ficha lo
 * afirmaba. Guarda en el perfil del negocio (PUT /api/business-profile).
 */
export function DialogoEnvio(p: { abierto: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const [plazo, setPlazo] = useState("");
  const [costo, setCosto] = useState<Costo>("incluido");
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState<Pago>("contraentrega");
  const [cobertura, setCobertura] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!p.abierto) return;
    api<any>("/api/business-profile").then((r) => {
      const c = r?.perfil?.condiciones;
      const e = c?.envio;
      if (c?.fuente !== "perfil" || !e) return;
      setPlazo(e.plazo || "");
      setPago(e.pago || "contraentrega");
      setCobertura(e.cobertura || "");
      if (e.costo === "incluido") setCosto("incluido");
      else if (/confirm/i.test(e.costo || "")) setCosto("confirmar");
      else { setCosto("valor"); setValor(e.costo || ""); }
    }).catch(() => {});
  }, [p.abierto]);

  const guardar = async () => {
    if (!plazo.trim()) { toast.error("Escribe cuánto tarda en llegar (ej: 2 a 4 días hábiles)."); return; }
    if (costo === "valor" && !valor.trim()) { toast.error("Escribe cuánto cuesta el envío."); return; }
    setGuardando(true);
    try {
      await api("/api/business-profile", {
        method: "PUT",
        body: JSON.stringify({
          envio: {
            plazo: plazo.trim(),
            pago,
            costo: costo === "incluido" ? "incluido" : costo === "valor" ? valor.trim() : "se confirma al tomar el pedido",
            ...(cobertura.trim() ? { cobertura: cobertura.trim() } : {}),
          },
        }),
      });
      toast.success("Envío guardado", { description: "Así lo dirá tu vendedor desde ya, aquí y en WhatsApp." });
      p.alGuardar();
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const boton = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-left text-sm ${activo ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200"}`;

  return (
    <Dialog open={p.abierto} onOpenChange={(o) => !o && p.alCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-indigo-600" /> Cómo envías tus productos</DialogTitle>
          <DialogDescription>Tu vendedor solo dice lo que pongas aquí. Si no lo configuras, no promete costo ni tiempo de envío.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="env-plazo">¿Cuánto tarda en llegar?</Label>
            <Input id="env-plazo" value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Ej: 2 a 4 días hábiles en ciudades principales" maxLength={120} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">¿Quién paga el envío?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {OPCIONES_COSTO.map(([k, t]) => (
                <button type="button" key={k} aria-pressed={costo === k} onClick={() => setCosto(k)} className={boton(costo === k)}>{t}</button>
              ))}
            </div>
            {costo === "valor" && (
              <Input aria-label="Costo del envío" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: $12.000 a todo el país" maxLength={120} />
            )}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">¿Cómo paga el cliente?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {OPCIONES_PAGO.map(([k, t]) => (
                <button type="button" key={k} aria-pressed={pago === k} onClick={() => setPago(k)} className={boton(pago === k)}>{t}</button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="env-cobertura">¿A dónde envías? (opcional)</Label>
            <Input id="env-cobertura" value={cobertura} onChange={(e) => setCobertura(e.target.value)} placeholder="Ej: todo Colombia" maxLength={200} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={p.alCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar y volver a responder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
