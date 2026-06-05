import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, Building2, MoreHorizontal, Search, Filter,
  Crown, ShieldOff, CheckCircle2, XCircle, Clock,
  TrendingUp, MessageSquare, Package, Bot, Plus,
  Trash2, Edit, Eye, BarChart3, Activity, ChevronDown
} from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  starter: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  professional: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  enterprise: "bg-amber-500/20 text-amber-300 border-amber-500/30"
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  trial: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  suspended: "bg-red-500/20 text-red-300 border-red-500/30",
  inactive: "bg-gray-500/20 text-gray-300 border-gray-500/30"
};

interface Tenant {
  id: number;
  name: string;
  email: string;
  brandName: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  conversationCount?: number;
  productCount?: number;
  messageCount?: number;
}

export default function AdminTenantsPage() {
  const { tenant } = useSession();
  const [, setLocation] = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [actionMenu, setActionMenu] = useState<number | null>(null);

  // Only admin can access
  useEffect(() => {
    if (tenant && tenant.email !== "daveymena16@gmail.com") {
      toast.error("Acceso restringido al administrador");
      setLocation("/");
    }
  }, [tenant]);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tenants/admin/list", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      } else {
        toast.error("Error cargando tenants");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (tenantId: number, action: string) => {
    setActionMenu(null);
    try {
      const res = await fetch(`/api/tenants/admin/${tenantId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Acción ejecutada");
        fetchTenants();
      } else {
        toast.error(data.error || "Error");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const filtered = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.email.toLowerCase().includes(search.toLowerCase()) ||
                        t.brandName.toLowerCase().includes(search.toLowerCase());
    const matchPlan = filterPlan === "all" || t.plan === filterPlan;
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchPlan && matchStatus;
  });

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === "active").length,
    trial: tenants.filter(t => t.status === "trial").length,
    revenue: tenants.reduce((acc, t) => {
      const prices: Record<string, number> = { starter: 29, professional: 99, enterprise: 299 };
      return acc + (t.status === "active" ? (prices[t.plan] || 0) : 0);
    }, 0)
  };

  return (
    <div className="min-h-screen bg-[#090d1a] text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Admin Panel</h1>
            <p className="text-white/40 text-sm">Gestión global de tenants SaaS</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Clientes", value: stats.total, icon: Users, color: "from-blue-500 to-cyan-500" },
          { label: "Activos", value: stats.active, icon: CheckCircle2, color: "from-green-500 to-emerald-500" },
          { label: "En Trial", value: stats.trial, icon: Clock, color: "from-yellow-500 to-orange-500" },
          { label: "MRR", value: `$${stats.revenue}`, icon: TrendingUp, color: "from-violet-500 to-purple-600" }
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden">
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${color} opacity-5 rounded-full -translate-y-4 translate-x-4`} />
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="text-2xl font-black">{value}</div>
            <div className="text-xs text-white/40 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o marca..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:outline-none text-sm placeholder:text-white/20"
          />
        </div>
        <select
          value={filterPlan}
          onChange={e => setFilterPlan(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:outline-none text-sm text-white"
        >
          <option value="all">Todos los planes</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:outline-none text-sm text-white"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspendido</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>

      {/* Tenants Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Negocio</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Plan</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Estado</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Uso</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Registro</th>
                <th className="text-right px-5 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-white/5 rounded-lg animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/30">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No se encontraron tenants
                  </td>
                </tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/30 border border-violet-500/20 flex items-center justify-center text-xs font-black text-violet-300">
                          {t.brandName?.[0]?.toUpperCase() || t.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{t.brandName || t.name}</div>
                          <div className="text-xs text-white/40">{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-lg border text-xs font-bold capitalize ${PLAN_COLORS[t.plan] || PLAN_COLORS.free}`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-lg border text-xs font-bold capitalize ${STATUS_COLORS[t.status] || STATUS_COLORS.inactive}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t.conversationCount ?? "—"}</span>
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />{t.productCount ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-white/40">
                      {new Date(t.createdAt).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActionMenu(actionMenu === t.id ? null : t.id)}
                          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4 text-white/50" />
                        </button>
                        {actionMenu === t.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-white/10 bg-[#1a1f35] shadow-2xl z-50 py-1 overflow-hidden">
                            <button
                              onClick={() => handleAction(t.id, "activate")}
                              className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 text-green-400"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Activar cuenta
                            </button>
                            <button
                              onClick={() => handleAction(t.id, "upgrade_enterprise")}
                              className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 text-amber-400"
                            >
                              <Crown className="w-3.5 h-3.5" /> Subir a Enterprise
                            </button>
                            <button
                              onClick={() => handleAction(t.id, "suspend")}
                              className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 text-red-400"
                            >
                              <ShieldOff className="w-3.5 h-3.5" /> Suspender
                            </button>
                            <div className="border-t border-white/10 my-1" />
                            <button
                              onClick={() => handleAction(t.id, "delete")}
                              className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar tenant
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Click outside to close menu */}
      {actionMenu !== null && (
        <div className="fixed inset-0 z-40" onClick={() => setActionMenu(null)} />
      )}
    </div>
  );
}
