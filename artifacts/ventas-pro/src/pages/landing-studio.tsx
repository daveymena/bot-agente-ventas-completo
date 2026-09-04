import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  GripVertical,
  LayoutTemplate,
  Monitor,
  MousePointerClick,
  Palette,
  Plus,
  Save,
  Sparkles,
  Smartphone,
  Trash2,
  Wand2,
} from "lucide-react";

type SectionType =
  | "hero"
  | "benefits"
  | "offer"
  | "before-after"
  | "comparison"
  | "authority"
  | "testimonials"
  | "how-it-works"
  | "logistics"
  | "faq"
  | "cta";

type LandingSection = {
  id: string;
  type: SectionType;
  title: string;
  subtitle?: string;
  body?: string;
};

const SECTION_LIBRARY: Array<{ type: SectionType; label: string; description: string }> = [
  { type: "hero", label: "Hero / Hook", description: "Promesa principal + producto + CTA" },
  { type: "benefits", label: "Beneficios", description: "Resultados y ventajas concretas" },
  { type: "offer", label: "Oferta", description: "Precio, bonus, garantía y urgencia" },
  { type: "before-after", label: "Antes / Después", description: "Transformación visual y emocional" },
  { type: "comparison", label: "Comparación", description: "Tu solución frente a alternativas" },
  { type: "authority", label: "Autoridad", description: "Prueba, datos, garantías o respaldo" },
  { type: "testimonials", label: "Testimonios", description: "Prueba social y objeciones" },
  { type: "how-it-works", label: "Cómo funciona", description: "Proceso simple en pasos" },
  { type: "logistics", label: "Logística", description: "Envío, pago, entrega y cobertura" },
  { type: "faq", label: "FAQ", description: "Preguntas frecuentes y objeciones" },
  { type: "cta", label: "CTA final", description: "Cierre y llamada a la acción" },
];

