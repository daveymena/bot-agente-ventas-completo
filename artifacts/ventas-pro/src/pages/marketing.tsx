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
} from "lucide-react";
import { toast } from "sonner";

/**
 * Marketing & Growth — panel del equipo de marketing (MASTER PLAN §28-§37).
 * Consume /api/marketing/* (rutas tras la cadena de auth del API).
 */

type TabKey = "resumen" | "atribucion" | "tareas" | "experimentos" | "presupuesto" | "memoria" | "audit";

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
  const [tab, setTab] = useState<TabKey>("resumen");
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
    { key: "resumen", label: "Resumen", icon: TrendingUp },
    { key: "atribucion", label: "Atribución", icon: Target },
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
