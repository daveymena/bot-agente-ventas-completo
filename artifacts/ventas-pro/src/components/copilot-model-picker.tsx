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
  const consultar = async () => {
    setCargando(true); setError(''); setAviso('');
    try {
      const r = await fetch('/api/ai/models/github_copilot_internal', { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudieron consultar los modelos.');
      setModelos(d.modelos || []); setAviso(d.aviso || '');
    } catch (e: any) { setModelos([]); setError(e.message || 'No se pudo consultar Copilot.'); }
    finally { setCargando(false); }
  };
  return <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor="modelo-copilot" className="text-sm font-semibold">Modelo de GitHub Copilot</label>
      <Button type="button" variant="outline" onClick={consultar} disabled={cargando} className="min-h-11">{cargando ? 'Consultando…' : 'Consultar mis modelos'}</Button>
    </div>
    {modelos.length ? <select id="modelo-copilot" value={value} onChange={e => onChange(e.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm">
      <option value="">Selecciona un modelo</option>
      {value && !modelos.includes(value) && <option value={value}>{value} · guardado, no aparece en este catálogo</option>}
      {modelos.map(m => <option key={m} value={m}>{m}</option>)}
    </select> : <Input id="modelo-copilot" value={value} onChange={e => onChange(e.target.value)} placeholder="ID exacto del modelo de tu cuenta" className="min-h-11 min-w-0 font-mono" />}
    <p className="text-xs leading-relaxed text-muted-foreground">Conecta tu cuenta arriba y consulta su catálogo. La lista depende de tu plan y políticas; aparecer en ella no garantiza saldo ni respuesta. Prueba el modelo antes de guardar.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
    <Button type="button" onClick={onGuardar} disabled={guardando || !value.trim()} className="min-h-11 w-full sm:w-auto">{guardando ? 'Guardando…' : 'Guardar configuración'}</Button>
  </div>;
}
