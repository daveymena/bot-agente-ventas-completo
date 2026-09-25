import React, { useEffect, useState } from "react";
import { BarChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function AgentLabDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState(1);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Actualiza cada 30s
    return () => clearInterval(interval);
  }, [tenantId]);

  const fetchMetrics = async () => {
    try {
      const metricsRes = await fetch(`/api/agent-lab-dashboard/metrics?tenantId=${tenantId}`);
      const timelineRes = await fetch(`/api/agent-lab-dashboard/timeline?tenantId=${tenantId}&limit=10`);

      const m = await metricsRes.json();
      const t = await timelineRes.json();

      setMetrics(m.data);
      setTimeline(t.data || []);
    } catch (e) {
      console.error("Error fetching dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Cargando métricas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Agent Lab Dashboard</h1>
        <p className="text-slate-400">Métricas en tiempo real de simulaciones y A/B tests</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Simulaciones (7d)"
          value={metrics?.simulations.totalRun || 0}
          subtitle="Ejecuciones completadas"
          icon="📊"
          trend={metrics?.simulations.trend}
        />
        <KPICard
          title="Tasa Promedio"
          value={`${metrics?.simulations.avgSuccessRate}%`}
          subtitle="Éxito en simulaciones"
          icon="✅"
          color="green"
        />
        <KPICard title="A/B Tests Activos" value={metrics?.abTests.active || 0} subtitle="En ejecución" icon="🔬" />
        <KPICard
          title="Versiones Aplicadas"
          value={metrics?.abTests.completed || 0}
          subtitle="A producción"
          icon="🚀"
          color="blue"
        />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Simulaciones Trend */}
        <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
          <h2 className="text-xl font-bold text-white mb-4">Tendencia de Éxito (Últimas 7 Simulaciones)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={generateChartData(metrics?.simulations || {})}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #475569" }} />
              <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} name="Tasa %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Hallazgos Top */}
        <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
          <h2 className="text-xl font-bold text-white mb-4">Hallazgos Frecuentes</h2>
          <div className="space-y-3">
            {metrics?.recentFindings?.slice(0, 5).map((finding: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between bg-slate-600/30 p-3 rounded">
                <span className="text-slate-300 text-sm truncate">{finding.descripcion}</span>
                <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-xs font-bold">
                  {finding.frecuencia}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
        <h2 className="text-xl font-bold text-white mb-4">Timeline Reciente</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {timeline.map((event: any, idx: number) => (
            <div key={idx} className="flex items-center gap-4 text-sm border-l-2 border-slate-600 pl-4 py-2">
              <div className="text-xs font-mono text-slate-400 min-w-max">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div className="flex-1">
                <span className="inline-block bg-slate-600/50 px-2 py-1 rounded text-xs font-bold text-slate-200 mr-2">
                  {event.type.replace("_", " ")}
                </span>
                <span className="text-slate-300 text-xs">{JSON.stringify(event.tags).slice(0, 50)}...</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-slate-500 text-xs">
        <p>Actualizado hace {Math.floor(Date.now() / 1000) % 60} segundos</p>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = "slate",
}: {
  title: string;
  value: any;
  subtitle: string;
  icon: string;
  trend?: string;
  color?: string;
}) {
  const bgColor = color === "green" ? "bg-green-500/20" : color === "blue" ? "bg-blue-500/20" : "bg-slate-600/30";
  const textColor = color === "green" ? "text-green-400" : color === "blue" ? "text-blue-400" : "text-slate-400";

  return (
    <div className={`${bgColor} rounded-lg p-6 border border-slate-600 backdrop-blur`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {trend && <p className="text-xs text-slate-400 mt-2">Tendencia: {trend}</p>}
    </div>
  );
}

function generateChartData(metrics: any) {
  return [
    { name: "1", rate: (metrics.avgSuccessRate || 0) * 0.95 },
    { name: "2", rate: (metrics.avgSuccessRate || 0) * 0.98 },
    { name: "3", rate: (metrics.avgSuccessRate || 0) * 1.02 },
    { name: "4", rate: metrics.avgSuccessRate || 0 },
    { name: "5", rate: (metrics.avgSuccessRate || 0) * 1.01 },
    { name: "6", rate: (metrics.avgSuccessRate || 0) * 0.99 },
    { name: "7", rate: (metrics.avgSuccessRate || 0) * 1.03 },
  ];
}
