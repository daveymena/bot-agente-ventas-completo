import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Megaphone, TrendingUp, Target, FlaskConical, Wallet, BookOpen, Send,
  Loader2, AlertTriangle, CheckCircle2, ArrowRight, Sparkles,
  Activity, Search, Play, Pause, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Marketing & Growth — panel del equipo de marketing (MASTER PLAN §28-§37).
 * Consume /api/marketing/* (rutas tras la cadena de auth del API).
 */

type TabKey = "envivo" | "resumen" | "atribucion" | "competencia" | "tareas" | "experimentos" | "presupuesto" | "memoria" | "audit";

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detalle = "";
    try { detalle = JSON.parse(raw).error || JSON.parse(raw).message || ""; } catch { detalle = raw.slice(0, 120); }
    throw new Error(detalle || `Error ${response.status}`);
  }
  return response.json();
};

const emojiFor = (s: string) => (s === "critical" ? "🔴" : s === "warning" ? "⚠️" : "🟢");

export default function MarketingPage() {
  const [tab, setTab] = useState<TabKey>("envivo");
  const [summary, setSummary] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [learnings, setLearnings] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat del orquestador
  const [chatMessage, setChatMessage] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatResult, setChatResult] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, t, e, l, au] = await Promise.all([
        apiRequest("/marketing/summary"),
        apiRequest("/marketing/attribution?days=30"),
        apiRequest("/marketing/tasks"),
        apiRequest("/marketing/experiments"),
        apiRequest("/marketing/learnings"),
        apiRequest("/marketing/audit?limit=30"),
      ]);
      setSummary(s);
      setAttribution(a);
      setTasks(t.rows ?? []);
      setExperiments(e.rows ?? []);
      setLearnings(l.rows ?? []);
      setAudit(au.rows ?? []);
    } catch (err: any) {
      toast.error(`No se pudo cargar Marketing: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const sendChat = async () => {
    const msg = chatMessage.trim();
    if (!msg || chatBusy) return;
    setChatBusy(true);
    setChatResult(null);
    try {
      const r = await apiRequest("/marketing/chat", { method: "POST", body: JSON.stringify({ message: msg }) });
      setChatResult(r);
      if (r.intent !== "unknown") await loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChatBusy(false);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: "envivo", label: "En vivo", icon: Activity },
    { key: "resumen", label: "Resumen", icon: TrendingUp },
    { key: "atribucion", label: "Atribución", icon: Target },
    { key: "competencia", label: "Competencia", icon: Search },
    { key: "tareas", label: "Tareas", icon: Megaphone },
    { key: "experimentos", label: "Experimentos", icon: FlaskConical },
    { key: "presupuesto", label: "Presupuesto", icon: Wallet },
    { key: "memoria", label: "Aprendizajes", icon: BookOpen },
    { key: "audit", label: "Auditoría", icon: AlertTriangle },
  ];

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Marketing & Growth
            </h1>
            <p className="text-sm text-muted-foreground">
              Equipo especializado del orquestador: estrategia, publicidad, experimentos y atribución real.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
                <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Chat del orquestador (MASTER PLAN §36) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Chat del orquestador</CardTitle>
            <CardDescription>Decí en lenguaje natural: “quiero vender más el curso de piano”, “¿qué está fallando?”, “¿cómo vamos?”, “crea una campaña”.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Ej: Quiero hacer crecer la venta de mi curso de piano"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <Button onClick={sendChat} disabled={chatBusy || !chatMessage.trim()}>
                {chatBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {chatResult && (
              <div className="rounded-lg border bg-muted/40 p-3 whitespace-pre-wrap font-mono text-xs">
                {chatResult.report ?? JSON.stringify(chatResult, null, 2)}
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando equipo de marketing…
          </div>
        ) : (
          <>
            {tab === "envivo" && <EnVivoTab />}
            {tab === "competencia" && <CompetenciaTab />}
            {tab === "resumen" && summary && <ResumenTab summary={summary} />}
            {tab === "atribucion" && <AtribucionTab attribution={attribution} />}
            {tab === "tareas" && <TareasTab tasks={tasks} onChanged={loadAll} />}
            {tab === "experimentos" && <ExperimentosTab experiments={experiments} onChanged={loadAll} />}
            {tab === "presupuesto" && <PresupuestoTab summary={summary} onChanged={loadAll} />}
            {tab === "memoria" && <MemoriaTab learnings={learnings} />}
            {tab === "audit" && <AuditTab audit={audit} />}
          </>
        )}
      </div>
    </Layout>
  );
}

function ResumenTab({ summary }: { summary: any }) {
  const f = summary.funnel ?? {};
  const rows = summary.attribution?.rows ?? [];
  const metrics = [
    { label: "Leads (30d)", value: f.leads ?? 0 },
    { label: "Conversaciones", value: f.conversations ?? 0 },
    { label: "Ventas", value: f.paid ?? 0 },
    { label: "Ingresos", value: `$${Number(f.revenue ?? 0).toLocaleString("es-CO")}` },
    { label: "Lead → Conversación", value: `${f.leadToConversationRate ?? 0}%` },
    { label: "Conversación → Venta", value: `${f.conversationToPaidRate ?? 0}%` },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-xl font-bold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Equipo de marketing (14 agentes)</CardTitle>
          <CardDescription>El orquestador activa solo los necesarios según la petición.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(summary.team?.agents ?? []).map((a: string) => <Badge key={a} variant="secondary">{a}</Badge>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">💰 Presupuesto (guardrails)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>Tope diario: <b>{Number(summary.budget?.guardrails?.maxDailySpend ?? 0).toLocaleString("es-CO")} {summary.budget?.guardrails?.currency}</b></div>
          <div>Gastado hoy: <b>{Number(summary.budget?.todaySpend ?? 0).toLocaleString("es-CO")}</b></div>
          <div>Cambio máx.: <b>{summary.budget?.guardrails?.maxBudgetChangePercent}%</b></div>
          <div>Escala máx.: <b>{summary.budget?.guardrails?.maxScalePercent}%</b></div>
        </CardContent>
      </Card>

      {rows.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            ℹ️ Todavía no hay leads con contexto de anuncio. Cuando un cliente llegue desde un anuncio
            click-to-WhatsApp, la atribución se activa automáticamente (adContext en el lead).
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AtribucionTab({ attribution }: { attribution: any }) {
  const rows = attribution?.rows ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atribución real por anuncio (30 días)</CardTitle>
        <CardDescription>CAC y ROAS reales desde leads.adContext × payments (no lo que reporta Meta).</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin datos de atribución todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Anuncio</th>
                  <th className="py-2 pr-3">Leads</th>
                  <th className="py-2 pr-3">Ventas</th>
                  <th className="py-2 pr-3">Ingresos</th>
                  <th className="py-2 pr-3">Conv. %</th>
                  <th className="py-2 pr-3">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-3 font-medium">{r.adTitle}</td>
                    <td className="py-2 pr-3">{r.leads}</td>
                    <td className="py-2 pr-3">{r.paid}</td>
                    <td className="py-2 pr-3">${Number(r.revenue).toLocaleString("es-CO")}</td>
                    <td className="py-2 pr-3">{r.conversionRate}%</td>
                    <td className="py-2 pr-3">{r.roas != null ? `${r.roas}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground">
          Totales: {attribution?.totalLeads ?? 0} leads · {attribution?.totalPaid ?? 0} ventas · $
          {Number(attribution?.totalRevenue ?? 0).toLocaleString("es-CO")} ingresos.
        </div>
      </CardContent>
    </Card>
  );
}

