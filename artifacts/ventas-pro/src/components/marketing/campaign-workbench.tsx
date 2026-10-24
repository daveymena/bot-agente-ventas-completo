import { useState } from 'react';
import { Search, ArrowRight, ArrowLeft, Check, Loader2, Sparkles, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Product = { id: number; name: string; price: number; imageUrl: string | null };
export type CampaignBrief = { product: Product; budget: number; objetivo: 'ventas' | 'mensajes' | 'trafico' | 'reconocimiento' };
const objectives = [
  { id: 'mensajes', title: 'Conversaciones', text: 'Lleva interesados a tu WhatsApp.' },
  { id: 'ventas', title: 'Ventas en tu web', text: 'Dirige al producto en tu tienda o landing.' },
  { id: 'trafico', title: 'Visitas', text: 'Atrae personas a conocer tu oferta.' },
  { id: 'reconocimiento', title: 'Reconocimiento', text: 'Presenta tu marca a una audiencia nueva.' },
] as const;
const money = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export function CampaignWorkbench({ products, busy, result, onGenerate, onDrafts }: {
  products: Product[]; busy: boolean; result: any;
  onGenerate: (brief: CampaignBrief) => Promise<void>; onDrafts: () => void;
}) {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(12);
  const [product, setProduct] = useState<Product | null>(null);
  const [budget, setBudget] = useState(10000);
  const [objetivo, setObjetivo] = useState<CampaignBrief['objetivo']>('mensajes');
  const [generated, setGenerated] = useState(false);
  const visible = products.filter(p => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const validBudget = Number.isFinite(budget) && budget >= 1000 && Number.isInteger(budget);
  const steps = ['Elige tu producto', 'Define el objetivo', 'Revisa y genera'];
  return <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Asistente de campañas">
    <div className="border-b p-5 sm:p-7 flex flex-wrap justify-between items-start gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Estudio de campañas</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">De producto a campaña.</h2><p className="mt-1 text-sm text-muted-foreground">Prepara tu propuesta y revisa el resultado antes de publicarlo.</p></div>
      <span className="rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium">Borrador · sin gasto publicitario</span>
    </div>
    <ol className="grid grid-cols-3 border-b bg-muted/30 p-4 sm:px-7 gap-2">
      {steps.map((title, i) => <li key={title} aria-current={step === i ? 'step' : undefined} className={`flex items-center gap-2 text-xs sm:text-sm ${i === step ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${i <= step ? 'bg-primary text-primary-foreground' : 'border'}`}>{i < step ? <Check size={14} /> : i + 1}</span><span>{title}</span></li>)}
    </ol>
    <div className="p-5 sm:p-7">
      {step === 0 && <>
        <div className="relative mb-5"><Search className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar producto para anunciar" className="pl-10" placeholder="Busca en tu catálogo…" value={search} onChange={e => { setSearch(e.target.value); setLimit(12); }} /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{visible.slice(0, limit).map(p => <button type="button" key={p.id} aria-pressed={product?.id === p.id} onClick={() => { setProduct(p); setGenerated(false); }} className={`group text-left rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:ring-primary ${product?.id === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40'}`}>
          <div className="aspect-square rounded-lg bg-muted overflow-hidden mb-3">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><FileText /></div>}</div>
          <h3 className="text-sm font-semibold line-clamp-2">{p.name}</h3><p className="text-sm text-muted-foreground mt-1">{money(Number(p.price))}</p>
        </button>)}</div>
        {!visible.length && <p role="status" className="py-10 text-center text-muted-foreground">{products.length ? 'No hay productos con ese nombre.' : 'Agrega un producto al catálogo para preparar tu primera campaña.'}</p>}
        {visible.length > limit && <Button variant="outline" className="mt-4" onClick={() => setLimit(n => n + 12)}>Mostrar más productos</Button>}
      </>}
      {step === 1 && <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div><h3 className="font-semibold mb-3">¿Qué quieres conseguir?</h3><div className="grid sm:grid-cols-2 gap-3">{objectives.map(o => <button type="button" key={o.id} aria-pressed={objetivo === o.id} onClick={() => { setObjetivo(o.id); setGenerated(false); }} className={`text-left p-4 rounded-xl border ${objetivo === o.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}><span className="font-semibold text-sm">{o.title}</span><p className="text-xs leading-relaxed text-muted-foreground mt-2">{o.text}</p></button>)}</div></div>
        <div className="rounded-xl bg-muted/40 p-5"><Label htmlFor="campaign-budget">Presupuesto diario propuesto (COP)</Label><Input id="campaign-budget" type="number" min={1000} step={1000} className="mt-3 bg-background" value={budget} onChange={e => { setBudget(Number(e.target.value)); setGenerated(false); }} aria-invalid={!validBudget} />
          {!validBudget && <p role="alert" className="text-sm text-destructive mt-2">Ingresa un valor entero de al menos $1.000 COP.</p>}
          <p className="mt-4 text-sm text-muted-foreground">Referencia para 7 días: <strong className="text-foreground">{validBudget ? money(budget * 7) : '—'}</strong></p><p className="mt-2 text-xs text-muted-foreground">Estimación aritmética; no es un límite total de gasto. Meta validará el mínimo de tu cuenta al publicar.</p>
        </div>
      </div>}
      {step === 2 && product && <div className="grid md:grid-cols-[1fr_1.2fr] gap-6">
        <div className="rounded-xl border p-5"><p className="text-xs text-muted-foreground mb-4">RESUMEN DE TU PROPUESTA</p><h3 className="text-lg font-semibold">{product.name}</h3><dl className="text-sm space-y-3 mt-5"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Objetivo</dt><dd>{objectives.find(o => o.id === objetivo)?.title}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Presupuesto diario</dt><dd>{money(budget)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Publicación</dt><dd>Revisión manual</dd></div></dl></div>
        <div className="rounded-xl bg-muted/30 p-5" aria-live="polite">{busy ? <div className="flex gap-3 items-center py-6"><Loader2 className="animate-spin text-primary" /><p className="text-sm">Preparando investigación, audiencia y textos…</p></div> : generated && result ? <><p className="font-semibold">{result.ok ? 'Tu borrador está listo para revisar' : 'Hay algo que resolver'}</p><p className="text-sm mt-2 text-muted-foreground">{result.resumen}</p>{result.copy?.headline && <h4 className="mt-4 font-semibold">{result.copy.headline}</h4>}{result.copy?.primaryText && <p className="mt-2 text-sm whitespace-pre-wrap break-words">{result.copy.primaryText}</p>}{result.draftId && <Button className="mt-4" onClick={onDrafts}>Editar textos e imágenes <ArrowRight className="ml-2 h-4 w-4" /></Button>}</> : <><Sparkles className="text-primary mb-3" /><h3 className="font-semibold">Una propuesta basada en tu producto</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Se preparan investigación, audiencia y copy usando los datos del catálogo. Después podrás editar las imágenes, el mensaje y la segmentación en Borradores.</p></>}</div>
      </div>}
    </div>
    <div className="flex flex-wrap justify-between gap-3 border-t px-5 py-4 sm:px-7 bg-muted/20">
      <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Atrás</Button>
      {step < 2 ? <Button disabled={!product || (step === 1 && !validBudget)} onClick={() => setStep(s => s + 1)}>Continuar <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={busy || !product || !validBudget || (generated && result?.ok)} onClick={async () => { if (product) { setGenerated(true); await onGenerate({ product, budget, objetivo }); } }}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Generar borrador</Button>}
    </div>
  </section>;
}
