import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Check, X, ExternalLink, KeyRound, Zap } from "lucide-react";
import { toast } from "sonner";
import { describeError } from "@/lib/utils";

interface Modelo {
  id: string;
  especialidad: "razonar" | "rapido" | "vision" | "codigo" | "general";
  estado: "verificado" | "sin probar" | "agotado" | "vacio";
  contexto: number | null;
  nota: string | null;
  seleccionable: boolean;
}

interface Proveedor {
  id: string;
  nombre: string;
  gratis: boolean;
  envKey: string;
  alta: string;
  nota: string;
  tieneClave: boolean;
  origenClave: "entorno" | "guardada" | null;
  modeloElegido: string | null;
  modelos: Modelo[];
}

const ESPECIALIDAD: Record<string, { txt: string; cls: string }> = {
  razonar: { txt: "🧠 razona", cls: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  rapido: { txt: "⚡ rápido", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  vision: { txt: "👁️ visión", cls: "bg-sky-500/10 text-sky-600 border-sky-500/20" },
  codigo: { txt: "💻 código", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  general: { txt: "💬 general", cls: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
};

const ESTADO: Record<string, { txt: string; cls: string }> = {
  verificado: { txt: "✅ probado", cls: "text-emerald-600" },
  "sin probar": { txt: "⏳ sin probar", cls: "text-muted-foreground" },
  agotado: { txt: "🔴 cuota agotada", cls: "text-red-500" },
  vacio: { txt: "⚫ no usable", cls: "text-muted-foreground line-through" },
};

export function AIProviders() {
  const [provs, setProvs] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [claves, setClaves] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [probando, setProbando] = useState<string | null>(null);
  const [descubriendo, setDescubriendo] = useState<string | null>(null);
  const [descubiertos, setDescubiertos] = useState<Record<string, string[]>>({});
  const [consultado, setConsultado] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; msg: string }>>({});
  // Qué IA está usando Atlas ahora (lo escribe PUT /api/ai/active).
  const [activa, setActiva] = useState<string | null>(null);
  const [activaModelo, setActivaModelo] = useState<string | null>(null);
  const [activando, setActivando] = useState<string | null>(null);

  const cargar = async () => {
    try {
      const r = await fetch("/api/ai/catalog", { credentials: "include" });
      if (!r.ok) throw new Error("No se pudo cargar el catálogo");
      const d = await r.json();
      setProvs(d.proveedores || []);
      setActiva(d.activa || null);
      setActivaModelo(d.activaModelo || null);
    } catch (e: any) {
      toast.error(describeError(e, "No se pudo cargar el catálogo de proveedores"));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (id: string, model?: string) => {
    setGuardando(id);
    try {
      const body: any = { proveedor: id };
      if (claves[id]) body.apiKey = claves[id];
      if (model) body.model = model;
      const r = await fetch("/api/ai/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error al guardar");
      setClaves((c) => ({ ...c, [id]: "" })); // no dejar la clave en pantalla
      toast.success("Guardado");
      await cargar();
    } catch (e: any) {
      toast.error(describeError(e, "No se pudo guardar el proveedor"));
    } finally {
      setGuardando(null);
    }
  };

  // Pregunta al proveedor qué modelos ofrece hoy, en vez de fiarse de una
  // lista escrita a mano que envejece.
  const descubrir = async (id: string) => {
    setDescubriendo(id);
    try {
      const r = await fetch(`/api/ai/models/${id}`, { credentials: "include" });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      if (!d.modelos?.length) { toast.error("El proveedor no devolvió modelos"); return; }
      setDescubiertos((x) => ({ ...x, [id]: d.modelos }));
      setConsultado((x) => ({ ...x, [id]: d.consultado || "" }));
      toast.success(`${d.total} modelos encontrados`);
    } catch (e: any) {
      toast.error(describeError(e, "No se pudieron consultar los modelos disponibles"));
    } finally {
      setDescubriendo(null);
    }
  };

  // Deja este proveedor como IA de Atlas: es la fila que el agente lee al
  // armar su cola ("Elegido al frente") y la que Atlas manda a Forge al
  // generar la landing, para que las dos usen lo mismo.
  const activar = async (id: string) => {
    setActivando(id);
    try {
      const r = await fetch("/api/ai/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor: id }),
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo cambiar la IA");
      setActiva(id);
      setActivaModelo(d.modelo || null);
      if (!d.tieneClave) {
        toast.warning(`${provs.find((p) => p.id === id)?.nombre || id} queda activa, pero sin clave: Atlas caerá al respaldo`);
      } else {
        toast.success(`Atlas usará ${provs.find((p) => p.id === id)?.nombre || id}${d.modelo ? ` · ${d.modelo}` : ""}`);
      }
    } catch (e: any) {
      toast.error(describeError(e, "No se pudo cambiar la IA de Atlas"));
    } finally {
      setActivando(null);
    }
  };

  const probar = async (id: string, model?: string) => {
    setProbando(id);
    try {
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor: id, model }),
        credentials: "include",
      });
      const d = await r.json();
      setResultado((x) => ({
        ...x,
        [id]: { ok: !!d.ok, msg: d.ok ? `Responde en ${d.ms} ms` : d.error || "Falló" },
      }));
    } catch (e: any) {
      setResultado((x) => ({ ...x, [id]: { ok: false, msg: e.message } }));
    } finally {
      setProbando(null);
    }
  };

  if (cargando) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Cargando proveedores…</div>;
  }

  const gratis = provs.filter((p) => p.gratis);
  const pago = provs.filter((p) => !p.gratis);

  const tarjeta = (p: Proveedor) => (
    <Card key={p.id} className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2 min-w-0">
            <KeyRound className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{p.nombre}</span>
            {p.tieneClave ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                <Check className="h-3 w-3 mr-1" />
                {p.origenClave === "entorno" ? "clave en .env" : "clave guardada"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">sin clave</Badge>
            )}
            {activa === p.id && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                <Check className="h-3 w-3 mr-1" /> IA activa de Atlas
              </Badge>
            )}
          </span>
          <a href={p.alta} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1 shrink-0">
            obtener clave <ExternalLink className="h-3 w-3" />
          </a>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">{p.nota}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Clave ({p.envKey})
          </Label>
          <div className="flex gap-2">
            <SecretInput
              guardado={p.tieneClave}
              placeholder="Pega aquí tu clave"
              value={claves[p.id] || ""}
              onChange={(v) => setClaves((c) => ({ ...c, [p.id]: v }))}
              wrapperClassName="flex-1 min-w-0"
              className="text-xs"
            />
            <Button size="sm" disabled={guardando === p.id || !claves[p.id]} onClick={() => guardar(p.id)}>
              {guardando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground">
            🔒 Se guarda cifrada (AES-256-GCM) y nunca se devuelve al navegador.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Modelo</Label>
            <button
              type="button"
              disabled={!p.tieneClave || descubriendo === p.id}
              onClick={() => descubrir(p.id)}
              className="text-[10px] text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              title="Consulta al proveedor qué modelos ofrece ahora mismo"
            >
              {descubriendo === p.id ? "buscando…" : "🔄 descubrir modelos"}
            </button>
          </div>
          <select
            value={p.modeloElegido || ""}
            onChange={(e) => guardar(p.id, e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-muted/30 px-2 text-xs font-mono"
          >
            <option value="">— elegir modelo —</option>
            {/* Los descubiertos en vivo mandan sobre la lista del registro */}
            {descubiertos[p.id]
              ? descubiertos[p.id].map((id) => <option key={id} value={id}>{id}</option>)
              : p.modelos.filter((m) => m.seleccionable).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {ESPECIALIDAD[m.especialidad]?.txt} · {ESTADO[m.estado]?.txt}
                  </option>
                ))}
          </select>
          {consultado[p.id] && (
            <p className="text-[9px] text-muted-foreground break-all">
              Consultado en <code className="text-primary">{consultado[p.id]}</code>
            </p>
          )}
          {!descubiertos[p.id] && p.modelos.length === 0 && (
            <p className="text-[9px] text-muted-foreground">
              Sin lista previa: pon la clave y pulsa «descubrir modelos».
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={activando === p.id || activa === p.id}
            title="Deja esta IA como la que usan Atlas y la generación de landings"
            onClick={() => activar(p.id)}
          >
            {activando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {activa === p.id ? "✓ Es la de Atlas" : "Usar para Atlas"}
          </Button>
          <Button size="sm" variant="outline" disabled={!p.tieneClave || probando === p.id} onClick={() => probar(p.id, p.modeloElegido || undefined)}>
            {probando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
            Probar ahora
          </Button>
          {resultado[p.id] && (
            <span className={`text-[11px] flex items-center gap-1 min-w-0 ${resultado[p.id].ok ? "text-emerald-600" : "text-red-500"}`}>
              {resultado[p.id].ok ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
              <span className="break-words">{resultado[p.id].msg}</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {activa && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <b>Atlas usa:</b> {provs.find((p) => p.id === activa)?.nombre || activa}
            {activaModelo ? ` · ${activaModelo}` : ""}
          </span>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-1">🆓 Proveedores gratuitos</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Funcionan sin pagar. Si un modelo agota su cuota, el sistema rota solo al siguiente.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">{gratis.map(tarjeta)}</div>
      </div>

      {pago.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">💳 Proveedores de pago</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Opcionales: mejor rendimiento y sin límites de cuota. Solo se usan si pones su clave.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">{pago.map(tarjeta)}</div>
        </div>
      )}
    </div>
  );
}
