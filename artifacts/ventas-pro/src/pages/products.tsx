import { useState, useMemo, useCallback } from "react";
import { 
  useListProducts, getListProductsQueryKey,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListCategories, getListCategoriesQueryKey,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type ProductKind,
  type Product
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Plus, MoreVertical, Edit, Trash2, Save, Package, Tag, Filter, Check, X, Image as ImageIcon, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Upload } from "lucide-react";

// Smart Import Component using IA
function SmartImportButton({ onComplete }: { onComplete: () => void }) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      try {
        const response = await fetch("/api/products/bulk-smart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64 })
        });
        const result = await response.json();
        if (result.ok) {
          toast.success(result.message);
          onComplete();
        } else {
          toast.error(result.message || "Error en la importación");
        }
      } catch (error) {
        toast.error("Error conectando con el servidor");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative">
      <input
        type="file"
        id="smart-import"
        className="hidden"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        disabled={isUploading}
      />
      <Button
        data-tour="products-import-button"
        variant="outline"
        className="glass-panel border-primary/30 hover:border-primary/50 text-primary"
        onClick={() => document.getElementById('smart-import')?.click()}
        disabled={isUploading}
      >
        <Upload className={`h-4 w-4 mr-2 ${isUploading ? 'animate-bounce' : ''}`} />
        {isUploading ? "Procesando con IA..." : "Importar Excel (IA) ✨"}
      </Button>
    </div>
  );
}


const DEFAULT_CURRENCIES = ["MXN", "USD", "EUR", "COP", "ARS", "CLP"];