const DEFAULT_SECTIONS: LandingSection[] = [
  { id: "hero", type: "hero", title: "Convierte tu producto en una oferta irresistible", subtitle: "Una landing creada para continuar la promesa de tu anuncio y llevar al visitante a comprar.", body: "Oferta clara · Beneficio principal · CTA" },
  { id: "benefits", type: "benefits", title: "Todo lo que consigues con esta solución", subtitle: "Beneficios escritos desde el resultado que busca tu cliente.", body: "Más claridad, menos fricción y una experiencia diseñada para convertir." },
  { id: "offer", type: "offer", title: "Oferta especial por tiempo limitado", subtitle: "Presenta aquí precio, bonos, garantía y condiciones reales.", body: "CTA: Quiero aprovechar la oferta" },
  { id: "testimonials", type: "testimonials", title: "Personas que ya dieron el paso", subtitle: "Prueba social concreta, creíble y relacionada con el avatar.", body: "“La solución fue mucho más fácil de implementar de lo que esperaba.”" },
  { id: "faq", type: "faq", title: "Preguntas frecuentes", subtitle: "Resuelve objeciones antes de que frenen la compra.", body: "¿Cómo recibo mi pedido? · ¿Qué medios de pago aceptan? · ¿Qué garantía tengo?" },
  { id: "cta", type: "cta", title: "¿Listo para empezar?", subtitle: "Haz clic y lleva al cliente al siguiente paso.", body: "Comprar ahora" },
];

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildExportHtml(name: string, sections: LandingSection[]) {
  const blocks = sections.map((s) => `\n<section class="section section-${s.type}">\n  <div class="container">\n    <span class="eyebrow">${s.type.replace(/-/g, " ")}</span>\n    <h2>${escapeHtml(s.title)}</h2>\n    ${s.subtitle ? `<p class="subtitle">${escapeHtml(s.subtitle)}</p>` : ""}\n    ${s.body ? `<div class="body">${escapeHtml(s.body)}</div>` : ""}\n    ${s.type === "hero" || s.type === "offer" || s.type === "cta" ? `<a class="cta" href="#comprar">${s.type === "cta" ? escapeHtml(s.body || "Comprar ahora") : "Quiero aprovechar la oferta"}</a>` : ""}\n  </div>\n</section>`).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#111827;background:#fff}.section{padding:80px 20px;border-bottom:1px solid #e5e7eb}.container{max-width:1080px;margin:auto;text-align:center}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:#6b7280}h2{font-size:clamp(32px,5vw,64px);line-height:1.05;margin:14px 0}.subtitle{font-size:20px;line-height:1.6;color:#4b5563;max-width:760px;margin:0 auto 22px}.body{font-size:17px;line-height:1.7;color:#374151;max-width:760px;margin:0 auto 28px}.cta{display:inline-block;padding:16px 26px;border-radius:12px;background:#111827;color:white;text-decoration:none;font-weight:700}.section-hero{padding-top:110px;background:linear-gradient(180deg,#f8fafc,#fff)}.section-offer,.section-cta{background:#f8fafc}</style></head><body>${blocks}</body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

export default function LandingStudioPage() {
  const [name, setName] = useState("Mi Landing de Venta");
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [selectedId, setSelectedId] = useState("hero");
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");

  const selected = sections.find((section) => section.id === selectedId) || sections[0];
  const html = useMemo(() => buildExportHtml(name, sections), [name, sections]);

  const updateSelected = (patch: Partial<LandingSection>) => {
    setSections((current) => current.map((section) => section.id === selected.id ? { ...section, ...patch } : section));
  };

  const addSection = (type: SectionType) => {
    const meta = SECTION_LIBRARY.find((item) => item.type === type)!;
    const section: LandingSection = {
      id: `${type}-${Date.now()}`,
      type,
      title: meta.label,
      subtitle: meta.description,
      body: "Edita este contenido para adaptarlo al producto y al mercado.",
    };
    setSections((current) => [...current, section]);
    setSelectedId(section.id);
  };

  const move = (direction: -1 | 1) => {
    const index = sections.findIndex((section) => section.id === selected.id);
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };

  const removeSelected = () => {
    if (sections.length <= 1) return toast.error("La landing necesita al menos una sección.");
    const index = sections.findIndex((section) => section.id === selected.id);
    const next = sections.filter((section) => section.id !== selected.id);
    setSections(next);
    setSelectedId(next[Math.max(0, index - 1)].id);
  };

  const applyInstruction = () => {
    const command = instruction.trim();
    if (!command) return;
    // Primer motor local: permite iterar el contenido sin destruir la estructura.
    // El endpoint IA se conectará en la siguiente fase y conservará este contrato.
    updateSelected({
      subtitle: `${selected.subtitle || ""}${selected.subtitle ? " " : ""}${command}`.trim(),
    });
    setInstruction("");
    toast.success("Cambio aplicado a la sección. El motor IA podrá reemplazar esta edición por una transformación semántica en la siguiente fase.");
  };

  const downloadHtml = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(name) || "landing"}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-5 p-3 sm:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary"><Sparkles className="h-3.5 w-3.5 mr-1" /> Landing AI Studio</Badge>
              <Badge variant="outline">Beta · nativo de VentasPro</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Crea landings que continúan la venta del anuncio</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">Estructura, copy, oferta, prueba social y CTA en un editor visual. Preparado para conectar producto → anuncio ganador → landing → WhatsApp/checkout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success("Borrador guardado en la sesión actual.")}><Save className="h-4 w-4 mr-2" />Guardar</Button>
            <Button variant="outline" onClick={downloadHtml}><Download className="h-4 w-4 mr-2" />Exportar HTML</Button>
            <Button onClick={() => toast.success("Vista previa lista para publicar en la siguiente fase.")}><Eye className="h-4 w-4 mr-2" />Vista previa</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_310px] gap-4 items-start">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><LayoutTemplate className="h-4 w-4" />Estructura</CardTitle><CardDescription>Ordena el recorrido de venta.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {sections.map((section, index) => (
                <button key={section.id} onClick={() => setSelectedId(section.id)} className={`w-full text-left rounded-lg border p-2.5 flex items-center gap-2 transition ${selectedId === section.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
                  <span className="text-sm font-medium truncate">{section.title}</span>
                </button>
              ))}
              <div className="pt-2 border-t mt-3 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Añadir sección</p>
                {SECTION_LIBRARY.map((item) => <Button key={item.type} variant="ghost" size="sm" className="w-full justify-start h-8" onClick={() => addSection(item.type)}><Plus className="h-3.5 w-3.5 mr-2" />{item.label}</Button>)}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div><CardTitle className="text-sm flex items-center gap-2"><MousePointerClick className="h-4 w-4" />Canvas de landing</CardTitle><CardDescription>Haz clic en una sección para editarla.</CardDescription></div>
                <div className="flex gap-1"><Button size="sm" variant={preview === "desktop" ? "default" : "outline"} onClick={() => setPreview("desktop")}><Monitor className="h-4 w-4 mr-1" />Desktop</Button><Button size="sm" variant={preview === "mobile" ? "default" : "outline"} onClick={() => setPreview("mobile")}><Smartphone className="h-4 w-4 mr-1" />Móvil</Button></div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-7 bg-muted/30">
              <div className={`mx-auto bg-white rounded-xl shadow-sm overflow-hidden transition-all ${preview === "mobile" ? "max-w-[390px]" : "max-w-[900px]"}`}>
                {sections.map((section) => (
                  <button key={section.id} onClick={() => setSelectedId(section.id)} className={`block w-full text-left p-8 sm:p-12 border-b last:border-b-0 transition ${selectedId === section.id ? "ring-2 ring-inset ring-primary" : "hover:bg-slate-50"} ${section.type === "hero" ? "bg-slate-50 py-16 sm:py-20" : section.type === "offer" || section.type === "cta" ? "bg-slate-100" : ""}`}>
                    <div className="max-w-2xl mx-auto text-center">
                      <div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground mb-3">{section.type.replace(/-/g, " ")}</div>
                      <h2 className="text-2xl sm:text-4xl font-black leading-tight">{section.title}</h2>
                      {section.subtitle && <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">{section.subtitle}</p>}
                      {section.body && <p className="mt-4 text-sm leading-relaxed">{section.body}</p>}
                      {(section.type === "hero" || section.type === "offer" || section.type === "cta") && <span className="inline-flex mt-6 rounded-lg bg-primary text-primary-foreground px-5 py-3 font-bold text-sm">{section.type === "cta" ? section.body || "Comprar ahora" : "Quiero aprovechar la oferta"}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4 lg:sticky lg:top-20">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wand2 className="h-4 w-4" />Asistente IA</CardTitle><CardDescription>Describe un cambio en lenguaje natural.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ej: haz el titular más agresivo, orientado a madres que quieren ahorrar tiempo" rows={4} />
                <Button className="w-full" onClick={applyInstruction} disabled={!instruction.trim()}><Sparkles className="h-4 w-4 mr-2" />Aplicar cambio</Button>
                <p className="text-[11px] text-muted-foreground">Contrato preparado para conectar el modelo IA sin cambiar el editor.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4" />Sección seleccionada</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} placeholder="Título" />
                <Textarea value={selected.subtitle || ""} onChange={(event) => updateSelected({ subtitle: event.target.value })} placeholder="Subtítulo" rows={3} />
                <Textarea value={selected.body || ""} onChange={(event) => updateSelected({ body: event.target.value })} placeholder="Contenido" rows={4} />
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" onClick={() => move(-1)} title="Subir"><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => move(1)} title="Bajar"><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={removeSelected} title="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Nombre del proyecto</CardTitle></CardHeader>
              <CardContent><Input value={name} onChange={(event) => setName(event.target.value)} /></CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
