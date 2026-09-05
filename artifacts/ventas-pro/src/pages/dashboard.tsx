import { 
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetFunnel, getGetFunnelQueryKey,
  useGetMessagesTimeline, getGetMessagesTimelineQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Layout } from "@/components/layout";
import { Users, MessageSquare, CheckCircle, DollarSign, Activity, Percent, Clock, Smartphone, Bot, Plus, ArrowRight, Zap, AlertTriangle, TrendingUp, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";
import { SaasStatusBanner } from "@/components/saas-status-banner";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";

const HELP_GUIDE = getHelpGuide("panel")!;

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 3000 }
  });

  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey(), refetchInterval: 3000 }
  });

  const { data: funnel, isLoading: loadingFunnel } = useGetFunnel({
    query: { queryKey: getGetFunnelQueryKey(), refetchInterval: 5000 }
  });

  const { data: timeline, isLoading: loadingTimeline } = useGetMessagesTimeline({
    query: { queryKey: getGetMessagesTimelineQueryKey(), refetchInterval: 5000 }
  });

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 5000, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  useAutoTour(HELP_GUIDE);

  const isWhatsAppConnected = wsStatus?.state === 'connected';

  // Build attention items dynamically from real data
  const attentionItems: { label: string; value: string; href: string; variant: 'warning' | 'danger' | 'info' }[] = [];
  if (!isWhatsAppConnected) {
    attentionItems.push({ label: "WhatsApp desconectado", value: "Reconectar", href: "/whatsapp", variant: "danger" });
  }
  if (summary && (summary.activeConversations ?? 0) > 0) {
    attentionItems.push({ label: "Conversaciones activas", value: `${summary.activeConversations}`, href: "/conversations", variant: "warning" });
  }
  if (summary && (summary.totalLeads ?? 0) > 0) {
    const newLeads = Array.isArray(funnel) ? funnel.find(f => f.stage === 'new')?.count : 0;
    if (newLeads && newLeads > 0) {
      attentionItems.push({ label: "Leads nuevos sin contactar", value: `${newLeads}`, href: "/leads", variant: "info" });
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 18) return "Buenas tardes";
    return "Buenas noches";
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 md:gap-8">

        {/* SaaS Status Banner */}
        <SaasStatusBanner />

        {/* Zona 1: Greeting + North Star */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">{getGreeting()}</h1>
            <HelpTourButton guide={HELP_GUIDE} />
          </div>
          <p className="text-sm text-slate-500">Resumen de tu operación comercial</p>
        </div>

        {/* North Star: Revenue */}
        {loadingSummary ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : summary ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6" data-tour="dashboard-whatsapp-status">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Ingresos del mes</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight tabular-nums">
                    ${(summary.totalRevenue ?? 0).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    {summary.closedDeals ?? 0} tratos ganados
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3" data-tour="dashboard-quick-actions">
                <Link href="/conversations" className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium px-4 transition-colors gap-2 text-sm">
                  <MessageSquare className="h-4 w-4" /> Conversaciones
                </Link>
                <Link href="/products" className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium px-4 transition-colors gap-2 text-sm">
                  <Plus className="h-4 w-4" /> Crear producto
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {/* Zona 2: Requiere atención */}
        {attentionItems.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Requiere atención
            </h2>
            <div className="flex flex-col gap-2">
              {attentionItems.map((item, idx) => (
                <Link key={idx} href={item.href} className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.variant === 'danger' ? 'bg-red-500' : item.variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${item.variant === 'danger' ? 'text-red-600' : item.variant === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
                      {item.value}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Zona 3: KPIs - Max 4 */}
        {loadingSummary ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : summary ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KPICard title="Prospectos" value={summary.totalLeads ?? 0} icon={Users} tint="indigo" />
            <KPICard title="Chats activos" value={summary.activeConversations ?? 0} icon={MessageSquare} tint="sky" />
            <KPICard title="Conversión" value={`${(summary.conversionRate ?? 0).toFixed(1)}%`} icon={Percent} tint="emerald" />
            <KPICard title="Resp. promedio" value={`${summary.avgResponseTime ?? 0}s`} icon={Clock} tint="amber" />
          </div>
        ) : null}

        {/* Zona 4: Charts - Tendencia + Embudo */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4 bg-white border-slate-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-800">Volumen de mensajes</CardTitle>
              <CardDescription className="text-slate-500">Actividad entrante vs saliente</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px] md:h-[300px]">
              {loadingTimeline ? <Skeleton className="w-full h-full rounded-lg" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.isArray(timeline) ? timeline : []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(parseISO(val), "d MMM", { locale: es })}
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                      labelFormatter={(val) => format(parseISO(val as string), "d MMM yyyy", { locale: es })}
                      itemStyle={{ fontWeight: 600, fontSize: 13 }}
                    />
                    <Area type="monotone" dataKey="incoming" name="Entrantes" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorIncoming)" />
                    <Area type="monotone" dataKey="outgoing" name="Salientes" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorOutgoing)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 bg-white border-slate-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-800">Embudo de ventas</CardTitle>
              <CardDescription className="text-slate-500">Conversión por etapa</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px] md:h-[300px]">
              {loadingFunnel ? <Skeleton className="w-full h-full rounded-lg" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.isArray(funnel) ? funnel : []} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      dataKey="stage" 
                      type="category" 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      width={90}
                      tickFormatter={(val) => {
                        const stages: Record<string, string> = {
                          new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado', proposal: 'Propuesta', won: 'Ganado', lost: 'Perdido'
                        };
                        return stages[val] || val;
                      }}
                    />
                    <Tooltip 
                      cursor={{fill: '#f1f5f9'}}
                      contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [<span className="font-bold">{value}</span>, 'Prospectos']}
                    />
                    <Bar dataKey="count" name="Prospectos" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={20}>
                      {(Array.isArray(funnel) ? funnel : []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={
                          entry.stage === 'won' ? '#10b981' :
                          entry.stage === 'lost' ? '#ef4444' :
                          '#4f46e5'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zona 5: Actividad reciente */}
        <Card className="bg-white border-slate-200 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">Actividad reciente</CardTitle>
              <CardDescription className="text-slate-500">Lo que está sucediendo ahora</CardDescription>
            </div>
            <Link href="/conversations" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1" data-tour="dashboard-recent-activity">
              Ver todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-3">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : !activity || activity.length === 0 ? (
              <div className="text-center py-10 text-slate-400 border rounded-lg border-dashed border-slate-200">
                <Zap className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay actividad reciente</p>
              </div>
            ) : (
              <div className="space-y-1">
                {(Array.isArray(activity) ? activity : []).map((event) => {
                  let Icon = Zap;
                  let tint = 'bg-slate-100 text-slate-500';

                  switch(event.type) {
                    case 'lead_created': Icon = Users; tint = 'bg-emerald-50 text-emerald-600'; break;
                    case 'deal_won': Icon = CheckCircle; tint = 'bg-emerald-50 text-emerald-600'; break;
                    case 'deal_lost': Icon = Activity; tint = 'bg-red-50 text-red-500'; break;
                    case 'message_received': Icon = MessageSquare; tint = 'bg-sky-50 text-sky-600'; break;
                    case 'agent_action': Icon = Bot; tint = 'bg-indigo-50 text-indigo-600'; break;
                    case 'handoff': Icon = ArrowRight; tint = 'bg-amber-50 text-amber-600'; break;
                  }

                  return (
                    <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 leading-snug truncate">{event.description}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap tabular-nums">
                        {format(parseISO(event.createdAt), "HH:mm", { locale: es })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

/* KPI Card component — clean, compact */
function KPICard({ title, value, icon: Icon, tint }: { title: string; value: string | number; icon: any; tint: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    sky: { bg: 'bg-sky-50', text: 'text-sky-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  };
  const colors = colorMap[tint] || colorMap.indigo;
  
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${colors.text}`} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
    </div>
  );
}