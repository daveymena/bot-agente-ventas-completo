import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Store, Settings, Eye, EyeOff, Trash2, Edit, Plus, ChevronUp, ChevronDown,
  Star, Palette, BarChart3, Save, X, Loader
} from "lucide-react";
import { useLocation } from "wouter";

interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  currency?: string;
  isVisible?: boolean;
  order?: number;
  isFeatured?: boolean;
}

export default function StoreAdminPage() {
  const { tenant } = useSession();
  const [, setLocation] = useLocation();
  const slug = tenant?.slug || "mi-tienda";

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"products" | "design" | "analytics">("products");
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Design settings
  const [storeTheme, setStoreTheme] = useState<"light" | "dark">("light");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [storeDescription, setStoreDescription] = useState("Productos de calidad");

  useEffect(() => {
    loadStore();
  }, [slug]);

  const loadStore = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/store/${slug}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Tienda no encontrada");
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err: any) {
      console.error("Error cargando tienda:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleProductVisibility = (id: number) => {
    setProducts(products.map(p =>
      p.id === id ? { ...p, isVisible: !p.isVisible } : p
    ));
  };

  const toggleFeatured = (id: number) => {
    setProducts(products.map(p =>
      p.id === id ? { ...p, isFeatured: !p.isFeatured } : p
    ));
  };

  const moveProduct = (id: number, direction: "up" | "down") => {
    const index = products.findIndex(p => p.id === id);
    if ((direction === "up" && index === 0) || (direction === "down" && index === products.length - 1)) {
      return;
    }

    const newProducts = [...products];
    if (direction === "up") {
      [newProducts[index], newProducts[index - 1]] = [newProducts[index - 1], newProducts[index]];
    } else {
      [newProducts[index], newProducts[index + 1]] = [newProducts[index + 1], newProducts[index]];
    }
    setProducts(newProducts);
  };

  const openEditProduct = (product: StoreProduct) => {
    setEditingProduct({ ...product });
    setShowEditModal(true);
  };

  const saveProduct = async () => {
    if (!editingProduct) return;

    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingProduct),
      });

      if (res.ok) {
        setProducts(products.map(p => p.id === editingProduct.id ? editingProduct : p));
        setShowEditModal(false);
        setEditingProduct(null);
      }
    } catch (err) {
      console.error("Error guardando producto:", err);
    }
  };

  const storeUrl = `${window.location.origin}/tienda/${slug}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Store className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Administrador de Tienda</h1>
                <p className="text-xs text-slate-500">{tenant?.brandName || "Mi Tienda"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(storeUrl, "_blank")}
              >
                Ver tienda pública ↗
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab("products")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "products"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setActiveTab("design")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "design"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Diseño
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "analytics"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Analítica
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Products Tab */}
        {activeTab === "products" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Gestionar Productos</h2>
                <p className="text-slate-600 mt-1">Ordena, destaca y controla la visibilidad de tus productos</p>
              </div>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                onClick={() => setLocation("/products")}
              >
                <Plus className="h-4 w-4" />
                Nuevo Producto
              </Button>
            </div>

            {products.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Plus className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">No hay productos</h3>
                <p className="text-slate-600 mb-6">Crea tu primer producto para comenzar</p>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => setLocation("/products")}
                >
                  Crear Producto
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {products.map((product, index) => (
                  <Card
                    key={product.id}
                    className="p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {/* Product Image Thumbnail */}
                      <div className="h-16 w-16 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Store className="h-6 w-6 text-slate-300" />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">{product.name}</h3>
                        <p className="text-sm text-slate-600 truncate">{product.description}</p>
                        <p className="text-sm font-semibold text-indigo-600">
                          ${Number(product.price).toLocaleString("es-CO")} {product.currency || "COP"}
                        </p>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Visibility Toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleProductVisibility(product.id)}
                          className={product.isVisible === false ? "bg-slate-100" : ""}
                        >
                          {product.isVisible === false ? (
                            <EyeOff className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-indigo-600" />
                          )}
                        </Button>

                        {/* Featured Toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleFeatured(product.id)}
                          className={product.isFeatured ? "bg-yellow-50 border-yellow-200" : ""}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              product.isFeatured ? "fill-yellow-500 text-yellow-500" : "text-slate-400"
                            }`}
                          />
                        </Button>

                        {/* Order Controls */}
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveProduct(product.id, "up")}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moveProduct(product.id, "down")}
                            disabled={index === products.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Edit Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditProduct(product)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Design Tab */}
        {activeTab === "design" && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Personalizar Tienda</h2>
            <div className="grid gap-6 md:grid-cols-2">

              {/* Theme Selection */}
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Tema
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="theme"
                      value="light"
                      checked={storeTheme === "light"}
                      onChange={(e) => setStoreTheme(e.target.value as "light" | "dark")}
                      className="w-4 h-4"
                    />
                    <span className="font-medium">Tema Claro</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="theme"
                      value="dark"
                      checked={storeTheme === "dark"}
                      onChange={(e) => setStoreTheme(e.target.value as "light" | "dark")}
                      className="w-4 h-4"
                    />
                    <span className="font-medium">Tema Oscuro</span>
                  </label>
                </div>
              </Card>

              {/* Color Selection */}
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Color Principal
                </h3>
                <div className="space-y-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full h-10 border rounded-lg cursor-pointer"
                  />
                  <p className="text-sm text-slate-600">Valor actual: {primaryColor}</p>
                </div>
              </Card>

              {/* Store Description */}
              <Card className="p-6 md:col-span-2">
                <h3 className="font-bold text-lg mb-4">Descripción de Tienda</h3>
                <textarea
                  value={storeDescription}
                  onChange={(e) => setStoreDescription(e.target.value)}
                  placeholder="Describe tu tienda en una o dos líneas..."
                  className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  rows={3}
                />
                <p className="text-xs text-slate-500 mt-2">
                  Esta descripción aparecerá en la página principal de tu tienda
                </p>
              </Card>
            </div>

            <div className="mt-6 flex gap-3">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <Save className="h-4 w-4" />
                Guardar Cambios
              </Button>
              <Button variant="outline" onClick={() => setActiveTab("products")}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Analítica de Ventas
            </h2>

            <div className="grid gap-6 md:grid-cols-3 mb-8">
              <Card className="p-6">
                <p className="text-sm text-slate-600 mb-2">Total de Ventas</p>
                <p className="text-3xl font-bold text-slate-900">$0</p>
                <p className="text-xs text-slate-500 mt-2">Este mes</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm text-slate-600 mb-2">Órdenes</p>
                <p className="text-3xl font-bold text-slate-900">0</p>
                <p className="text-xs text-slate-500 mt-2">Completadas</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm text-slate-600 mb-2">Visitantes</p>
                <p className="text-3xl font-bold text-slate-900">0</p>
                <p className="text-xs text-slate-500 mt-2">Este mes</p>
              </Card>
            </div>

            <Card className="p-8 text-center">
              <BarChart3 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Datos no disponibles</h3>
              <p className="text-slate-600">La analítica de ventas estará disponible próximamente</p>
            </Card>
          </div>
        )}
      </main>

      {/* Edit Product Modal */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Editar Producto</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEditModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-slate-900">Nombre</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  className="w-full mt-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-900">Descripción</label>
                <textarea
                  value={editingProduct.description}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description: e.target.value })
                  }
                  className="w-full mt-1 p-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  rows={3}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-900">Precio</label>
                <input
                  type="number"
                  value={editingProduct.price}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      price: parseFloat(e.target.value),
                    })
                  }
                  className="w-full mt-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={saveProduct}
              >
                Guardar
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
