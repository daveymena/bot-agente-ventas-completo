import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo para contraseñas, tokens y claves. Regla del dueño (07-10-2026): un
 * secreto solo se ve con asteriscos, al escribirlo y una vez guardado.
 *
 *  - Siempre `type="password"`, sin autocorrector ni mayúscula automática.
 *  - El botón "mostrar" aparece SOLO mientras hay un valor NUEVO escrito (para
 *    revisar lo que uno mismo pegó). El valor guardado nunca llega al
 *    navegador, así que no hay nada que revelar.
 *  - El valor guardado se indica en el placeholder ("Guardado ••••abcd"), con
 *    el input VACÍO. Dejarlo vacío al guardar = no cambiarlo. Nunca se pone la
 *    máscara dentro del value: si el usuario escribía una letra, se mandaba
 *    "••••••••x" y pisaba la clave real.
 *  - Si alguien pega una máscara ("••••abcd"), se descarta.
 */
export interface SecretInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "defaultValue"> {
  value: string;
  onChange: (valor: string) => void;
  /** Hay un valor guardado en el servidor (true, o los últimos 4 caracteres). */
  guardado?: boolean | string | null;
  /** Mostrar el botón de ver lo que se está escribiendo. Por defecto sí. */
  permitirVer?: boolean;
  /** Clases del contenedor (el input ocupa todo el ancho). */
  wrapperClassName?: string;
}

const MASCARA = /[•●…]|\*{3,}/;

export function placeholderDeSecreto(guardado: SecretInputProps["guardado"], vacio?: string): string {
  if (guardado) {
    // Acepta "abcd" o la máscara que manda el servidor ("••••abcd").
    const resto = typeof guardado === "string" ? guardado.replace(/[•●…*.\s]/g, "") : "";
    const fin = resto.length >= 4 ? ` ••••${resto.slice(-4)}` : "";
    return `Guardado${fin} ✓ — escribí otro para reemplazarlo`;
  }
  return vacio || "Pegá aquí el valor";
}

export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  ({ value, onChange, guardado, permitirVer = true, placeholder, className, wrapperClassName, autoComplete, ...props }, ref) => {
    const [ver, setVer] = React.useState(false);
    const hayNuevo = !!value;
    // Si se vacía el campo (por guardar o borrar), vuelve a quedar oculto.
    React.useEffect(() => {
      if (!hayNuevo) setVer(false);
    }, [hayNuevo]);

    return (
      <div className={cn("relative", wrapperClassName)}>
        <Input
          ref={ref}
          type={ver && hayNuevo ? "text" : "password"}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            // Una máscara pegada no es un secreto: se ignora.
            onChange(MASCARA.test(v) ? v.replace(/[•●…]/g, "").replace(/\*{3,}/g, "") : v);
          }}
          placeholder={placeholderDeSecreto(guardado, placeholder)}
          autoComplete={autoComplete || "new-password"}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore={autoComplete === "current-password" ? undefined : true}
          data-lpignore={autoComplete === "current-password" ? undefined : "true"}
          className={cn("font-mono", permitirVer && hayNuevo && "pr-10", className)}
          {...props}
        />
        {permitirVer && hayNuevo && (
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-label={ver ? "Ocultar lo escrito" : "Mostrar lo escrito"}
            title={ver ? "Ocultar" : "Mostrar lo que escribiste"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  },
);
SecretInput.displayName = "SecretInput";
