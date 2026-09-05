import { Users, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MobileDashboardProps {
  summary?: {
    totalRevenue?: number;
    totalLeads?: number;
    activeConversations?: number;
    closedDeals?: number;
    avgResponseTime?: number;
    conversionRate?: number;
    messagesLast24h?: number;
  };
}

/**
 * MobileDashboard — compact view for mobile breakpoints.
 * The main dashboard.tsx now handles both desktop + mobile layout using
 * responsive grid, so this component only provides the revenue hero card
 * and the 2x2 stats grid specifically for screens < md.
 * 
 * It's intentionally simpler than the desktop view — no charts, no
 * activity feed on the mobile-specific component (those are shown
 * in the unified dashboard below the fold on mobile).
 */
export function MobileDashboard({ summary }: MobileDashboardProps) {
  const isLoading = !summary;

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {/* Income Card - clean indigo, no gradient excess */}
      <div className="bg-indigo-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-indigo-200">Ingresos del mes</span>
        </div>
        <div className="text-3xl font-bold tracking-tight mb-1">
          {isLoading ? <Skeleton className="h-9 w-32 bg-white/20 rounded-lg" /> : `$${(summary.totalRevenue || 0).toLocaleString()}`}
        </div>
        <p className="text-xs text-indigo-200">
          {isLoading ? null : `${summary.closedDeals || 0} tratos ganados`}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MiniStatCard title="Prospectos" value={isLoading ? undefined : summary.totalLeads} icon={Users} tint="indigo" isLoading={isLoading} />
        <MiniStatCard title="Chats activos" value={isLoading ? undefined : summary.activeConversations} icon={MessageSquare} tint="sky" isLoading={isLoading} />
        <MiniStatCard title="Tratos ganados" value={isLoading ? undefined : summary.closedDeals} icon={CheckCircle} tint="emerald" isLoading={isLoading} />
        <MiniStatCard title="Resp. promedio" value={isLoading ? undefined : `${summary.avgResponseTime}s`} icon={Clock} tint="amber" isLoading={isLoading} />
      </div>
    </div>
  );
}

function MiniStatCard({ title, value, icon: Icon, tint, isLoading }: {
  title: string;
  value: string | number | undefined;
  icon: any;
  tint: string;
  isLoading: boolean;
}) {
  const tintMap: Record<string, { bg: string; icon: string }> = {
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600' },
    sky: { bg: 'bg-sky-50', icon: 'text-sky-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600' },
  };
  const c = tintMap[tint] || tintMap.indigo;

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
        </div>
      </div>
      <div className="text-xl font-bold text-slate-900 tabular-nums">
        {isLoading ? <Skeleton className="h-7 w-14 rounded" /> : value}
      </div>
    </div>
  );
}