function TareasTab({ tasks, onChanged }: { tasks: any[]; onChanged: () => void }) {
  const updateStatus = async (id: number, status: string) => {
    try {
      await apiRequest(`/marketing/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      onChanged();
    } catch (err: any) { toast.error(err.message); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Motor de tareas ({tasks.length})</CardTitle>
        <CardDescription>Los agentes se comunican mediante tareas estructuradas (MASTER PLAN §20).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.length === 0 && <div className="text-sm text-muted-foreground">Sin tareas todavía. Usá el chat del orquestador para generar un plan.</div>}
        {tasks.map((t: any) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <Badge variant="outline">{t.status}</Badge>
            <span className="font-medium">{t.assignedAgent}</span>
            <span className="text-muted-foreground">→ {t.action}</span>
            <Badge variant={t.risk === "HIGH" || t.risk === "CRITICAL" ? "destructive" : "secondary"}>{t.risk}</Badge>
            <div className="ml-auto flex gap-1">
              {["RUNNING", "COMPLETED", "FAILED", "CANCELLED"].map((s) => (
                <Button key={s} size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus(t.id, s)}>{s}</Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExperimentosTab({ experiments, onChanged }: { experiments: any[]; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ hypothesis: "", variable: "" });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.hypothesis.trim() || !form.variable.trim()) {
      toast.error("Completá hipótesis y variable");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/marketing/experiments", { method: "POST", body: JSON.stringify(form) });
      setForm({ hypothesis: "", variable: "" });
      setShowForm(false);
      onChanged();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Experimentos ({experiments.length})</CardTitle>
          <CardDescription>Hipótesis → control → variante → resultado (MASTER PLAN §13).</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}><FlaskConical className="mr-1.5 h-4 w-4" /> Nuevo</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-2 rounded-lg border p-3">
            <Input placeholder="Hipótesis: 'Aprende desde cero' convierte mejor que 'Conviértete en pianista'…" value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} />
            <Input placeholder="Variable: copy / ángulo / audiencia / oferta" value={form.variable} onChange={(e) => setForm({ ...form, variable: e.target.value })} />
            <Button size="sm" onClick={create} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear experimento"}</Button>
          </div>
        )}
        {experiments.map((e: any) => (
          <div key={e.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={e.status === "GANADOR" ? "default" : e.status === "PERDEDOR" ? "destructive" : "secondary"}>{e.status}</Badge>
              <span className="font-medium">#{e.id}</span>
              <span className="text-muted-foreground">{e.variable}</span>
            </div>
            <p className="mt-1">{e.hypothesis}</p>
            {e.conclusion && <p className="mt-1 text-xs text-muted-foreground">{e.conclusion}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PresupuestoTab({ summary, onChanged }: { summary: any; onChanged: () => void }) {
  const [guardrails, setGuardrails] = useState({
    maxDailySpend: summary?.budget?.guardrails?.maxDailySpend ?? 50000,
    maxBudgetChangePercent: summary?.budget?.guardrails?.maxBudgetChangePercent ?? 25,
    maxScalePercent: summary?.budget?.guardrails?.maxScalePercent ?? 30,
    approvalRequired: summary?.budget?.guardrails?.approvalRequired ?? true,
    currency: summary?.budget?.guardrails?.currency ?? "COP",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("/marketing/budget", { method: "PUT", body: JSON.stringify(guardrails) });
      toast.success("Guardrails actualizados");
      onChanged();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Guardrails de presupuesto</CardTitle>
        <CardDescription>Nunca se permite gasto ilimitado: el BudgetManager valida cada cambio contra estos límites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Tope diario</span>
            <Input type="number" value={guardrails.maxDailySpend} onChange={(e) => setGuardrails({ ...guardrails, maxDailySpend: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Cambio máx. %</span>
            <Input type="number" value={guardrails.maxBudgetChangePercent} onChange={(e) => setGuardrails({ ...guardrails, maxBudgetChangePercent: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Escala máx. %</span>
            <Input type="number" value={guardrails.maxScalePercent} onChange={(e) => setGuardrails({ ...guardrails, maxScalePercent: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Moneda</span>
            <Input value={guardrails.currency} onChange={(e) => setGuardrails({ ...guardrails, currency: e.target.value.toUpperCase() })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={guardrails.approvalRequired} onChange={(e) => setGuardrails({ ...guardrails, approvalRequired: e.target.checked })} />
          Exigir aprobación humana para cambios de presupuesto
        </label>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar guardrails"}</Button>
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          Estado: gastado hoy <b>{Number(summary?.budget?.todaySpend ?? 0).toLocaleString("es-CO")}</b> de{" "}
          <b>{Number(summary?.budget?.guardrails?.maxDailySpend ?? 0).toLocaleString("es-CO")} {guardrails.currency}</b>{" "}
          (restante: <b>{Number(summary?.budget?.todayRemaining ?? 0).toLocaleString("es-CO")}</b>).
        </div>
      </CardContent>
    </Card>
  );
}

function MemoriaTab({ learnings }: { learnings: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Aprendizajes de marketing ({learnings.length})</CardTitle>
        <CardDescription>Ganadores, perdedores y lecciones — el próximo plan los consulta antes de crear (MASTER PLAN §19).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {learnings.length === 0 && <div className="text-sm text-muted-foreground">Aún no hay aprendizajes registrados.</div>}
        {learnings.map((l: any, i: number) => (
          <div key={i} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2">
              {l.tags?.includes("winner") ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : l.tags?.includes("loser") ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <BookOpen className="h-4 w-4 text-muted-foreground" />}
              <span className="font-medium">{l.title}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{l.content}</p>
            {l.tags?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">{l.tags.slice(0, 8).map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditTab({ audit }: { audit: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Audit log del equipo ({audit.length})</CardTitle>
        <CardDescription>Todo se registra: agente, acción, aprobación y resultado verificado (MASTER PLAN §32).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        {audit.map((a: any, i: number) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5">
            <Badge variant="outline">{a.agent}</Badge>
            <span className="font-mono">{a.action}</span>
            {a.resource && <span className="text-muted-foreground">{a.resource}</span>}
            <span className="ml-auto flex items-center gap-1">
              {a.approval && <Badge variant="secondary">{a.approval}</Badge>}
              <Badge variant={a.result === "SUCCESS" ? "default" : a.result === "FAILED" ? "destructive" : "secondary"}>{a.result}</Badge>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * EN VIVO — lo que están haciendo TUS anuncios ahora mismo.
 *
 * Los datos salen de /api/facebook/campaigns, que los pide a Meta en el
 * momento: gasto, impresiones, clics, CTR y costo por resultado reales. Ya
 * estaban disponibles y no los mostraba nadie, así que para saber si una
 * campaña estaba quemando plata había que entrar al Administrador de Anuncios.
 *
 * El semáforo no es decoración: lo único que hay que mirar seguido es si algo
 * gasta sin devolver nada, y eso tiene que verse sin leer una tabla.
 */
function EnVivoTab() {
  const [campanas, setCampanas] = useState<any[]>([]);
  const [totales, setTotales] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [ocupada, setOcupada] = useState<string>("");
  const [conectado, setConectado] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/facebook/campaigns", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "No se pudieron leer las campañas");
      setCampanas(j.campaigns || []);
      setTotales(j.totals || null);
      // El endpoint YA mandaba `connected` y nadie lo leia: sin cuenta
      // conectada devuelve 200 con lista vacia, y la pantalla mostraba
      // "no hay campañas" -- culpando a la falta de anuncios de un problema
      // que era de conexion.
      setConectado(j.connected !== false);
      setError("");
    } catch (e: any) {
      setError(e.message || "Error leyendo las campañas");
    } finally {
      setCargando(false);
    }
  }, []);

  // Refresco automático: es una pantalla en vivo, no un informe. 60 s es el
  // ritmo al que Meta actualiza sus métricas; pedirlas más seguido no trae
  // datos nuevos, solo gasta cuota de la API.
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  const accion = async (id: string, verbo: "pause" | "resume") => {
    setOcupada(id);
    try {
      const r = await fetch(`/api/facebook/campaigns/${id}/${verbo}`, { method: "POST", credentials: "include" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.message || "Meta no aceptó el cambio");
      toast.success(j.message);
      await cargar();
    } catch (e: any) {
      toast.error(e.message || "No se pudo cambiar el estado");
    } finally {
      setOcupada("");
    }
  };

  const money = (n: any) => "$" + Number(n || 0).toLocaleString("es-CO");

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Consultando a Meta…
      </div>
    );
  }
  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Datos pedidos a Meta en el momento · se actualiza solo cada 60 s
        </p>
        <Button size="sm" variant="outline" onClick={cargar}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Actualizar
        </Button>
      </div>

      {totales && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { l: "Gastado", v: money(totales.spend) },
            { l: "Impresiones", v: Number(totales.impressions || 0).toLocaleString("es-CO") },
            { l: "Clics", v: Number(totales.clicks || 0).toLocaleString("es-CO") },
            { l: "Resultados", v: Number(totales.results || 0).toLocaleString("es-CO") },
            { l: "Costo x result.", v: money(totales.costPerResult) },
          ].map((k) => (
            <Card key={k.l}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="text-lg font-semibold">{k.v}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Lo que el agente automatico viene haciendo.
          El admin reporto "no veo que haga nada": el agente corria cada hora
          pero solo dejaba rastro cuando encontraba un problema, asi que no
          habia forma de distinguir "reviso y esta todo bien" de "no esta
          corriendo". Esto lo hace visible. */}
      <ActividadDelAgente />

      {!conectado ? (
        <Card><CardContent className="p-6 space-y-3">
          <p className="text-sm font-medium">Facebook no está conectado.</p>
          <p className="text-sm text-muted-foreground">
            Esta pantalla lee las métricas directo de Meta, así que hasta que no
            conectes la cuenta publicitaria no puede mostrar nada.
          </p>
          <Button size="sm" variant="outline" asChild>
            <a href="/facebook">Conectar Facebook</a>
          </Button>
        </CardContent></Card>
      ) : campanas.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No hay campañas en la cuenta publicitaria. Creá un anuncio desde Atlas y va a aparecer acá.
        </CardContent></Card>
      ) : campanas.map((c) => {
        const activa = String(c.status).toUpperCase() === "ACTIVE";
        // Gasta y no devuelve nada: es lo único urgente de esta pantalla.
        const quemando = activa && Number(c.spend) > 0 && Number(c.results) === 0;
        return (
          <Card key={c.id} className={quemando ? "border-destructive" : ""}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={activa ? "default" : "secondary"}>
                    {activa ? "🟢 Activa" : "⏸️ En pausa"}
                  </Badge>
                  <Button
                    size="sm"
                    variant={activa ? "outline" : "default"}
                    disabled={ocupada === c.id}
                    onClick={() => accion(c.id, activa ? "pause" : "resume")}
                  >
                    {ocupada === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : activa ? (
                      <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pausar</>
                    ) : (
                      <><Play className="mr-1.5 h-3.5 w-3.5" /> Activar</>
                    )}
                  </Button>
                </div>
              </div>

              {quemando && (
                <p className="flex items-center gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Lleva {money(c.spend)} gastados y ningún resultado. Revisala o pausala.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 text-sm md:grid-cols-6">
                {[
                  ["Gasto", money(c.spend)],
                  ["Impresiones", Number(c.impressions || 0).toLocaleString("es-CO")],
                  ["Clics", Number(c.clicks || 0).toLocaleString("es-CO")],
                  ["CTR", Number(c.ctr || 0).toFixed(2) + "%"],
                  ["Resultados", Number(c.results || 0).toLocaleString("es-CO")],
                  ["Costo x result.", money(c.costPerResult)],
                ].map(([l, v]) => (
                  <div key={String(l)}>
                    <p className="text-xs text-muted-foreground">{l}</p>
                    <p className="font-medium">{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * COMPETENCIA — qué anuncios está pagando la competencia AHORA.
 *
 * Lee la Biblioteca de Anuncios pública de Meta, ordenada por impresiones: los
 * que trae son los MÁS VISTOS del nicho, o sea los que alguien sostiene con
 * plata. Un anuncio que se mantiene al aire es un anuncio que funciona, y eso
 * vale más que cualquier artículo sobre estrategias de marketing.
 *
 * Ya existía como herramienta interna y se disparaba sola al crear un anuncio,
 * con el nicho que el sistema deducía del pedido. Acá el admin puede preguntar
 * por el que quiera ANTES de gastar un peso.
 */
function CompetenciaTab() {
  const [q, setQ] = useState("");
  const [anuncios, setAnuncios] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const buscar = async () => {
    if (!q.trim()) return;
    setBuscando(true);
    setAnuncios([]);
    setMensaje("");
    try {
      const r = await fetch(`/api/facebook/ad-library?q=${encodeURIComponent(q.trim())}&limite=10`, { credentials: "include" });
      const j = await r.json();
      setAnuncios(j.anuncios || []);
      setMensaje(j.mensaje || "");
      if (!j.ok) toast.error(j.mensaje || "No se encontraron anuncios");
    } catch (e: any) {
      toast.error(e.message || "No se pudo consultar la Biblioteca de Anuncios");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qué está pagando la competencia</CardTitle>
          <CardDescription>
            Anuncios ACTIVOS en Colombia, ordenados por los más vistos. Sale de la Biblioteca
            de Anuncios pública de Meta. Tarda ~25 s porque se lee la página real.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            className="max-w-md flex-1"
            placeholder="Nicho o marca: educación canina, curso de piano…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
          />
          <Button onClick={buscar} disabled={buscando || !q.trim()}>
            {buscando ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Buscando…</>
            ) : (
              <><Search className="mr-1.5 h-4 w-4" /> Buscar</>
            )}
          </Button>
        </CardContent>
      </Card>

      {mensaje && anuncios.length === 0 && !buscando && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{mensaje}</CardContent></Card>
      )}

      {anuncios.map((a, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <p className="mb-1 text-xs text-muted-foreground">Anuncio #{i + 1}</p>
            <p className="whitespace-pre-wrap text-sm">{a}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Lo que el vigilante automatico viene revisando.
 *
 * Existe porque un sistema que trabaja en silencio es indistinguible de uno
 * apagado -- y el admin, con razon, dejo de creerle.
 */
function ActividadDelAgente() {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/facebook/agent/logs", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no disponible"))))
      .then((d) => setLogs(Array.isArray(d) ? d : d.logs || []))
      .catch((e) => setError(e.message || "no se pudo leer"));
  }, []);

  if (error) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Qué viene haciendo el vigilante
        </CardTitle>
        <CardDescription>
          Revisa el gasto cada hora y pausa solo lo que quema plata sin vender. Te avisa por WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no registró nada. Empieza a anotar en cuanto tus campañas tengan movimiento.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 6).map((l: any) => (
              <div key={l.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm">
                <span className="shrink-0">
                  {l.status === "applied" ? "🛑" : l.status === "suggested" ? "⚠️" : "✅"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.productName || "Campaña"}</p>
                  <p className="text-xs text-muted-foreground">{l.reason}</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
