import { 
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetFunnel, getGetFunnelQueryKey,
  useGetMessagesTimeline, getGetMessagesTimelineQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Layout } from "@/components/layout";
import { Users, MessageSquare, CheckCircle, DollarSign, Activity, Percent, Clock, Smartphone, Bot, Plus, ArrowRight, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SaasStatusBanner } from "@/components/saas-status-banner";
import { MobileDashboard } from "@/components/mobile-dashboard";
import { motion } from "framer-motion";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("panel")!;

function MetricCard({ title, value, icon: Icon, description, className = "" }: { title: string, value: string | number, icon: any, description?: string, className?: string }) {
  return (
    <Card className={`transition-shadow hover:shadow-md ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight tabular-nums-all">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1.5 font-medium">{description}</p>}
      </CardContent>
    </Card>
  );
}

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

  useAutoTour(HELP_GUIDE);

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

  return (
    <Layout>
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-8">
        
        {/* SaaS Status Banner */}
        <motion.div variants={itemVariants}><SaasStatusBanner /></motion.div>
        
        {/* Hero Section */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-6 md:items-end justify-between glass-panel p-6 md:p-7 rounded-xl shadow-md border-0">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Hola, bienvenido de nuevo</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground mt-1.5 mb-5">Aquí está el resumen de tu operación en WhatsApp.</p>

            <div className="flex flex-wrap items-center gap-3" data-tour="dashboard-whatsapp-status">
              {summary?.whatsappConnected ? (
                <div className="flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-4 py-2 rounded-full text-sm font-semibold border border-green-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  WhatsApp Conectado
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-red-500/10 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-semibold border border-red-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  WhatsApp Desconectado
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3" data-tour="dashboard-quick-actions">
            <Link href="/agents" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted font-medium px-5 transition-colors gap-2 text-sm">
              <Bot className="h-4 w-4" /> Nuevo Agente
            </Link>
            <Link href="/products" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted font-medium px-5 transition-colors gap-2 text-sm">
              <Plus className="h-4 w-4" /> Crear Producto
            </Link>
            <Link href="/whatsapp" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-5 transition-colors gap-2 text-sm">
              <Smartphone className="h-4 w-4" /> Conectar WhatsApp
            </Link>
          </div>
        </motion.div>

        {/* Mobile Dashboard */}
        <motion.div variants={itemVariants}>
          <MobileDashboard summary={summary ?? undefined} />
        </motion.div>

        {/* Main KPIs */}
        {loadingSummary ? (
          <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl glass-card border-0" />)}
          </motion.div>
        ) : summary ? (
          <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Ingresos del Mes"
              value={`$${(summary?.totalRevenue ?? 0).toLocaleString()}`}
              icon={DollarSign}
              description="Basado en tratos ganados"
              className="glass-card border-0"
            />
            <MetricCard title="Total Prospectos" value={summary?.totalLeads ?? 0} icon={Users} className="glass-card border-0" />
            <MetricCard title="Conversaciones Activas" value={summary?.activeConversations ?? 0} icon={MessageSquare} className="glass-card border-0" />
            <MetricCard
              title="Tratos Ganados"
              value={summary?.closedDeals ?? 0}
              icon={CheckCircle}
              className="glass-card border-0"
            />
          </motion.div>
        ) : null}

        {/* Secondary KPIs */}
        {loadingSummary ? (
          <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl glass-panel border-0" />)}
          </motion.div>
        ) : summary ? (
          <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
            <Card className="glass-panel">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Percent className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Tasa de Conversión</p>
                  <p className="text-2xl font-bold tabular-nums-all">{(summary?.conversionRate ?? 0).toFixed(1)}%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Tiempo de Respuesta</p>
                  <p className="text-2xl font-bold tabular-nums-all">{summary?.avgResponseTime ?? 0}s</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Mensajes Hoy</p>
                  <p className="text-2xl font-bold tabular-nums-all">{summary?.messagesLast24h ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {/* Charts Section */}
        <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 glass-panel border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Volumen de Mensajes</CardTitle>
              <CardDescription>Actividad entrante vs saliente en los últimos días</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loadingTimeline ? <Skeleton className="w-full h-full rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.isArray(timeline) ? timeline : []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(parseISO(val), "d MMM", { locale: es })}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      labelFormatter={(val) => format(parseISO(val as string), "d MMM yyyy", { locale: es })}
                      itemStyle={{ fontWeight: 600 }}
                    />
                    <Area type="monotone" dataKey="incoming" name="Entrantes" stroke="hsl(var(--chart-1))" strokeWidth={3} fillOpacity={1} fill="url(#colorIncoming)" />
                    <Area type="monotone" dataKey="outgoing" name="Salientes" stroke="hsl(var(--chart-2))" strokeWidth={3} fillOpacity={1} fill="url(#colorOutgoing)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-3 glass-panel border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Embudo de Ventas</CardTitle>
              <CardDescription>Conversión actual por etapas</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loadingFunnel ? <Skeleton className="w-full h-full rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.isArray(funnel) ? funnel : []} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      dataKey="stage" 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))" 
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
                      cursor={{fill: 'hsl(var(--muted)/0.5)'}}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      formatter={(value: number) => [<span className="font-bold">{value}</span>, 'Prospectos']}
                    />
                    <Bar dataKey="count" name="Prospectos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24}>
                      {(Array.isArray(funnel) ? funnel : []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={
                          entry.stage === 'won' ? 'hsl(var(--coral))' :
                          entry.stage === 'lost' ? 'hsl(var(--destructive)/0.5)' :
                          `hsl(var(--primary))`
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants}>
        <Card className="glass-panel border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Actividad Reciente</CardTitle>
              <CardDescription>Lo que está sucediendo ahora mismo</CardDescription>
            </div>
            <Link href="/conversations" className="text-sm text-primary hover:underline font-medium flex items-center gap-1" data-tour="dashboard-recent-activity">
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-4">
                {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : activity?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
                <Zap className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p>No hay actividad reciente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(Array.isArray(activity) ? activity : []).map((event) => {
                  let Icon = Zap;
                  let tint = 'bg-muted text-muted-foreground';

                  switch(event.type) {
                    case 'lead_created': Icon = Users; tint = 'bg-emerald-500/10 text-emerald-600'; break;
                    case 'deal_won': Icon = CheckCircle; tint = 'bg-primary/10 text-primary'; break;
                    case 'deal_lost': Icon = Activity; tint = 'bg-red-500/10 text-red-600'; break;
                    case 'message_received': Icon = MessageSquare; tint = 'bg-sky-500/10 text-sky-600'; break;
                    case 'agent_action': Icon = Bot; tint = 'bg-primary/10 text-primary'; break;
                    case 'handoff': Icon = ArrowRight; tint = 'bg-accent/10 text-accent'; break;
                  }

                  return (
                    <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors">
                      <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${tint}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug truncate text-foreground">{event.description}</p>
                      </div>
                      <div className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {format(parseISO(event.createdAt), "HH:mm", { locale: es })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
    </Layout>
  );
}