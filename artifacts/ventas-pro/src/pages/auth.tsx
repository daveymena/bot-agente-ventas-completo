import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Rocket, Mail, Lock, Store, User, ArrowRight, ShieldCheck, KeyRound, ArrowLeft, Check, X, CheckCircle, AlertCircle, Loader, Eye, EyeOff } from "lucide-react";
import { useSession } from "@/App";
import { describeError } from "@/lib/utils";

// Tratamiento visual de los campos de esta pantalla. Va acá y no en el
// componente Input porque ese es compartido por TODA la app (h-9, compacto,
// pensado para tablas y paneles densos); agrandarlo allá cambiaría cada
// formulario del sistema. Un login sí quiere campos altos y cómodos: 48px de
// alto, esquinas suaves y un fondo tenue que se aclara al enfocar, con el
// anillo en el color de marca.
const FIELD =
  "h-12 rounded-xl bg-muted/40 border-border/60 pl-11 text-[15px] shadow-none " +
  "transition-all duration-200 " +
  "hover:border-border " +
  "focus-visible:bg-background focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";

// El icono va centrado de verdad (top-1/2 + -translate-y-1/2) en vez de con
// un top fijo: con campos de 48px un `top-3` lo dejaba pegado arriba.
const FIELD_ICON =
  "absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none";

