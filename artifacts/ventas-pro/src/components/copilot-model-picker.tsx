import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CopilotModelPicker({ value, onChange, onGuardar, guardando }: {
  value: string; onChange: (modelo: string) => void; onGuardar: () => void; guardando: boolean;
}) {
  const [modelos, setModelos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [consultado, setConsultado] = useState(false);
  const [soloAuto, setSoloAuto] = useState(false);
  const [automaticos, setAutomaticos] = useState<string[]>([]);
  const consultar = async () => {
    setCargando(true); setError(''); setAviso(''); setConsultado(false);
    try {
      const r = await fetch('/api/ai/models/github_copilot_internal', { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudieron consultar los modelos.');
      setModelos(d.modelos || []); setAviso(d.aviso || ''); setConsultado(true);
      setSoloAuto(Boolean(d.soloAuto)); setAutomaticos(d.automaticos || []);
    } catch (e: any) { setModelos([]); setError(e.message || 'No se pudo consultar Copilot.'); }
    finally { setCargando(false); }
  };
  return <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-sky-900 dark:bg-sky-950 dark:text-slate-200">
      <p className="font-semibold">Copilot Free utiliza Auto</p>
      <p>GitHub selecciona el modelo según el plan y la tarea. No es un GPT-4 fijo ni un modelo llamado «free». Aquí Auto se puede elegir cuando el conector lo ofrece.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor="modelo-copilot" className="text-sm font-semibold">Modelo de GitHub Copilot</label>
      <Button type="button" variant="outline" onClick={consultar} disabled={cargando} className="min-h-11">{cargando ? 'Consultando…' : 'Consultar mis modelos'}</Button>
    </div>
    {modelos.length ? <select id="modelo-copilot" value={value} onChange={e => onChange(e.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm">
      <option value="">Selecciona un modelo</option>
      {value && !modelos.includes(value) && <option value={value}>{value} · guardado, no aparece en este catálogo</option>}
      {modelos.map(m => <option key={m} value={m}>{m === 'auto' ? 'Auto · GitHub selecciona el modelo' : m}</option>)}
    </select> : <Input id="modelo-copilot" value={value} readOnly placeholder="Consulta los modelos de tu cuenta" className="min-h-11 min-w-0 font-mono" />}
    {soloAuto && <p role="status" className="text-xs font-medium">{modelos.includes('auto') ? 'Auto está disponible en el conector de Atlas.' : 'Sin selección manual. Auto todavía no está expuesto por el conector de Atlas.'}</p>}
    {automaticos.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">Modelos sin selección manual ({automaticos.length})</summary><p className="break-words leading-relaxed">{automaticos.join(' · ')}</p><p className="mt-2">Se muestran como información del catálogo; no están habilitados para selección manual.</p></details>}
    <p className="text-xs leading-relaxed text-muted-foreground">Conecta tu cuenta arriba y consulta su catálogo. La lista depende de tu plan y políticas; aparecer en ella no garantiza saldo ni respuesta. Prueba el modelo antes de guardar.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
    <Button type="button" onClick={onGuardar} disabled={guardando || !consultado || !modelos.includes(value.trim())} className="min-h-11 w-full sm:w-auto">{guardando ? 'Guardando…' : 'Guardar y usar Copilot'}</Button>
  </div>;
}
