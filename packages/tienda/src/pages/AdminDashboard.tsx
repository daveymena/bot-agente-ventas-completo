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
  PanelLeftClose,
  PanelLeftOpen,
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
        <>
        {/* MÓVIL: rejilla de 2 columnas, el mismo patrón que las tarjetas de
            la tienda pública. Una tabla de 5 columnas en un teléfono obliga a
            scrollear de costado para ver el precio o poder editar -- y aun
            resolviendo el desborde, deja media pantalla vacía. Con tarjetas
            se ven el doble de productos por pantallazo y las acciones quedan
            siempre a la vista. La tabla sigue existiendo para md+, donde el
            ancho sobra y comparar filas es más cómodo. */}
        <div className="md:hidden grid grid-cols-2 gap-3">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="relative aspect-square bg-slate-100">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  : <Image className="w-8 h-8 text-slate-300 absolute inset-0 m-auto" />}
                <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${p.kind === 'digital' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {p.kind}
                </span>
              </div>
              <div className="p-2.5 flex flex-col gap-1 flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{p.category || '—'}</p>
                <h4 className="text-[13px] font-bold text-slate-900 leading-snug line-clamp-2 min-h-[2.4em]">{p.name}</h4>
                <p className="text-sm font-black text-slate-900 mt-auto">${Number(p.price).toLocaleString('es-CO')}</p>
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => openEdit(p)}
                    aria-label={`Editar ${p.name}`}
                    className="flex-1 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center gap-1.5 text-xs font-semibold active:bg-slate-200 transition-all"
                  >
                    <Edit size={14} /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    aria-label={`Eliminar ${p.name}`}
                    className="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:bg-red-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ESCRITORIO: la tabla de siempre */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
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
        </div>
        </>
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

  // Plegada de entrada por debajo de 1024px: es justo el rango (tablet y
  // portátil chico) donde 256px de barra dejan el contenido apretado.
  const [collapsed, setCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );

  const menu = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Productos', icon: Package },
    { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    /* md:flex y no flex a secas: la barra lateral mide 256px fijos y no tenía
       ninguna variante responsive, así que en un teléfono de 375px se comía
       casi todo el ancho -- quedaban ~119px para el contenido, y descontando
       el p-8 (64px) sobraban unos 55px útiles. El panel era inusable en
       móvil. Abajo del breakpoint el contenedor pasa a bloque y la barra se
       reemplaza por una cabecera con pestañas horizontales. */
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Colapsable: con 256px fijos, en una tablet o un portátil chico
          (768-1024px) la barra se llevaba un tercio del ancho y apretaba el
          contenido. Arranca plegada por debajo de 1024px y el usuario puede
          alternar cuando quiera; plegada deja solo los iconos en 64px. */}
      <aside className={`hidden md:flex ${collapsed ? 'w-16' : 'w-64'} shrink-0 bg-white border-r border-slate-100 flex-col transition-[width] duration-200`}>
        <div className={`border-b border-slate-100 flex items-center gap-2 ${collapsed ? 'p-3 justify-center' : 'p-6'}`}>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black text-slate-900">Admin</h1>
              <p className="text-xs text-slate-400">Panel de control</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
            title={collapsed ? 'Expandir menú' : 'Plegar menú'}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className={`flex-1 space-y-1 ${collapsed ? 'p-2' : 'p-4'}`}>
          {menu.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center rounded-xl text-sm font-medium transition-all ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'} ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-100'}`}>
              <item.icon size={18} /> {!collapsed && item.label}
            </button>
          ))}
        </nav>
        <div className={`border-t border-slate-100 ${collapsed ? 'p-2' : 'p-4'}`}>
          <Link to={config.slug ? `/tienda/${config.slug}` : '/shop'}
            title={collapsed ? 'Ver tienda' : undefined}
            className={`flex items-center rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-all ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}`}>
            <Eye size={18} /> {!collapsed && 'Ver Tienda'}
          </Link>
          <button onClick={() => setAdmin(false)}
            title={collapsed ? 'Salir del admin' : undefined}
            className={`w-full flex items-center rounded-xl text-sm font-medium text-red-400 hover:bg-red-50 transition-all ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}`}>
            <LogOut size={18} /> {!collapsed && 'Salir del Admin'}
          </button>
        </div>
      </aside>

      {/* Cabecera móvil: mismas 4 secciones que la barra lateral, en
          pestañas que scrollean en horizontal. Sticky para que no haya que
          volver arriba cada vez que se cambia de sección. */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 leading-tight">Admin</h1>
            <p className="text-[11px] text-slate-400">Panel de control</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              to={config.slug ? `/tienda/${config.slug}` : '/shop'}
              aria-label="Ver tienda"
              className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 transition-all"
            >
              <Eye size={18} />
            </Link>
            <button
              onClick={() => setAdmin(false)}
              aria-label="Salir del admin"
              className="p-2.5 rounded-xl text-red-400 hover:bg-red-50 transition-all"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menu.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600'}`}
            >
              <item.icon size={15} /> {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* p-4 en móvil: el p-8 fijo se llevaba 64px de los 375 de ancho */}
      <main className="flex-1 min-w-0 p-4 md:p-8 overflow-y-auto">
        {activeTab === 'overview' && <DashboardOverview />}
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'templates' && <TemplateSelector />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
};

export default AdminDashboard;
