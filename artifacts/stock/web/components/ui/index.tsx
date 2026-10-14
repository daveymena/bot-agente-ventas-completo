import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { X, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";

// ── Botones / inputs ────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "dark" | "danger";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  const v = { primary: "btn-primary", secondary: "btn-secondary", ghost: "btn-ghost", dark: "btn-dark", danger: "btn-danger" }[variant];
  return (
    <button ref={ref} className={cn(v, size === "sm" && "btn-sm", size === "lg" && "btn-lg", className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("input", className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("input min-h-[90px] resize-y", className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cn("input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] pr-9", className)} {...rest}>{children}</select>;
});

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex items-center gap-2.5 text-sm text-ink-soft", disabled && "opacity-50")}>
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600 outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft hover:text-ink", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600" />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ checked, onChange, label, className, name }: { checked: boolean; onChange: () => void; label: ReactNode; className?: string; name?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft hover:text-ink", className)}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-brand-600" />
      <span>{label}</span>
    </label>
  );
}

// ── Badges ──────────────────────────────────────────────────────────────────

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "indigo" | "dark" | "white"; className?: string }) {
  const t = {
    slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700",
    indigo: "bg-brand-100 text-brand-800", dark: "bg-black/70 text-white backdrop-blur", white: "bg-white/90 text-ink backdrop-blur",
  }[tone];
  return <span className={cn("badge", t, className)}>{children}</span>;
}

// ── Diálogo ─────────────────────────────────────────────────────────────────

export function Dialog({ open, onOpenChange, title, description, children, size = "md", hideClose }: { open: boolean; onOpenChange: (v: boolean) => void; title?: ReactNode; description?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" | "xl" | "full"; hideClose?: boolean }) {
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", full: "max-w-[96vw]" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop focus:outline-none max-h-[92vh] overflow-y-auto fade-up", w)} aria-describedby={undefined}>
          {(title || !hideClose) && (
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                {title && <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-ink">{title}</DialogPrimitive.Title>}
                {description && <DialogPrimitive.Description className="mt-1 text-sm text-mute">{description}</DialogPrimitive.Description>}
              </div>
              {!hideClose && <DialogPrimitive.Close className="rounded-md p-1.5 text-mute hover:bg-slate-100 hover:text-ink" aria-label="Cerrar"><X className="h-5 w-5" /></DialogPrimitive.Close>}
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Confirm({ open, onOpenChange, title, body, confirmLabel = "Confirmar", danger, onConfirm, loading }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void>; loading?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="sm">
      {body && <div className="text-sm text-ink-soft">{body}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

export function Tip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[60] rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop fade-up">
          {label}<TooltipPrimitive.Arrow className="fill-ink" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
export const TooltipProvider = TooltipPrimitive.Provider;

// ── Estados ─────────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-600", className)} />; }

export function PageLoader({ label = "Cargando…" }: { label?: string }) {
  return <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-mute"><Spinner className="h-7 w-7" />{label}</div>;
}

export function Empty({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center", className)}>
      {icon && <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-mute">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">No se pudo cargar</p><p className="mt-0.5 text-red-700/80">{msg}</p>{retry && <button onClick={retry} className="mt-2 text-xs font-semibold underline">Reintentar</button>}</div></div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("card p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className, light = true }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[]; className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-line", className)} role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)} className={cn(light ? "tab-light" : "tab", value === it.id && (light ? "tab-light-active" : "tab-active"))}>
          {it.label}{it.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) { if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p); else if (pages[pages.length - 1] !== "…") pages.push("…"); }
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Paginación">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</Button>
      {pages.map((p, i) => p === "…" ? <span key={`e${i}`} className="px-2 text-mute">…</span> : <button key={p} onClick={() => onChange(p)} className={cn("h-8 min-w-8 rounded-md px-2 text-sm font-medium", p === page ? "bg-ink text-white" : "text-ink-soft hover:bg-slate-100")}>{p}</button>)}
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Siguiente</Button>
    </nav>
  );
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export function Toaster() {
  const toasts = useUi((s) => s.toasts); const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {toasts.map((t) => (
        <div key={t.id} className="toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-pop">
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : t.kind === "error" ? <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" /> : <Info className="mt-0.5 h-5 w-5 text-brand-600" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{t.title}</p>{t.description && <p className="mt-0.5 text-xs text-mute">{t.description}</p>}</div>
          <button onClick={() => dismiss(t.id)} className="rounded p-1 text-mute hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

// ── Hooks utilitarios ───────────────────────────────────────────────────────

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const l = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) handler(); };
    document.addEventListener("mousedown", l); document.addEventListener("touchstart", l);
    return () => { document.removeEventListener("mousedown", l); document.removeEventListener("touchstart", l); };
  }, [ref, handler]);
}

export function useInfiniteScroll(onMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) onMore(); }, { rootMargin: "900px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onMore, enabled]);
  return ref;
}