// Logo "G" de Google, con los colores oficiales de la marca. Va en el botón de
// "Continuar con Google" según las directrices de Google (botón blanco, texto
// oscuro, logo G).
function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { refreshSession } = useSession();
  const defaultTab = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "register" ? "register" : "login";

  // ── Login con Google ──────────────────────────────────────────────────────
  // Es un redirect completo al backend (/api/auth/google), que redirige a
  // Google y después vuelve al callback del backend. Acá solo se arranca el
  // flujo; no se maneja ningún token en el frontend.
  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  // Al volver del flujo de Google, el backend redirige a /auth con un query
  // (google=error&reason=... o google=2fa). Se lee UNA vez al montar y se
  // limpia la URL para no re-disparar el aviso en cada re-render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "error") {
      const reason = params.get("reason") || "";
      const mensajes: Record<string, string> = {
        cancelled: "Cancelaste el inicio de sesión con Google.",
        state_mismatch: "No se pudo validar la sesión de Google. Intentá de nuevo.",
        email_not_verified: "Tu cuenta de Google no tiene el email verificado.",
        oauth_failed: "No se pudo completar el inicio de sesión con Google.",
        not_configured: "Google Login no está configurado en el servidor.",
        server_error: "Error del servidor al iniciar sesión con Google.",
      };
      toast.error(mensajes[reason] || "No se pudo iniciar sesión con Google.");
      window.history.replaceState({}, "", "/auth");
    }
    if (params.get("google") === "2fa") {
      setTwoFactorPending(true);
      toast.info("Introduce el código de tu aplicación autenticadora");
      window.history.replaceState({}, "", "/auth");
    }
  }, []);

  // Estados para modal de éxito de registro
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // Estados para validación de email
  const [emailCheckStatus, setEmailCheckStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [emailCheckTimeout, setEmailCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  // Estados para recuperación de contraseña
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<"email" | "code" | "newPassword">("email");
  const [forgotPasswordData, setForgotPasswordData] = useState({
    email: "",
    code: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  // Ver la contraseña que uno escribe: en móvil, escribir a ciegas una clave
  // con mayúscula y número (lo que exige el registro) es la causa más común
  // de "no me deja entrar" cuando en realidad hubo un typo.
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    brandName: "",
    slug: ""
  });


  // Validación de email en tiempo real
  const handleEmailChange = (email: string) => {
    setRegisterData({...registerData, email});
    
    // Limpiar timeout anterior
    if (emailCheckTimeout) clearTimeout(emailCheckTimeout);
    
    if (!email || !email.includes("@")) {
      setEmailCheckStatus("idle");
      return;
    }

    setEmailCheckStatus("checking");
    
    // Esperar 500ms antes de verificar (para no saturar el servidor)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        if (data.available) {
          setEmailCheckStatus("available");
        } else {
          setEmailCheckStatus("taken");
        }
      } catch {
        setEmailCheckStatus("idle");
      }
    }, 500);
    
    setEmailCheckTimeout(timeout);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(loginData)
      });
      
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        // El detalle técnico queda en la consola para diagnóstico, pero al
        // usuario -- que está en la PRIMERA pantalla del producto -- no se le
        // pide "revisar la consola": no sabe qué es eso y da la peor primera
        // impresión posible.
        console.error("Respuesta no-JSON del servidor:", text);
        toast.error("No pudimos conectar con el servidor. Intentá de nuevo en unos segundos.");
        setIsLoading(false);
        return;
      }
      
      if (res.ok) {
        if (data.requiresTwoFactor) {
          setTwoFactorPending(true);
          toast.info("Introduce el código de tu aplicación autenticadora");
          return;
        }
        // Guardar en localStorage como fallback al cookie (funciona detrás de proxies HTTPS como Easypanel)
        if (data.tenant?.id) {
          localStorage.setItem("tenant_id", String(data.tenant.id));
        }
        toast.success("¡Bienvenido de nuevo! 🚀");
        await refreshSession();
        setLocation("/");
      } else {
        toast.error(data.error || data.message || "Credenciales incorrectas");
        console.error("Error del backend:", data);
      }
    } catch (err) {
      console.error("Error de red/conexión:", err);
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: twoFactorCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código 2FA incorrecto");
      toast.success("¡Bienvenido de nuevo! 🚀");
      await refreshSession();
      setLocation("/");
    } catch (err: any) {
      toast.error(describeError(err, "No se pudo verificar el código. Intentá de nuevo."));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-verificar email después del registro
  const autoVerifyEmail = async (email: string) => {
    try {
      const res = await fetch("/api/auth/verify-email-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (res.ok) {
        setVerifyingEmail(false);
        return true;
      }
    } catch {
      // Silenciar errores de auto-verificación
    }
    return false;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones adicionales
    if (registerData.password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    
    if (!/[A-Z]/.test(registerData.password)) {
      toast.error("La contraseña debe contener al menos una mayúscula");
      return;
    }
    
    if (!/[0-9]/.test(registerData.password)) {
      toast.error("La contraseña debe contener al menos un número");
      return;
    }

    // Slug es opcional ahora
    let slugToSend = registerData.slug.trim();
    if (!slugToSend) {
      // Auto-generar slug del nombre de marca o nombre
      slugToSend = (registerData.brandName || registerData.name)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    setIsLoading(true);
    setVerifyingEmail(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...registerData, slug: slugToSend})
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.autoLoggedIn) {
          toast.success("✅ ¡Registro exitoso! Bienvenido.");
          await refreshSession();
          setLocation("/dashboard");
        } else {
          // Fallback: mostrar modal de éxito
          setSuccessEmail(registerData.email);
          setShowSuccessModal(true);
          setRegisterData({ name: "", email: "", password: "", brandName: "", slug: "" });
          autoVerifyEmail(registerData.email);
          setTimeout(() => {
            setShowSuccessModal(false);
            setTimeout(() => {
              const loginTab = document.querySelector('[value="login"]') as HTMLButtonElement;
              if (loginTab) loginTab.click();
            }, 500);
          }, 3000);
        }
      } else {
        toast.error(data.error || "Error en el registro");
      }
    } catch (err) {
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 1: Solicitar código de recuperación
  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotPasswordData.email })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("📧 Código enviado a tu email. Revisa tu bandeja de entrada.");
        // Transición suave
        setTimeout(() => {
          setForgotPasswordStep("code");
        }, 500);
      } else {
        toast.error(data.error || "Error al enviar código");
      }
    } catch (err) {
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Verificar código
  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: forgotPasswordData.email,
          code: forgotPasswordData.code 
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("✅ Código verificado. Ingresa tu nueva contraseña.");
        // Transición suave
        setTimeout(() => {
          setForgotPasswordStep("newPassword");
        }, 500);
      } else {
        toast.error(data.error || "Código inválido o expirado");
      }
    } catch (err) {
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 3: Cambiar contraseña
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (forgotPasswordData.newPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: forgotPasswordData.email,
          code: forgotPasswordData.code,
          newPassword: forgotPasswordData.newPassword
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("🎉 Contraseña cambiada exitosamente. Iniciando sesión...");
        
        // Resetear estados con transición suave
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordStep("email");
          setForgotPasswordData({ email: "", code: "", newPassword: "", confirmPassword: "" });
          
          // Hacer login automático
          try {
            fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                email: forgotPasswordData.email,
                password: forgotPasswordData.newPassword
              })
            }).then(loginRes => {
              if (loginRes.ok) {
                refreshSession().then(() => {
                  setTimeout(() => setLocation("/"), 500);
                });
              }
            });
          } catch {}
        }, 800);
      } else {
        toast.error(data.error || "Error al cambiar contraseña");
      }
    } catch (err) {
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    /* Split-screen: panel de marca a la izquierda, formulario a la derecha --
       el patrón de Stripe/Linear/Vercel. Antes era una sola columna angosta
       centrada con TODO apilado (logo grande + título + subtítulo + tabs +
       tarjeta), así que en portátiles el botón de enviar quedaba bajo el
       pliegue y había que scrollear para iniciar sesión. Ahora la altura se
       reparte en dos columnas y el formulario entra completo en pantalla.
       El panel de marca es lg:flex -- en móvil no existe, para no empujar el
       formulario hacia abajo. */
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── PANEL DE MARCA (solo desktop) ── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-slate-950 text-white p-12 xl:p-16">
        {/* Decorado: resplandores + retícula. Todo en CSS a propósito -- una
            imagen de fondo hay que cargarla, se pixela en pantallas 4K y
            obliga a mantener un asset; esto escala nítido a cualquier tamaño
            y no suma ni un KB de red. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 w-[28rem] h-[28rem] rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute top-1/3 -right-24 w-[22rem] h-[22rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-1/4 w-[24rem] h-[24rem] rounded-full bg-cyan-500/10 blur-3xl" />
          {/* Retícula sutil, se desvanece hacia abajo */}
          <div
            className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-lg shadow-primary/30">
            <Rocket className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">Sofía AI Sales</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl xl:text-5xl font-black leading-[1.1] tracking-tight">
            Vendé por WhatsApp<br />mientras dormís.
          </h2>
          <p className="mt-5 text-base text-slate-300 leading-relaxed">
            Un agente de IA atiende, recomienda y cierra ventas por vos. Tu tienda y tus anuncios, en un solo lugar.
          </p>

          {/* Maqueta del producto: muestra lo que hace en vez de describirlo.
              Es la "imagen" del panel, pero hecha con divs -- así queda
              nítida en cualquier pantalla y se puede retocar el copy sin
              volver a exportar nada. */}
          <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4 shadow-2xl">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-xs font-semibold text-slate-200">Sofía · en línea</span>
            </div>
            <div className="pt-3 space-y-2.5">
              <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-white/10 px-3.5 py-2 text-[13px] text-slate-100">
                Hola, ¿el curso de piano tiene certificado?
              </div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-br from-primary to-fuchsia-500 px-3.5 py-2 text-[13px] text-white shadow-lg shadow-primary/30">
                ¡Sí! Incluye certificado y acceso de por vida. Te dejo el link de pago 👇
              </div>
              <div className="ml-auto max-w-[85%] rounded-xl bg-white/10 border border-white/10 px-3.5 py-2.5">
                <p className="text-[13px] font-semibold text-white leading-tight">Curso de Piano Completo</p>
                <p className="text-[15px] font-black text-emerald-300 mt-0.5">$60.000</p>
              </div>
            </div>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            {[
              { icon: User, text: "Atiende 24/7" },
              { icon: Store, text: "Cobra y entrega solo" },
              { icon: ShieldCheck, text: "Datos cifrados" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <div className="w-7 h-7 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[13px] font-medium text-slate-200">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Sofía AI Sales
        </p>
      </aside>

      {/* ── COLUMNA DEL FORMULARIO ── */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
      <div className="w-full max-w-[430px] animate-enter">
        {/* En desktop el panel de la izquierda ya presenta la marca, así que
            acá el logo va compacto y no roba altura al formulario. En móvil,
            donde ese panel no existe, es la única marca visible. */}
        <div className="flex flex-col items-center lg:items-start mb-8">
          <div className="w-14 h-14 lg:hidden rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-xl shadow-primary/20 mb-4">
            <Rocket className="text-white h-7 w-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sofía AI Sales</h1>
          <p className="text-muted-foreground text-sm mt-1.5">La plataforma de ventas autónoma de élite</p>
        </div>

        {/* Modal de Éxito del Registro */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <Card className="glass-panel border-none shadow-2xl max-w-[400px] animate-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center animate-in scale-in-50 duration-500">
                    <Check className="w-8 h-8 text-green-600 animate-in zoom-in delay-200 duration-700" />
                  </div>
                </div>
                <div>
                  <CardTitle className="text-2xl">¡Cuenta Creada Exitosamente!</CardTitle>
                  <CardDescription className="mt-2">Tu tienda está lista para empezar</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Hemos enviado un email de confirmación a:
                </p>
                <p className="font-medium text-sm break-all">{successEmail}</p>
                {verifyingEmail && (
                  <div className="flex items-center justify-center gap-2 text-xs text-blue-600 mt-3">
                    <Loader className="h-3 w-3 animate-spin" />
                    Verificando email...
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  Serás redirigido a la página de inicio de sesión en unos segundos...
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full transition-all duration-300" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    setTimeout(() => {
                      const loginTab = document.querySelector('[value="login"]') as HTMLButtonElement;
                      if (loginTab) loginTab.click();
                    }, 300);
                  }}
                >
                  Ir a Iniciar Sesión
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Recuperación de Contraseña */}
        {showForgotPassword ? (
          <Card className="border border-border/60 rounded-2xl shadow-xl shadow-black/5 bg-card">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordStep("email");
                    setForgotPasswordData({ email: "", code: "", newPassword: "", confirmPassword: "" });
                  }}
                  className="h-8 w-8 p-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle>Recuperar Contraseña</CardTitle>
              </div>
              <CardDescription>
                {forgotPasswordStep === "email" && "Ingresa tu email para recibir un código"}
                {forgotPasswordStep === "code" && "Ingresa el código de 6 dígitos"}
                {forgotPasswordStep === "newPassword" && "Ingresa tu nueva contraseña"}
              </CardDescription>
            </CardHeader>

            {forgotPasswordStep === "email" && (
              <form onSubmit={handleRequestResetCode}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="tu@email.com"
                        className="pl-10"
                        required
                        value={forgotPasswordData.email}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, email: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" disabled={isLoading}>
                    {isLoading ? "Enviando..." : "Enviar Código"}
                    <Mail className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </form>
            )}

            {forgotPasswordStep === "code" && (
              <form onSubmit={handleVerifyResetCode}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">Código de Verificación</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-code"
                        placeholder="000000"
                        className="pl-10 text-center text-2xl tracking-widest"
                        required
                        maxLength={6}
                        value={forgotPasswordData.code}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, code: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El código expira en 15 minutos
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" disabled={isLoading || forgotPasswordData.code.length !== 6}>
                    {isLoading ? "Verificando..." : "Verificar Código"}
                    <ShieldCheck className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </form>
            )}

            {forgotPasswordStep === "newPassword" && (
              <form onSubmit={handleResetPassword}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nueva Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        className="pl-10"
                        required
                        minLength={8}
                        value={forgotPasswordData.newPassword}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, newPassword: e.target.value })}
                      />
                    </div>
</div>
                        {/* Botón Google en registro */}
                        <div className="mt-4">
                          <button
                            onClick={handleGoogleLogin}
                            className="w-full py-2 px-4 rounded-md border bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            type="button"
                          >
                            <GoogleG className="h-4 w-4 mr-2" />
                            Continuar con Google
                          </button>
                        </div>
                     <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        className="pl-10"
                        required
                        minLength={8}
                        value={forgotPasswordData.confirmPassword}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, confirmPassword: e.target.value })}
                      />
                    </div>
                  </div>
                  {forgotPasswordData.newPassword && forgotPasswordData.confirmPassword && 
                   forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword && (
                    <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button className="w-full" disabled={isLoading}>
                    {isLoading ? "Cambiando..." : "Cambiar Contraseña"}
                    <ShieldCheck className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        ) : (
          /* Login y Registro. defaultTab lee ?tab=register (usado por los
             CTA de la landing) para abrir directo en "Crear Cuenta" en vez
             de forzar un clic extra. */
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-12 p-1 rounded-xl bg-muted/60">
              <TabsTrigger value="login" className="rounded-lg h-full text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register" className="rounded-lg h-full text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Crear Cuenta</TabsTrigger>
            </TabsList>

            {/* Tab: Login */}
            <TabsContent value="login">
              <Card className="border border-border/60 rounded-2xl shadow-xl shadow-black/5 bg-card">
                <CardHeader>
                  <CardTitle>Bienvenido</CardTitle>
                  <CardDescription>Ingresa tus credenciales para acceder a tu panel.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-[13px] font-medium">Email</Label>
                      <div className="relative">
                        <Mail className={FIELD_ICON} />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="tu@email.com"
                          className={FIELD}
                          autoComplete="email"
                          required
                          value={loginData.email}
                          onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password" className="text-[13px] font-medium">Contraseña</Label>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-primary"
                          onClick={() => setShowForgotPassword(true)}
                        >
                          ¿Olvidaste tu contraseña?
                        </Button>
                      </div>
                      <div className="relative">
                        <Lock className={FIELD_ICON} />
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className={`${FIELD} pr-11`}
                          autoComplete="current-password"
                          required
                          value={loginData.password}
                          onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((v) => !v)}
                          aria-label={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showLoginPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    {/* Botón alto y con degradado, y un leve levantarse al pasar
                        el mouse: es la acción principal de la pantalla y antes
                        pesaba visualmente lo mismo que un campo. */}
                    <Button
                      className="w-full h-12 rounded-xl text-[15px] font-semibold bg-gradient-to-r from-primary to-fuchsia-500 hover:from-primary hover:to-fuchsia-600 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <><Loader className="mr-2 h-4 w-4 animate-spin" /> Entrando…</>
                      ) : (
                        <>Acceder al Panel <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></>
                      )}
                    </Button>
                  </CardFooter>
                </form>

                {/* Separador "o" + botón oficial de Google. Sigue las directrices
                    de marca de Google: fondo blanco, borde suave, texto oscuro y
                    el logo G a la izquierda. */}
                <div className="px-6 pb-6">
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                      <span className="w-full border-t border-border/60" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">o</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full h-12 rounded-xl bg-white border border-[#dadce0] text-[#1f1f1f] text-[15px] font-medium flex items-center justify-center gap-3 hover:bg-[#f8f9fa] hover:shadow-sm active:bg-[#f1f3f4] transition-colors"
                  >
                    <GoogleG className="h-5 w-5" />
                    Continuar con Google
                  </button>
                </div>
              </Card>
             </TabsContent>

             {twoFactorPending && (
               <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
                 <Card className="w-full max-w-md rounded-2xl shadow-2xl">
                   <CardHeader>
                     <CardTitle>Verificación en dos pasos</CardTitle>
                     <CardDescription>Abre Google Authenticator, Authy u otra aplicación TOTP e introduce el código de 6 dígitos.</CardDescription>
                   </CardHeader>
                   <form onSubmit={verifyTwoFactor}>
                     <CardContent className="space-y-4">
                       <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="text-center text-2xl tracking-[0.5em]" />
                       <p className="text-xs text-muted-foreground">También puedes usar uno de tus códigos de recuperación de un solo uso.</p>
                     </CardContent>
                     <CardFooter className="gap-2">
                       <Button type="button" variant="outline" onClick={() => { setTwoFactorPending(false); setTwoFactorCode(""); }}>Cancelar</Button>
                       <Button type="submit" className="flex-1" disabled={isLoading || twoFactorCode.length < 6}>{isLoading ? "Verificando..." : "Verificar"}</Button>
                     </CardFooter>
                   </form>
                 </Card>
               </div>
             )}

             {/* Tab: Registro */}
            <TabsContent value="register">
              <Card className="border border-border/60 rounded-2xl shadow-xl shadow-black/5 bg-card">
                <CardHeader>
                  <CardTitle>Crea tu Tienda</CardTitle>
                  <CardDescription>Comienza a vender de forma autónoma con IA hoy mismo.</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name" className="text-[13px] font-medium">Tu Nombre</Label>
                        <div className="relative">
                          <User className={FIELD_ICON} />
                          <Input id="reg-name" placeholder="Juan" className={FIELD} autoComplete="given-name" required
                            value={registerData.name}
                            onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-brand" className="text-[13px] font-medium">Nombre de Marca</Label>
                        <div className="relative">
                          <Store className={FIELD_ICON} />
                          <Input id="reg-brand" placeholder="Mi Tienda" className={FIELD} required
                            value={registerData.brandName}
                            onChange={(e) => setRegisterData({...registerData, brandName: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                       <Label htmlFor="reg-email" className="text-[13px] font-medium">Email</Label>
                       <div className="relative">
                         <Mail className={FIELD_ICON} />
                         <Input id="reg-email" type="email" placeholder="juan@tienda.com" className={`${FIELD} pr-11`} autoComplete="email" required
                           value={registerData.email}
                           onChange={(e) => handleEmailChange(e.target.value)}
                         />
                         {/* Indicadores centrados verticalmente, como el resto:
                             con campos de 48px el `top-3` fijo los descolgaba. */}
                         {registerData.email && emailCheckStatus === "checking" && (
                           <Loader className="absolute right-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-blue-500 animate-spin" />
                         )}
                         {registerData.email && emailCheckStatus === "available" && (
                           <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-emerald-500" />
                         )}
                         {registerData.email && emailCheckStatus === "taken" && (
                           <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-red-500" />
                         )}
                       </div>
                       {emailCheckStatus === "taken" && (
                         <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Este email ya está registrado</p>
                       )}
                     </div>
                    <div className="space-y-2">
                       <Label htmlFor="reg-slug" className="text-[13px] font-medium">Slug (URL personalizada) <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                       {/* Prefijo y campo pegados dentro de un solo marco, en vez
                           de dos cajas separadas con distinta altura y un hueco
                           en el medio. El foco ilumina el grupo entero. */}
                       <div className="flex items-stretch h-12 rounded-xl border border-border/60 bg-muted/40 overflow-hidden transition-all duration-200 focus-within:bg-background focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                         {/* "app.com/" era un placeholder que nunca se
                             reemplazó por el dominio real. */}
                         <span className="px-3.5 flex items-center text-[13px] text-muted-foreground border-r border-border/60 bg-muted/40 shrink-0">{window.location.host}/tienda/</span>
                         <Input id="reg-slug" placeholder="auto-generado"
                           className="h-full flex-1 rounded-none border-0 bg-transparent px-3.5 text-[15px] shadow-none focus-visible:ring-0"
                           value={registerData.slug}
                           onChange={(e) => setRegisterData({...registerData, slug: e.target.value.toLowerCase().replace(/ /g, '-')})}
                         />
                       </div>
                       <p className="text-xs text-muted-foreground">Si no lo indicas, se generará automáticamente</p>
                     </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-pass" className="text-[13px] font-medium">Contraseña</Label>
                      <div className="relative">
                        <Lock className={FIELD_ICON} />
                        <Input id="reg-pass" type={showRegisterPassword ? "text" : "password"} placeholder="••••••••" className={`${FIELD} pr-11`} autoComplete="new-password" required
                          value={registerData.password}
                          onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegisterPassword((v) => !v)}
                          aria-label={showRegisterPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showRegisterPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                        </button>
                      </div>
                      {registerData.password && (
                        <div className="space-y-1 mt-2">
                          <div className={`text-xs flex items-center gap-2 ${registerData.password.length >= 8 ? 'text-green-600' : 'text-red-600'}`}>
                            {registerData.password.length >= 8 ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            Mínimo 8 caracteres
                          </div>
                          <div className={`text-xs flex items-center gap-2 ${/[A-Z]/.test(registerData.password) ? 'text-green-600' : 'text-red-600'}`}>
                            {/[A-Z]/.test(registerData.password) ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            Una mayúscula (A-Z)
                          </div>
                          <div className={`text-xs flex items-center gap-2 ${/[0-9]/.test(registerData.password) ? 'text-green-600' : 'text-red-600'}`}>
                            {/[0-9]/.test(registerData.password) ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            Un número (0-9)
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                   <CardFooter>
                     <Button
                       className="w-full h-12 rounded-xl text-[15px] font-semibold bg-gradient-to-r from-primary to-fuchsia-500 hover:from-primary hover:to-fuchsia-600 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
                       disabled={isLoading || registerData.password.length < 8 || !/[A-Z]/.test(registerData.password) || !/[0-9]/.test(registerData.password) || emailCheckStatus === "taken" || emailCheckStatus === "checking"}
                     >
                       {isLoading ? (
                         <><Loader className="mr-2 h-4 w-4 animate-spin" /> Creando tu tienda…</>
                       ) : (
                         <>Registrar Tienda <ShieldCheck className="ml-2 h-4 w-4" /></>
                       )}
                     </Button>
                   </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <p className="text-center lg:text-left text-xs text-muted-foreground mt-8 lg:px-0 px-8 leading-relaxed">
          Al continuar, aceptas nuestros términos de servicio y políticas de privacidad.
          Tu información viaja cifrada.
        </p>
      </div>
      </div>
    </div>
  );
}
