import { Users, MessageSquare, CheckCircle, Timer, TrendingUp } from "lucide-react";
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

export function MobileDashboard({ summary }: MobileDashboardProps) {
  const isLoading = !summary;

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {/* Income Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[20px] p-5 text-white shadow-lg shadow-indigo-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-indigo-200">Ingresos del Mes</span>
          {isLoading ? (
            <Skeleton className="h-5 w-12 bg-white/20 rounded-full" />
          ) : (
            <span className="text-[10px] font-semibold bg-white/20 px-2.5 py-1 rounded-full">+12.5%</span>
          )}
        </div>
        <div className="text-3xl font-bold tracking-tight mb-3">
          {isLoading ? <Skeleton className="h-9 w-32 bg-white/20" /> : `$${(summary.totalRevenue || 0).toLocaleString()}`}
        </div>
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-1.5 text-indigo-200 text-xs font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+8% vs mes anterior</span>
          </div>
          <svg width="80" height="32" viewBox="0 0 80 32" className="opacity-70">
            <path d="M0,24 L10,20 L20,22 L30,14 L40,16 L50,8 L60,10 L70,4 L80,6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M0,24 L10,20 L20,22 L30,14 L40,16 L50,8 L60,10 L70,4 L80,6 L80,32 L0,32 Z" fill="url(#mobileSparkline)" opacity="0.2"/>
            <defs>
              <linearGradient id="mobileSparkline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-[20px] p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Prospectos</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {isLoading ? <Skeleton className="h-8 w-16" /> : summary.totalLeads}
          </div>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Chats activos</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {isLoading ? <Skeleton className="h-8 w-16" /> : summary.activeConversations}
          </div>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Tratos ganados</span>
            <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {isLoading ? <Skeleton className="h-8 w-16" /> : summary.closedDeals}
          </div>
        </div>
        <div className="bg-white rounded-[20px] p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Respuesta</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Timer className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {isLoading ? <Skeleton className="h-8 w-16" /> : `${summary.avgResponseTime}s`}
          </div>
        </div>
      </div>
    </div>
  );
}
