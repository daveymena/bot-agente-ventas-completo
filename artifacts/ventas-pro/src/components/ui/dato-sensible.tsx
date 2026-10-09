import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Datos sensibles que NO son secretos: identificadores de cuentas (ID del
 * Píxel, de la página, de la cuenta publicitaria, del catálogo, App ID, Client
 * ID, chat de Telegram…). Pedido del dueño (09-10-2026): "que se vean solo si
 * le damos ver".
 *
 * Diferencia con SecretInput: un secreto (token, clave) nunca vuelve al
 * navegador; un identificador sí, porque la app lo necesita (enlaces al
 * administrador de anuncios, mostrar a qué página está conectado) y Meta lo
 * publica en el HTML de cada página con píxel. Por eso acá se OCULTA en
 * pantalla —que no quede a la vista en una captura o de quien mira por encima
 * del hombro— y se revela con el ojo, sin cifrarlo.
 */

/** "1278583508663384" → "••••3384". Cortos (≤4) quedan solo como puntos. */
export function enmascararDato(valor: string | number | null | undefined): string {
  const v = String(valor ?? "").trim();
  if (!v) return "";
  return v.length > 4 ? `••••${v.slice(-4)}` : "••••";
}

function BotonVer({ ver, onClick, className }: { ver: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ver ? "Ocultar" : "Ver"}
      title={ver ? "Ocultar" : "Ver"}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

/** Campo editable de un identificador: con puntos hasta que se toca el ojo. */
export const DatoSensibleInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & { wrapperClassName?: string }
>(({ className, wrapperClassName, autoComplete, ...props }, ref) => {
  const [ver, setVer] = React.useState(false);
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        ref={ref}
        // Oculto como contraseña, pero sin que el navegador lo guarde como una.
        type={ver ? "text" : "password"}
        autoComplete={autoComplete || "off"}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn("font-mono pr-10", className)}
        {...props}
      />
      <BotonVer ver={ver} onClick={() => setVer((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2" />
    </div>
  );
});
DatoSensibleInput.displayName = "DatoSensibleInput";

/** Texto con un identificador: "••••3384 👁". */
export function ValorOculto({ valor, className }: { valor: string | number | null | undefined; className?: string }) {
  const [ver, setVer] = React.useState(false);
  const v = String(valor ?? "").trim();
  if (!v) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      <span className="font-mono">{ver ? v : enmascararDato(v)}</span>
      <BotonVer ver={ver} onClick={() => setVer((x) => !x)} className="[&_svg]:h-3.5 [&_svg]:w-3.5" />
    </span>
  );
}
