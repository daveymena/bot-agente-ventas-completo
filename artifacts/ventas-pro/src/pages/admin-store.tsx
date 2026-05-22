import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useSession } from "@/App";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Palette, LayoutTemplate, Sparkles, Package, Image as ImageIcon,
  Check, RefreshCw, Save, Upload, Wand2,
} from "lucide-react";
import { toast } from "sonner";

type NicheTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  colors: [string, string];
  categories: string[];
  products: { name: string; description: string; price: number; category: string }[];
};

const niches: NicheTemplate[] = [
  { id: "tecnologia", name: "Tecnología", description: "Gadgets, laptops, accesorios", icon: "💻", colors: ["#2563eb", "#7c3aed"], categories: ["Laptops", "Periféricos", "Audífonos", "Cargadores"], products: [
    { name: "Laptop UltraBook Pro", description: "16GB RAM, 512GB SSD", price: 899.99, category: "Laptops" },
    { name: "Teclado Mecánico RGB", description: "Switches Cherry MX", price: 129.99, category: "Periféricos" },
    { name: "Audífonos Noise Cancelling", description: "30h de batería", price: 249.99, category: "Audífonos" },
  ]},
  { id: "moda", name: "Moda", description: "Ropa, calzado, accesorios", icon: "👗", colors: ["#ec4899", "#f43f5e"], categories: ["Ropa", "Zapatos", "Bolsos", "Joyas"], products: [
    { name: "Vestido Elegante Noche", description: "Diseño moderno y elegante", price: 89.99, category: "Ropa" },
    { name: "Zapatillas Casual Premium", description: "Cómodas y duraderas", price: 119.99, category: "Zapatos" },
    { name: "Bolso Tote de Cuero", description: "Cuero genuino", price: 159.99, category: "Bolsos" },
  ]},
  { id: "cursos", name: "Cursos Digitales", description: "Ebooks, cursos online", icon: "📚", colors: ["#059669", "#0d9488"], categories: ["Cursos", "Ebooks", "Plantillas", "Software"], products: [
    { name: "Curso Marketing Digital", description: "Desde cero hasta experto", price: 49.99, category: "Cursos" },
    { name: "Ebook Crecimiento Personal", description: "Guía completa", price: 19.99, category: "Ebooks" },
    { name: "Pack Plantillas Web", description: "50 plantillas responsive", price: 39.99, category: "Plantillas" },
  ]},
  { id: "comida", name: "Comida & Bebida", description: "Restaurantes, cafetería", icon: "🍕", colors: ["#ea580c", "#dc2626"], categories: ["Pizzas", "Bebidas", "Postres", "Combos"], products: [
    { name: "Pizza Familiar 4 Quesos", description: "Mozzarella, gorgonzola, parmesano, ricotta", price: 24.99, category: "Pizzas" },
    { name: "Hamburguesa Gourmet", description: "Angus, cheddar, bacon", price: 18.99, category: "Combos" },
    { name: "Cheesecake New York", description: "Salsa de frutos rojos", price: 9.99, category: "Postres" },
  ]},
  { id: "servicios", name: "Servicios Profesionales", description: "Consultoría, diseño, dev", icon: "💼", colors: ["#1e293b", "#334155"], categories: ["Consultoría", "Diseño", "Desarrollo", "Marketing"], products: [
    { name: "Consultoría Estratégica 1hr", description: "Sesión personalizada", price: 99.99, category: "Consultoría" },
    { name: "Branding Completo", description: "Logo, colores, manual", price: 499.99, category: "Diseño" },
    { name: "Landing Page Profesional", description: "Diseño responsive", price: 299.99, category: "Desarrollo" },
  ]},
  { id: "salud", name: "Salud & Belleza", description: "Cosméticos, bienestar", icon: "💄", colors: ["#d946ef", "#f472b6"], categories: ["Cuidado Facial", "Maquillaje", "Suplementos", "Bienestar"], products: [
    { name: "Crema Facial Anti-Edad", description: "Ácido hialurónico + Vitamina C", price: 45.99, category: "Cuidado Facial" },
    { name: "Paleta de Sombras Pro", description: "24 colores pigmentados", price: 39.99, category: "Maquillaje" },
    { name: "Multivitamínico Diario", description: "Vitaminas y minerales", price: 29.99, category: "Suplementos" },
  ]},
  { id: "hogar", name: "Hogar & Decoración", description: "Muebles, decoración", icon: "🏠", colors: ["#92400e", "#d97706"], categories: ["Muebles", "Decoración", "Cocina", "Jardín"], products: [
    { name: "Sofá Seccional Moderno", description: "Cojines viscoelásticos", price: 899.99, category: "Muebles" },
    { name: "Set Sartenes Antiadherentes", description: "5 piezas cerámica", price: 79.99, category: "Cocina" },
    { name: "Estantería Modular Nórdica", description: "Sistema ajustable", price: 129.99, category: "Muebles" },
  ]},
  { id: "deportes", name: "Deportes & Fitness", description: "Equipamiento, ropa", icon: "🏋️", colors: ["#16a34a", "#0d9488"], categories: ["Ropa Deportiva", "Equipamiento", "Suplementos", "Nutrición"], products: [
    { name: "Leggings Premium Fitness", description: "Compresión DryFit", price: 59.99, category: "Ropa Deportiva" },
    { name: "Pesas Ajustables 20kg", description: "Discos intercambiables", price: 199.99, category: "Equipamiento" },
    { name: "Proteína Whey 2kg", description: "Sabor chocolate", price: 49.99, category: "Suplementos" },
  ]},
];

