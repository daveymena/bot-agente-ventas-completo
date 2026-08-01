import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Settings,
  Trash2,
  Edit,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Users,
  Plus,
  Save,
  Image,
  Star,
  Zap,
  Eye,
  ChevronDown,
  Search,
  Filter,
  LogOut,
  LayoutTemplate,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useStore } from '../store/useStore';
import { storeTemplates, type StoreTemplate } from '../store/templates';
import { Link } from 'react-router-dom';
import { useRealProducts, type RealProduct } from '../hooks/useRealProducts';

/* ───────── Dashboard Overview ───────── */
const DashboardOverview = () => {
  const { cart, config } = useStore();
  const { products: realProducts } = useRealProducts();
  const totalSales = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalProducts = realProducts.length;
  const totalOrders = cart.length;

  const stats = [
    { label: 'Productos', value: totalProducts, icon: Package, color: 'from-blue-500 to-cyan-500' },
    { label: 'Ventas', value: `$${totalSales.toFixed(0)}`, icon: DollarSign, color: 'from-green-500 to-emerald-500' },
    { label: 'Órdenes', value: totalOrders, icon: ShoppingBag, color: 'from-amber-500 to-orange-500' },
    { label: 'Visitantes', value: '—', icon: Users, color: 'from-violet-500 to-purple-500' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Bienvenido de nuevo, {config.storeName}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="relative bg-white rounded-2xl border border-slate-100 p-6 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-5 rounded-full -translate-y-6 translate-x-6`} />
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-3xl font-black text-slate-900">{value}</div>
            <div className="text-sm text-slate-400 font-medium mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ───────── Product Management ─────────
 * Antes operaba SOLO sobre el estado local de zustand (persistido en
 * localStorage del navegador) -- nada de lo que se creaba/editaba/borraba
 * acá llegaba a la base de datos real, ni se reflejaba en la tienda pública,
 * el bot de WhatsApp ni el resto del dashboard. Ahora usa useRealProducts(),
 * que pega directo a /api/products (el mismo endpoint que ya usa el resto
 * del sistema). */
const ProductManagement = () => {
  const { products, loading, error, createProduct, updateProduct, deleteProduct } = useRealProducts();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', price: 0, description: '', imageUrl: '', kind: 'digital' as 'digital' | 'physical' });

  const resetForm = () => setForm({ name: '', price: 0, description: '', imageUrl: '', kind: 'digital' });
  const openNew = () => { resetForm(); setEditingId(null); setShowForm(true); };
  const openEdit = (p: RealProduct) => {
    setForm({ name: p.name, price: Number(p.price), description: p.description || '', imageUrl: p.imageUrl || '', kind: p.kind });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.price <= 0) {
      Swal.fire('Error', 'Nombre y precio válidos requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateProduct(editingId, form);
        Swal.fire('Actualizado', '', 'success');
      } else {
        await createProduct(form);
        Swal.fire('Creado', 'Producto agregado correctamente', 'success');
      }
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar el producto', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    Swal.fire({
      title: '¿Eliminar?',
      text: `Se borrará "${name}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(async r => {
      if (!r.isConfirmed) return;
      try {
        await deleteProduct(id);
        Swal.fire('Eliminado', '', 'success');
      } catch (err: any) {
        Swal.fire('Error', err.message || 'No se pudo eliminar', 'error');
      }
    });
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Productos</h2>
          <p className="text-sm text-slate-400">{products.length} productos registrados</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-lg">{editingId ? 'Editar Producto' : 'Nuevo Producto'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Nombre del producto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <input placeholder="Precio (COP)" type="number" step="1" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} required className="border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <input placeholder="URL de imagen" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className="border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none md:col-span-2" />
            <textarea placeholder="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none md:col-span-2" rows={3} />
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as any })} className="border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="digital">Digital</option>
              <option value="physical">Físico</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-700 transition-all disabled:opacity-50">
              <Save size={16} /> {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Guardar'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando productos…</div>
      ) : error ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-red-200 text-red-500 text-sm">{error}</div>
      ) : filtered.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Producto</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Categoría</th>
                <th className="text-left px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="text-right px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Precio</th>
                <th className="text-right px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <Image className="w-5 h-5 m-auto text-slate-300" />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-400">{(p.description || '').slice(0, 40)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{p.category || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${p.kind === 'digital' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {p.kind}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">${Number(p.price).toLocaleString('es-CO')}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(p.id, p.name)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No hay productos</h3>
          <p className="text-sm text-slate-400">Crea tu primer producto para empezar a vender</p>
        </div>
      )}
    </div>
  );
};

/* ───────── Settings ───────── */
const SettingsPanel = () => {
  const { config, updateConfig } = useStore();
  const [saving, setSaving] = useState(false);

  // Sin esto el picker siempre arrancaba en el rojo por defecto de la demo,
  // aunque el dueño ya hubiera guardado otro color antes -- GET /api/branding
  // es el mismo endpoint autenticado que ya expone brandColors completo.
  useEffect(() => {
    fetch('/api/branding', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        updateConfig({
          storeName: d.brandName || config.storeName,
          logoUrl: d.brandLogo || config.logoUrl,
          primaryColor: d.brandColors?.primary || config.primaryColor,
          secondaryColor: d.brandColors?.secondary || config.secondaryColor,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Antes esto solo mostraba un mensaje de "Guardado" sin llamar al backend
  // -- el color quedaba en el localStorage de ESTE navegador nada más, así
  // que la tienda pública (que lee /api/public/products/:slug en cualquier
  // otro navegador/dispositivo) nunca veía el cambio.
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brandName: config.storeName || undefined,
          // brandLogo exige URL válida en el backend -- mandarlo solo si de
          // verdad parece una, para que un campo vacío o a medio escribir no
          // tumbe el guardado completo del color por un 400 de otro campo.
          ...(config.logoUrl?.startsWith('http') ? { brandLogo: config.logoUrl } : {}),
          brandColors: {
            primary: config.primaryColor,
            secondary: config.secondaryColor,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.message || 'No se pudo guardar');
      }
      Swal.fire('Guardado', 'Configuración actualizada en la tienda pública', 'success');
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar la configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900">Ajustes de la tienda</h2>
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nombre de la tienda</label>
            <input value={config.storeName} onChange={e => updateConfig({ storeName: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">URL del logo</label>
            <input value={config.logoUrl} onChange={e => updateConfig({ logoUrl: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Color principal</label>
            <div className="flex gap-2">
              <input type="color" value={config.primaryColor} onChange={e => updateConfig({ primaryColor: e.target.value })} className="w-12 h-10 rounded-xl border border-slate-200 cursor-pointer" />
              <input value={config.primaryColor} onChange={e => updateConfig({ primaryColor: e.target.value })} className="flex-1 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Color secundario</label>
            <div className="flex gap-2">
              <input type="color" value={config.secondaryColor} onChange={e => updateConfig({ secondaryColor: e.target.value })} className="w-12 h-10 rounded-xl border border-slate-200 cursor-pointer" />
              <input value={config.secondaryColor} onChange={e => updateConfig({ secondaryColor: e.target.value })} className="flex-1 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Slug del tenant</label>
            <input value={config.slug} onChange={e => updateConfig({ slug: e.target.value })} placeholder="ej: mi-tienda" className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <p className="text-xs text-slate-400 mt-1">Identificador de la tienda en la URL pública</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
};

/* ───────── Template Selector ───────── */
const TemplateSelector = () => {
  const { applyTemplate, activeTemplate } = useStore();

  const handleApply = (template: StoreTemplate) => {
    Swal.fire({
      title: `¿Aplicar plantilla "${template.name}"?`,
      text: 'Se reemplazarán los productos actuales y la configuración visual.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aplicar',
      cancelButtonText: 'Cancelar',
    }).then(r => {
      if (r.isConfirmed) {
        applyTemplate(template);
        Swal.fire('Aplicada', `Plantilla "${template.name}" cargada correctamente`, 'success');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Plantillas de Tienda</h2>
          <p className="text-sm text-slate-400">Elige una plantilla para tu nicho y empieza a vender</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {storeTemplates.map(template => (
          <div
            key={template.id}
            className={`relative bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group ${
              activeTemplate === template.id
                ? 'border-indigo-500 ring-2 ring-indigo-200'
                : 'border-slate-100 hover:border-indigo-200'
            }`}
            onClick={() => handleApply(template)}
          >
            {/* Color bar */}
            <div
              className="h-2 w-full"
              style={{ background: `linear-gradient(90deg, ${template.colors.primary}, ${template.colors.secondary})` }}
            />

            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{template.icon}</span>
                <div>
                  <h3 className="font-bold text-slate-900">{template.name}</h3>
                  <p className="text-xs text-slate-400">{template.description}</p>
                </div>
              </div>

              {/* Color preview */}
              <div className="flex gap-2 mb-3">
                <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: template.colors.primary }} />
                <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: template.colors.secondary }} />
              </div>

              {/* Categories */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {template.categories.slice(0, 4).map(cat => (
                  <span key={cat} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">
                    {cat}
                  </span>
                ))}
                {template.categories.length > 4 && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full text-[10px] font-medium">
                    +{template.categories.length - 4}
                  </span>
                )}
              </div>

              {/* Products count */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{template.defaultProducts.length} productos</span>
                {activeTemplate === template.id ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                    <Sparkles size={12} /> Activa
                  </span>
                ) : (
                  <span className="text-xs font-medium text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    Aplicar plantilla →
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ───────── Main Admin ───────── */
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { setAdmin, config } = useStore();

  const menu = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Productos', icon: Package },
    { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-white border-r border-slate-100 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-black text-slate-900">Admin</h1>
          <p className="text-xs text-slate-400">Panel de control</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menu.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-100'}`}>
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <Link to={config.slug ? `/tienda/${config.slug}` : '/shop'} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-all">
            <Eye size={18} /> Ver Tienda
          </Link>
          <button onClick={() => setAdmin(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-50 transition-all">
            <LogOut size={18} /> Salir del Admin
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'overview' && <DashboardOverview />}
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'templates' && <TemplateSelector />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
};

export default AdminDashboard;