function ProductImage({ product, cat }: { product: any, cat: any }) {
  const [imageState, setImageState] = useState<'initial' | 'local' | 'fallback'>('initial');
  const catColor = cat?.color || "hsl(var(--primary))";
  
  if (imageState === 'fallback') {
    return (
      <div 
        className="w-full h-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105"
        style={{ background: `linear-gradient(135deg, ${catColor}33 0%, ${catColor}99 100%)` }}
      >
        <span style={{ fontSize: '3rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}>
          {cat?.icon || (product.kind === 'digital' ? '⚡' : '📦')}
        </span>
      </div>
    );
  }

  const src = imageState === 'initial' && product.imageUrl 
    ? product.imageUrl 
    : `/images/products/${product.id}.jpg`;

  return (
    <img 
      src={src} 
      alt={product.name} 
      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => {
        if (imageState === 'initial' && product.imageUrl) {
          setImageState('local');
        } else {
          setImageState('fallback');
        }
      }}
    />
  );
}

const HELP_GUIDE = getHelpGuide("products")!;

export default function Products() {
  useAutoTour(HELP_GUIDE);
  const queryClient = useQueryClient();
  const [activeCategoryId, setActiveCategoryId] = useState<number | "all">("all");
  const [activeKind, setActiveKind] = useState<ProductKind | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: products, isLoading: isLoadingProducts } = useListProducts({
    query: { queryKey: getListProductsQueryKey() }
  });

  const { data: categories, isLoading: isLoadingCategories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() }
  });

  const deleteProduct = useDeleteProduct();
  const updateProduct = useUpdateProduct();

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = searchQuery.toLowerCase().trim();
    return (Array.isArray(products) ? products : []).filter(p => {
      const matchCategory = activeCategoryId === "all" || p.categoryId === activeCategoryId;
      const matchKind = activeKind === "all" || p.kind === activeKind;
      const matchSearch = !q || p.name.toLowerCase().includes(q);
      return matchCategory && matchKind && matchSearch;
    });
  }, [products, activeCategoryId, activeKind, searchQuery]);

  const handleDelete = (id: number) => {
    if(!confirm("¿Seguro que deseas eliminar este producto?")) return;
    deleteProduct.mutate({ id }, {
      onSuccess: () => {
        toast.success("Producto eliminado");
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: () => toast.error("Error al eliminar producto")
    });
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateProduct.mutate({ id, data: { isActive } }, {
      onSuccess: () => {
        toast.success(`Producto ${isActive ? 'activado' : 'desactivado'}`);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: () => toast.error("Error al actualizar producto")
    });
  };

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  const [templateSelected, setTemplateSelected] = useState<any>(null);

  const handleQuickTemplate = (type: "digital" | "physical" | "subscription") => {
    const templates = {
      digital: { name: "Servicio Digital", kind: "digital" as ProductKind, description: "Asesoría o servicio en línea.", price: "500", features: ["1 hora de consulta", "Material en PDF"] },
      physical: { name: "Producto Físico", kind: "physical" as ProductKind, description: "Producto enviado a domicilio.", price: "1500", features: ["Envío incluido", "Garantía de 30 días"] },
      subscription: { name: "Suscripción Mensual", kind: "subscription" as ProductKind, description: "Acceso mensual a plataforma o servicios.", price: "299", features: ["Acceso 24/7", "Soporte prioritario", "Actualizaciones"] }
    };
    setTemplateSelected(templates[type]);
    setIsNewModalOpen(true);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8 animate-enter">
        <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-end">
          <div>
            <div className="flex items-start gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Catálogo de Productos</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground mt-1">Organiza tus ofertas para que los agentes IA puedan recomendarlas.</p>
          </div>
          {/* flex-wrap: sin esto, en pantallas angostas las 3 acciones no
              entraban en una sola fila y "Nuevo Producto" (la última)
              quedaba empujada fuera del viewport a la derecha, invisible sin
              scrollear horizontal -- mismo bug que ya se había corregido en
              facebook.tsx, acá faltaba aplicarlo. */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" className="glass-panel" onClick={() => setIsCategoryModalOpen(true)}>
              <Tag className="h-4 w-4 mr-2 text-primary" /> Gestionar categorías
            </Button>
            <SmartImportButton onComplete={() => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })} />
            <ProductModal
              mode="create" 
              open={isNewModalOpen} 
              onOpenChange={(o) => {
                if(!o) setTemplateSelected(null);
                setIsNewModalOpen(o);
              }}
              categories={categories || []}
              initialData={templateSelected}
            >
              <Button data-tour="products-new-button" className="shadow-lg shadow-primary/20"><Plus className="h-4 w-4 mr-2"/> Nuevo Producto</Button>
            </ProductModal>
          </div>
        </div>

        {/* Filters */}
        {/* sticky top-0, no top-[72px]: el que hace scroll es <main>, que YA
            empieza debajo del encabezado (layout.tsx). Con 72px la barra
            quedaba flotando en medio de la lista y por encima asomaban las
            tarjetas que pasaban por atrás (captura del dueño, 23-09-2026). */}
        <div className="glass-panel p-2 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 w-full md:w-auto px-2">
            <div className="relative w-full md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="h-9 pl-9 pr-3 rounded-xl text-sm bg-muted/30"
              />
            </div>
          </div>
          <ScrollArea className="w-full md:w-auto max-w-[calc(100vw-3rem)]">
            <div className="flex gap-2 pb-2 md:pb-0 px-2 items-center">
              <Button 
                variant={activeCategoryId === "all" ? "default" : "ghost"} 
                className={`rounded-full h-8 px-4 text-xs font-medium transition-all ${activeCategoryId === 'all' ? 'shadow-md shadow-primary/20' : ''}`}
                onClick={() => setActiveCategoryId("all")}
              >
                Todas <Badge variant="secondary" className="ml-2 bg-background/20 text-current hover:bg-background/20 text-[10px]">{products?.length || 0}</Badge>
              </Button>
              {(Array.isArray(categories) ? categories : []).map(cat => {
                const count = products?.filter(p => p.categoryId === cat.id).length || 0;
                const isActive = activeCategoryId === cat.id;
                return (
                  <Button 
                    key={cat.id}
                    variant={isActive ? "default" : "ghost"} 
                    className={`rounded-full h-8 px-4 text-xs font-medium transition-all gap-1.5 border border-transparent ${isActive ? 'shadow-md' : 'hover:border-border'}`}
                    style={isActive ? { backgroundColor: cat.color, color: '#fff' } : {}}
                    onClick={() => setActiveCategoryId(cat.id)}
                  >
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                    <Badge variant="secondary" className={`ml-1 text-[10px] ${isActive ? 'bg-black/20 text-white hover:bg-black/20' : ''}`}>{count}</Badge>
                  </Button>
                );
              })}
              <CategoryModal mode="create" onCreated={(id) => setActiveCategoryId(id)} defaultKind={activeKind !== "all" ? activeKind : "digital"}>
                <Button variant="ghost" className="rounded-full h-8 px-4 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed hover:border-solid hover:bg-muted/50">
                  <Plus className="h-3 w-3 mr-1"/> Categoría
                </Button>
              </CategoryModal>
            </div>
            <ScrollBar orientation="horizontal" className="hidden md:flex" />
          </ScrollArea>
          
          <div className="flex items-center gap-2 pl-2 md:pl-4 border-t md:border-t-0 md:border-l border-border/50 pt-2 md:pt-0 w-full md:w-auto shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            <ToggleGroup type="single" value={activeKind} onValueChange={(v) => v && setActiveKind(v as any)} size="sm" className="bg-muted/50 p-1 rounded-full">
              {/* data-[state=on]:text-foreground: el fondo del activo se
                  cambiaba a blanco pero el texto seguía con el color claro
                  del estilo base -- "Todos" quedaba blanco sobre blanco. */}
              <ToggleGroupItem value="all" className="rounded-full text-xs h-7 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Todos</ToggleGroupItem>
              <ToggleGroupItem value="digital" className="rounded-full text-xs h-7 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm gap-1">⚡ Digital</ToggleGroupItem>
              <ToggleGroupItem value="physical" className="rounded-full text-xs h-7 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm gap-1">📦 Físico</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Content */}
        {isLoadingProducts ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-80 w-full rounded-2xl" />)}
          </div>
        ) : products?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(var(--primary),0.1)]">
              <span className="text-5xl">🛍️</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight mb-2">Agrega tu primer producto</h3>
            <p className="text-muted-foreground max-w-md mb-8">
              Los productos que agregues aquí podrán ser recomendados y vendidos automáticamente por tus agentes IA en WhatsApp.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 w-full max-w-3xl">
              <Button variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all group" onClick={() => handleQuickTemplate('digital')}>
                <div className="bg-primary/10 p-3 rounded-full group-hover:scale-110 transition-transform"><span className="text-2xl">⚡</span></div>
                <div className="space-y-1"><span className="block font-semibold">Servicio Digital</span><span className="text-xs text-muted-foreground block">Consultorías, cursos, etc.</span></div>
              </Button>
              <Button variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 hover:border-accent/50 hover:bg-accent/5 transition-all group" onClick={() => handleQuickTemplate('physical')}>
                <div className="bg-accent/10 p-3 rounded-full group-hover:scale-110 transition-transform"><span className="text-2xl">📦</span></div>
                <div className="space-y-1"><span className="block font-semibold">Producto Físico</span><span className="text-xs text-muted-foreground block">Artículos con envío.</span></div>
              </Button>
              <Button variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 hover:border-coral/50 hover:bg-coral/5 transition-all group" onClick={() => handleQuickTemplate('subscription')}>
                <div className="bg-coral/10 p-3 rounded-full group-hover:scale-110 transition-transform"><span className="text-2xl">🔄</span></div>
                <div className="space-y-1"><span className="block font-semibold">Suscripción</span><span className="text-xs text-muted-foreground block">Cobros recurrentes.</span></div>
              </Button>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
           <div className="text-center py-20 text-muted-foreground border rounded-2xl border-dashed glass-panel">
            <Filter className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground mb-1">Sin resultados</h3>
            <p className="mb-4">No hay productos que coincidan con los filtros actuales.</p>
            <Button variant="outline" onClick={() => { setActiveCategoryId("all"); setActiveKind("all"); }}>Limpiar filtros</Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map(product => {
              const cat = categories?.find(c => c.id === product.categoryId);
              const catColor = cat?.color || "hsl(var(--primary))";
              
              return (
                <Card key={product.id} className={`group flex flex-col overflow-hidden transition-shadow hover:shadow-md ${!product.isActive ? 'opacity-60' : ''}`}>
                  {/* Image Header */}
                  <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    <ProductImage product={product} cat={cat} />
                    
                    {/* Badges Overlay */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                      {cat ? (
                        <Badge className="bg-white/90 backdrop-blur-md text-black border-none hover:bg-white shadow-sm gap-1 text-[10px] py-0 h-5">
                          {cat.icon && <span>{cat.icon}</span>} {cat.name}
                        </Badge>
                      ) : <div/>}
                      <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30 backdrop-blur-md shadow-sm border-none text-[10px] py-0 h-5">
                        {product.kind === 'digital' ? '⚡ Digital' : '📦 Físico'}
                      </Badge>
                    </div>
                    
                    {/* Menu Overlay */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity hidden">
                      {/* Using absolute positioning inside CardHeader instead so menu is accessible */}
                    </div>
                  </div>

                  <CardHeader className="p-4 pb-2 relative">
                    <div className="absolute right-2 top-2 z-10 flex gap-1">
                      <ProductModal mode="edit" product={product} categories={categories || []}>
                        <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur-sm shadow-sm border border-border hover:bg-background">
                          <Edit className="h-4 w-4 text-primary"/>
                        </Button>
                      </ProductModal>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur-sm shadow-sm border border-border hover:bg-background"><MoreVertical className="h-4 w-4"/></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleDelete(product.id)}>
                            <Trash2 className="h-4 w-4 mr-2"/> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    {product.highlight && (
                      <p className="text-[11px] font-bold mb-1 uppercase tracking-wider" style={{ color: catColor }}>{product.highlight}</p>
                    )}
                    <CardTitle className="text-base font-bold line-clamp-2 pr-20 leading-snug text-foreground min-h-[2.5rem]" title={product.name}>{product.name}</CardTitle>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black tracking-tighter text-foreground">${Number(product.price).toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">{product.currency}</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4 pt-0 flex-1 flex flex-col gap-4">
                    <p className="text-muted-foreground/80 line-clamp-2 text-sm leading-relaxed min-h-[2.5rem]">
                      {product.description || "Sin descripción disponible para este producto."}
                    </p>
                    
                    {product.features && product.features.length > 0 && (
                      <div className="space-y-1.5 mt-auto">
                        {product.features.slice(0, 3).map((feature, i) => (
                          <div key={i} className="flex items-start gap-2 text-[13px] text-foreground/70 group-hover:text-foreground transition-colors">
                            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{feature}</span>
                          </div>
                        ))}
                        {product.features.length > 3 && (
                          <div className="text-[10px] text-muted-foreground font-semibold pl-6 pt-0.5 italic">
                            +{product.features.length - 3} características más
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                  
                  <CardFooter className="p-4 pt-3 border-t bg-muted/5 flex justify-between items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-mono uppercase opacity-50">ID: {product.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${product.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {product.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                      <Switch
                        data-tour="products-active-toggle"
                        id={`active-${product.id}`}
                        checked={product.isActive}
                        onCheckedChange={(checked) => handleToggleActive(product.id, checked)}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Categories Manager Modal */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Gestionar Categorías</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-4">
              {isLoadingCategories ? (
                <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : categories?.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">No hay categorías definidas.</div>
              ) : (
                (Array.isArray(categories) ? categories : []).map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 border rounded-xl bg-card shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-inner" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                        <span className="text-lg">{cat.icon || '🏷️'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold leading-none">{cat.name}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                            {cat.kind === "physical" ? "📦 Físico" : "⚡ Digital"}
                          </Badge>
                        </div>
                        {cat.description && <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <CategoryModal mode="edit" category={cat}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4 text-muted-foreground"/></Button>
                      </CategoryModal>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function CategoryModal({ mode, category, children, onCreated, defaultKind }: { mode: 'create'|'edit', category?: any, children?: React.ReactNode, onCreated?: (id: number) => void, defaultKind?: ProductKind }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();

  const [formData, setFormData] = useState({
    name: category?.name || "",
    description: category?.description || "",
    icon: category?.icon || "",
    color: category?.color || "#0ea5e9",
    kind: (category?.kind || defaultKind || "digital") as ProductKind,
  });

  const handleSubmit = () => {
    if(!formData.name || !formData.color) { toast.error("Nombre y color requeridos"); return; }
    
    if (mode === 'create') {
      createCat.mutate({ data: formData }, {
        onSuccess: (res) => {
          toast.success("Categoría creada");
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setOpen(false);
          onCreated?.(res.id);
        }
      });
    } else {
      updateCat.mutate({ id: category.id, data: formData }, {
        onSuccess: () => {
          toast.success("Categoría actualizada");
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setOpen(false);
        }
      });
    }
  };

  const handleDelete = () => {
    if(!confirm("¿Eliminar categoría? Los productos asociados quedarán sin categoría.")) return;
    deleteCat.mutate({ id: category.id }, {
      onSuccess: () => {
        toast.success("Categoría eliminada");
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setOpen(false);
      }
    });
  };

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#d946ef", "#64748b", "#334155"];

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if(o && mode === 'create') setFormData({ name: "", description: "", icon: "", color: "#0ea5e9", kind: defaultKind || "digital" });
      if(o && mode === 'edit') setFormData({ name: category.name, description: category.description||"", icon: category.icon||"", color: category.color, kind: category.kind || "digital" });
      setOpen(o);
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nueva Categoría' : 'Editar Categoría'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Servicios" />
            </div>
            <div className="space-y-2">
              <Label>Emoji</Label>
              <Input value={formData.icon} onChange={e => setFormData({...formData, icon: e.target.value})} placeholder="🌟" className="text-center text-xl" maxLength={2} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Opcional" />
          </div>
          <div className="space-y-2">
            <Label>Color de acento *</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button 
                  key={c} 
                  className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === c ? 'border-foreground scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setFormData({...formData, color: c})}
                />
              ))}
              <div className="relative overflow-hidden w-8 h-8 rounded-full border border-input cursor-pointer">
                <input type="color" className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tipo de productos *</Label>
            <ToggleGroup type="single" value={formData.kind} onValueChange={(v) => v && setFormData({...formData, kind: v as ProductKind})} className="justify-start">
              <ToggleGroupItem value="digital" className="w-full flex-1 border data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30">⚡ Digital</ToggleGroupItem>
              <ToggleGroupItem value="physical" className="w-full flex-1 border data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30">📦 Físico</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">Solo va a aparecer para productos de ese tipo.</p>
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between items-center">
          {mode === 'edit' ? (
             <Button type="button" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>Eliminar</Button>
          ) : <div/>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductModal({ mode, product, categories, initialData, children, open: controlledOpen, onOpenChange }: { 
  mode: 'create'|'edit', 
  product?: Product, 
  categories: any[],
  initialData?: any,
  children?: React.ReactNode,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [formData, setFormData] = useState({
    name: "", description: "", price: "0", currency: "MXN", sku: "", categoryId: "none", 
    kind: "digital" as ProductKind, imageUrl: "", highlight: "", isActive: true, features: [] as string[],
    paymentLink: "", deliveryLink: ""
  });

  const [featureInput, setFeatureInput] = useState("");
  const [aiImagePrompt, setAiImagePrompt] = useState("");

  // ── Galería y videos (pedido del dueño 13-09-2026) ─────────────────────
  // Varias fotos por producto (subidas o por URL) en metadata.imagenes; el
  // video principal (el que manda el vendedor) en metadata.videoIntro y los
  // demás en metadata.videos. Se guardan junto con el producto (metadata).
  const [galeria, setGaleria] = useState<string[]>([]);
  const [urlNueva, setUrlNueva] = useState("");
  const [videoPrincipal, setVideoPrincipal] = useState("");
  const [videos, setVideos] = useState<string[]>([]);
  const [videoNuevo, setVideoNuevo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const leerMeta = (p: any): any => { const m = p?.metadata; if (!m) return {}; if (typeof m === "string") { try { return JSON.parse(m) || {}; } catch { return {}; } } return m; };

  const subirArchivos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setSubiendo(true);
    try {
      for (const f of Array.from(files).slice(0, 8)) {
        if (!/^image\//.test(f.type)) { toast.error(`${f.name} no es una imagen`); continue; }
        if (f.size > 6 * 1024 * 1024) { toast.error(`${f.name} pesa más de 6 MB`); continue; }
        const dataUrl: string = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
        if (mode === "edit" && product) {
          const res = await fetch(`/api/products/${product.id}/galeria`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: dataUrl }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const d = await res.json();
          setGaleria(g => g.includes(d.url) ? g : [...g, d.url]);
          if (!formData.imageUrl && d.imageUrl) setFormData(prev => ({ ...prev, imageUrl: d.imageUrl }));
        } else {
          // Producto nuevo: la foto viaja como data URL y se guarda con el producto.
          setGaleria(g => [...g, dataUrl]);
        }
      }
      toast.success("Fotos agregadas");
    } catch (e: any) {
      toast.error(`No se pudo subir: ${e.message}`);
    } finally { setSubiendo(false); }
  };
  const agregarUrl = () => {
    const u = urlNueva.trim();
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) { toast.error("Pegá una URL de imagen"); return; }
    setGaleria(g => g.includes(u) ? g : [...g, u]);
    setUrlNueva("");
  };
  const quitarFoto = async (u: string) => {
    setGaleria(g => g.filter(x => x !== u));
    if (mode === "edit" && product && !u.startsWith("data:")) {
      try { await fetch(`/api/products/${product.id}/galeria?url=${encodeURIComponent(u)}`, { method: "DELETE", credentials: "include" }); } catch { /* se quita igual al guardar */ }
    }
  };
  const hacerPrincipal = (u: string) => {
    setGaleria(g => { const sin = g.filter(x => x !== u); return formData.imageUrl && !sin.includes(formData.imageUrl) ? [formData.imageUrl, ...sin] : sin; });
    setFormData(prev => ({ ...prev, imageUrl: u }));
  };
  const agregarVideo = () => {
    const u = videoNuevo.trim();
    if (!/^https?:\/\//i.test(u)) { toast.error("Pegá la URL del video (YouTube, Drive, Terabox, .mp4)"); return; }
    if (!videoPrincipal) setVideoPrincipal(u); else setVideos(v => v.includes(u) ? v : [...v, u]);
    setVideoNuevo("");
  };
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Si el admin no escribe nada, se arma el prompt con el nombre y la
  // descripción del producto -- antes el botón quedaba deshabilitado hasta
  // que escribiera una descripción de la imagen en texto libre, algo que un
  // dueño de negocio no tiene por qué saber hacer.
  const handleGenerateImage = useCallback(async () => {
    const nombre = (formData.name || "").trim();
    const escrito = aiImagePrompt.trim();
    if (!escrito && !nombre) {
      toast.error("Escribí primero el nombre del producto");
      return;
    }
    const prompt = escrito || [
      `Foto profesional de producto para "${nombre}".`,
      (formData.description || "").trim().slice(0, 200),
      "Estilo fotografía realista de marketing, sin texto ni logos encima, apta para publicar en redes.",
    ].filter(Boolean).join(" ");

    setIsGeneratingImage(true);
    try {
      const res = await fetch("/api/public/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Error al generar imagen");
      const data = await res.json();
      setFormData(prev => ({ ...prev, imageUrl: data.image }));
      setAiImagePrompt("");
      toast.success("Imagen generada correctamente");
    } catch (err) {
      toast.error("No se pudo generar la imagen. Probá de nuevo en unos segundos.");
    } finally {
      setIsGeneratingImage(false);
    }
  }, [aiImagePrompt, formData.name, formData.description]);

  // Sync state on open
  useMemo(() => {
    if (!isOpen) return;
    if (mode === 'edit' && product) {
      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price ? product.price.toString() : "0",
        currency: product.currency || "MXN",
        sku: product.sku || "",
        categoryId: product.categoryId ? product.categoryId.toString() : "none",
        kind: product.kind || "digital",
        imageUrl: product.imageUrl || "",
        highlight: product.highlight || "",
        isActive: product.isActive !== undefined ? product.isActive : true,
        features: Array.isArray(product.features) ? product.features : [],
        paymentLink: (product as any).paymentLink || "",
        deliveryLink: (product as any).deliveryLink || ""
      });
      const m = leerMeta(product);
      const propias: string[] = Array.isArray(m.imagenes) ? m.imagenes.map(String) : [];
      const deWoo: string[] = Array.isArray(m?.woocommerce?.imageUrls) ? m.woocommerce.imageUrls.map(String) : [];
      setGaleria([...new Set([...propias, ...deWoo])].filter(u => u && u !== product.imageUrl));
      setVideoPrincipal(String(m.videoIntro || m.videoUrl || ""));
      setVideos(Array.isArray(m.videos) ? m.videos.map(String) : []);
    } else if (mode === 'create') {
      setGaleria([]); setVideoPrincipal(""); setVideos([]);
      setFormData({
        name: initialData?.name || "",
        description: initialData?.description || "",
        price: initialData?.price || "0",
        currency: "MXN",
        sku: "",
        categoryId: "none",
        kind: initialData?.kind || "digital",
        imageUrl: "",
        highlight: "",
        isActive: true,
        features: initialData?.features || [],
        paymentLink: "",
        deliveryLink: ""
      });
    }
  }, [isOpen, mode, product, initialData]);

  const handleSubmit = () => {
    if(!formData.name || !formData.description) {
      toast.error("Nombre y descripción son requeridos");
      return;
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price) || 0,
      currency: formData.currency,
      sku: formData.sku || null,
      categoryId: formData.categoryId === "none" ? null : parseInt(formData.categoryId),
      kind: formData.kind,
      imageUrl: formData.imageUrl || null,
      highlight: formData.highlight || null,
      features: formData.features,
      isActive: formData.isActive,
      paymentLink: formData.paymentLink || null,
      deliveryLink: formData.deliveryLink || null,
      // Galería y videos, sobre la metadata que ya tenía (Dropi, Terabox, etc.).
      metadata: (() => {
        const m = mode === "edit" && product ? leerMeta(product) : {};
        const out: any = { ...m, imagenes: galeria.filter(u => u && u !== formData.imageUrl), videos };
        if (videoPrincipal) out.videoIntro = videoPrincipal; else delete out.videoIntro;
        return JSON.stringify(out);
      })(),
    };

    if (mode === 'create') {
      createProduct.mutate({ data: payload }, {
        onSuccess: () => {
          toast.success("Producto creado");
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setIsOpen(false);
        },
        onError: () => toast.error("Error al crear producto")
      });
    } else {
      updateProduct.mutate({ id: product!.id, data: payload }, {
        onSuccess: () => {
          toast.success("Producto actualizado");
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setIsOpen(false);
        },
        onError: () => toast.error("Error al actualizar producto")
      });
    }
  };

  const addFeature = () => {
    const v = featureInput.trim();
    if (v && !formData.features.includes(v)) {
      setFormData(prev => ({ ...prev, features: [...prev.features, v] }));
    }
    setFeatureInput("");
  };

  const removeFeature = (index: number) => {
    setFormData(prev => ({ ...prev, features: prev.features.filter((_, i) => i !== index) }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-xl">{mode === 'create' ? 'Nuevo Producto' : 'Editar Producto'}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-6">
            {/* Header info */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre del producto *</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Consultoría Premium" className="font-medium" />
              </div>
              <div className="space-y-2">
                <Label>Tagline / Destacado</Label>
                <Input value={formData.highlight} onChange={e => setFormData({...formData, highlight: e.target.value})} placeholder="Ej. ¡Más vendido!" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Textarea 
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Descripción detallada para los clientes y contexto para la IA..."
                className="h-24 resize-none"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="space-y-2">
                <Label>Precio *</Label>
                <Input type="number" min="0" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="tabular-nums-all font-bold" />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={formData.currency} onValueChange={v => setFormData({...formData, currency: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SKU / Código</Label>
                <Input value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="Opcional" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={formData.categoryId} onValueChange={v => setFormData({...formData, categoryId: v})}>
                  <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {/* Solo categorías del mismo Tipo (Digital/Físico) que este producto -- si no filtramos acá, nada impide guardar un producto físico con una categoría pensada para lo digital (o al revés). */}
                    {(Array.isArray(categories) ? categories : []).filter(c => (c.kind || "digital") === formData.kind).map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }}/>
                          {c.icon} {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de producto</Label>
                <ToggleGroup
                  type="single"
                  value={formData.kind}
                  onValueChange={(v) => {
                    if (!v) return;
                    // Si la categoría elegida no existe para el nuevo Tipo, se
                    // limpia -- sin esto quedaba guardado un categoryId de
                    // Digital en un producto que se acaba de pasar a Físico.
                    const stillValid = formData.categoryId === "none" ||
                      (Array.isArray(categories) ? categories : []).some(c => c.id.toString() === formData.categoryId && (c.kind || "digital") === v);
                    setFormData({ ...formData, kind: v as any, categoryId: stillValid ? formData.categoryId : "none" });
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="digital" className="w-full flex-1 border data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30">⚡ Digital</ToggleGroupItem>
                  <ToggleGroupItem value="physical" className="w-full flex-1 border data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30">📦 Físico</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            {/* Features array */}
            <div className="space-y-3">
              <Label>Características / Beneficios</Label>
              <div className="flex gap-2">
                <Input 
                  value={featureInput} 
                  onChange={e => setFeatureInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                  placeholder="Ej. Soporte 24/7 (Presiona Enter para agregar)" 
                />
                <Button type="button" variant="secondary" onClick={addFeature}>Añadir</Button>
              </div>
              {formData.features.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 bg-muted/20 p-3 rounded-lg border">
                  {formData.features.map((feat, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-background p-2 rounded-md border shadow-sm">
                      <span className="flex items-center gap-2"><Check className="h-3 w-3 text-primary"/> {feat}</span>
                      <button onClick={() => removeFeature(i)} className="text-muted-foreground hover:text-destructive p-1 rounded-full hover:bg-destructive/10 transition-colors"><X className="h-3 w-3"/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Imagen del producto</Label>
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-muted border flex items-center justify-center">
                  {formData.imageUrl ? (
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={() => toast.error("La URL de la imagen no es válida")} />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground opacity-50" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="https://ejemplo.com/imagen.jpg" />
                  <div className="flex gap-2 items-center">
                    <Input value={aiImagePrompt} onChange={e => setAiImagePrompt(e.target.value)} placeholder="Opcional: describí la imagen que querés" className="text-xs" />
                    <Button type="button" variant="secondary" size="sm" onClick={handleGenerateImage} disabled={isGeneratingImage || (!aiImagePrompt.trim() && !formData.name.trim())} title="Si lo dejás vacío, se genera a partir del nombre y la descripción del producto">
                      <Sparkles className="h-3 w-3 mr-1" /> {isGeneratingImage ? "..." : "Generar"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Más fotos ─────────────────────────────────────────── */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Más fotos ({galeria.length})</Label>
                  <label className="text-xs cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
                    <Plus className="h-3 w-3" /> {subiendo ? "Subiendo…" : "Subir fotos"}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={subiendo} onChange={e => { void subirArchivos(e.target.files); e.currentTarget.value = ""; }} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Input value={urlNueva} onChange={e => setUrlNueva(e.target.value)} placeholder="o pegá la URL de una foto" className="text-xs" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarUrl(); } }} />
                  <Button type="button" variant="secondary" size="sm" onClick={agregarUrl}>Agregar</Button>
                </div>
                {galeria.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {galeria.map(u => (
                      <div key={u} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                        <img src={u} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" className="text-[10px] text-white underline" onClick={() => hacerPrincipal(u)} title="Usar como foto principal">Principal</button>
                          <button type="button" className="text-[10px] text-red-200" onClick={() => void quitarFoto(u)} title="Quitar"><X className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">La principal va en la ficha del vendedor; todas se usan en la landing, la tienda y los anuncios.</p>
              </div>

              {/* ── Videos ────────────────────────────────────────────── */}
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Videos (URL de YouTube, Drive, Terabox o .mp4)</Label>
                <div className="flex gap-2">
                  <Input value={videoNuevo} onChange={e => setVideoNuevo(e.target.value)} placeholder="https://…" className="text-xs" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarVideo(); } }} />
                  <Button type="button" variant="secondary" size="sm" onClick={agregarVideo}>Agregar</Button>
                </div>
                {videoPrincipal && (
                  <div className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                    <span className="truncate"><span className="font-semibold">Principal</span> (lo manda el vendedor): {videoPrincipal}</span>
                    <button type="button" className="text-red-500 ml-2" onClick={() => { const [sig, ...resto] = videos; setVideoPrincipal(sig || ""); setVideos(resto); }} title="Quitar"><X className="h-3 w-3" /></button>
                  </div>
                )}
                {videos.map(u => (
                  <div key={u} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                    <span className="truncate">{u}</span>
                    <div className="flex gap-2 ml-2">
                      <button type="button" className="underline" onClick={() => { setVideos(v => [videoPrincipal, ...v.filter(x => x !== u)].filter(Boolean)); setVideoPrincipal(u); }}>Principal</button>
                      <button type="button" className="text-red-500" onClick={() => setVideos(v => v.filter(x => x !== u))}><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link de Pago Dinámico</Label>
                <Input value={formData.paymentLink} onChange={e => setFormData({...formData, paymentLink: e.target.value})} placeholder="https://checkout.wompi.co/..." />
                <p className="text-[10px] text-muted-foreground">URL que el agente enviará para cobrar este producto.</p>
              </div>
              <div className="space-y-2">
                <Label>Link de Entrega (Drive / Mega)</Label>
                <Input value={formData.deliveryLink} onChange={e => setFormData({...formData, deliveryLink: e.target.value})} placeholder="https://drive.google.com/..." />
                <p className="text-[10px] text-muted-foreground">URL que se enviará automáticamente cuando se confirme el pago.</p>
              </div>
            </div>

          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-muted/10 flex-row justify-between sm:justify-between items-center gap-4">
          <div className="flex items-center space-x-2 bg-background px-3 py-1.5 rounded-lg border shadow-sm">
            <Switch id="is-active" checked={formData.isActive} onCheckedChange={c => setFormData({...formData, isActive: c})} />
            <Label htmlFor="is-active" className="cursor-pointer font-medium text-sm">Producto Activo</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createProduct.isPending || updateProduct.isPending} className="min-w-[100px]">
              <Save className="h-4 w-4 mr-2" /> Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}