function TemplatesTab() {
  const { tenant } = useSession();
  const queryClient = useQueryClient();
  const { data: existingProducts } = useListProducts();
  const [selected, setSelected] = useState<string | null>(null);

  const populateMutation = useMutation({
    mutationFn: async (template: NicheTemplate) => {
      const results = [];
      for (const p of template.products) {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            description: p.description,
            price: String(p.price),
            category: p.category,
            kind: "digital",
            isActive: true,
          }),
        });
        if (!res.ok) throw new Error(`Error creating product: ${p.name}`);
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast.success("Plantilla aplicada correctamente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleApply = (template: NicheTemplate) => {
    if (existingProducts?.length > 0) {
      const confirmed = window.confirm(
        `¿Aplicar plantilla "${template.name}"? Se agregarán ${template.products.length} productos a los existentes.`
      );
      if (!confirmed) return;
    }
    populateMutation.mutate(template);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Plantillas por Nicho</h2>
        <p className="text-sm text-muted-foreground">Elige una plantilla para precargar productos en tu tienda</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {niches.map(t => (
          <Card
            key={t.id}
            className={`cursor-pointer transition-all hover:shadow-md border-2 ${
              selected === t.id ? "border-primary ring-2 ring-primary/20" : "border-border"
            }`}
            onClick={() => { setSelected(t.id); handleApply(t); }}
          >
            <div className="h-2 rounded-t-lg" style={{ background: `linear-gradient(90deg, ${t.colors[0]}, ${t.colors[1]})` }} />
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{t.icon}</span>
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
              </div>
              <div className="flex gap-1.5 mb-3">
                {t.categories.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t.products.length} productos</span>
                {populateMutation.isPending && selected === t.id ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <span className="text-xs font-medium text-primary">Aplicar →</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AIImageTab() {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Error generando imagen");
      const data = await res.json();
      setResult(data.image);
      toast.success("Imagen generada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Generar Imagen IA</h2>
        <p className="text-sm text-muted-foreground">Crea imágenes para tus productos con DALL-E</p>
      </div>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Ej: laptop plateada con luces RGB, fondo minimalista"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className="flex-1"
            />
            <Button onClick={generate} disabled={generating || !prompt.trim()}>
              {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generar
            </Button>
          </div>
          {result && (
            <div className="rounded-xl overflow-hidden border">
              <img src={result} alt="Generated" className="w-full max-w-md mx-auto" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminStorePage() {
  const [tab, setTab] = useState<"templates" | "ai">("templates");

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4 border-b pb-4">
          <button
            onClick={() => setTab("templates")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "templates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <LayoutTemplate className="w-4 h-4" /> Plantillas
          </button>
          <button
            onClick={() => setTab("ai")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Wand2 className="w-4 h-4" /> Imágenes IA
          </button>
        </div>
        {tab === "templates" && <TemplatesTab />}
        {tab === "ai" && <AIImageTab />}
      </div>
    </Layout>
  );
}
