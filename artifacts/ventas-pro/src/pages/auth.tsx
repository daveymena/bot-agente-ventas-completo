import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Rocket, Mail, Lock, Store, User, ArrowRight, ShieldCheck, KeyRound, ArrowLeft, Check, X, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { useSession } from "@/App";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { refreshSession } = useSession();
  const defaultTab = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "register" ? "register" : "login";

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
        console.error("Respuesta no-JSON del servidor:", text);
        toast.error("Error del servidor: Revisa la consola");
        setIsLoading(false);
        return;
      }
      
      if (res.ok) {
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
          <Card className="glass-panel border-none shadow-2xl">
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
            <TabsList className="grid w-full grid-cols-2 mb-6 glass-panel p-1">
              <TabsTrigger value="login" className="rounded-lg">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register" className="rounded-lg">Crear Cuenta</TabsTrigger>
            </TabsList>

            {/* Tab: Login */}
            <TabsContent value="login">
              <Card className="glass-panel border-none shadow-2xl">
                <CardHeader>
                  <CardTitle>Bienvenido</CardTitle>
                  <CardDescription>Ingresa tus credenciales para acceder a tu panel.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="login-email" 
                          type="email" 
                          placeholder="tu@email.com" 
                          className="pl-10"
                          required 
                          value={loginData.email}
                          onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Contraseña</Label>
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
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="login-password" 
                          type="password" 
                          className="pl-10"
                          required 
                          value={loginData.password}
                          onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full shadow-lg shadow-primary/20 group" disabled={isLoading}>
                      {isLoading ? "Entrando..." : "Acceder al Panel"}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>

            {/* Tab: Registro */}
            <TabsContent value="register">
              <Card className="glass-panel border-none shadow-2xl">
                <CardHeader>
                  <CardTitle>Crea tu Tienda</CardTitle>
                  <CardDescription>Comienza a vender de forma autónoma con IA hoy mismo.</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Tu Nombre</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input id="reg-name" placeholder="Juan" className="pl-10" required 
                            value={registerData.name}
                            onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-brand">Nombre de Marca</Label>
                        <div className="relative">
                          <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input id="reg-brand" placeholder="Mi Tienda" className="pl-10" required 
                            value={registerData.brandName}
                            onChange={(e) => setRegisterData({...registerData, brandName: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                       <Label htmlFor="reg-email">Email</Label>
                       <div className="relative">
                         <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                         <Input id="reg-email" type="email" placeholder="juan@tienda.com" className="pl-10 pr-10" required 
                           value={registerData.email}
                           onChange={(e) => handleEmailChange(e.target.value)}
                         />
                         {registerData.email && emailCheckStatus === "checking" && (
                           <Loader className="absolute right-3 top-3 h-4 w-4 text-blue-500 animate-spin" />
                         )}
                         {registerData.email && emailCheckStatus === "available" && (
                           <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                         )}
                         {registerData.email && emailCheckStatus === "taken" && (
                           <AlertCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
                         )}
                       </div>
                       {emailCheckStatus === "taken" && (
                         <p className="text-xs text-red-500">Este email ya está registrado</p>
                       )}
                     </div>
                    <div className="space-y-2">
                       <Label htmlFor="reg-slug">Slug (URL personalizada) <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                       <div className="flex items-center gap-1">
                         <div className="bg-muted px-3 h-10 flex items-center rounded-l-md border border-r-0 text-xs text-muted-foreground">app.com/</div>
                         <Input id="reg-slug" placeholder="auto-generado" className="rounded-l-none text-xs" 
                           value={registerData.slug}
                           onChange={(e) => setRegisterData({...registerData, slug: e.target.value.toLowerCase().replace(/ /g, '-')})}
                         />
                       </div>
                       <p className="text-xs text-muted-foreground">Si no lo indicas, se generará automáticamente</p>
                     </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-pass">Contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="reg-pass" type="password" className="pl-10" required 
                          value={registerData.password}
                          onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                        />
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
                       className="w-full shadow-lg shadow-primary/20 group transition-all duration-300" 
                       disabled={isLoading || registerData.password.length < 8 || !/[A-Z]/.test(registerData.password) || !/[0-9]/.test(registerData.password) || emailCheckStatus === "taken" || emailCheckStatus === "checking"}
                     >
                       {isLoading ? "Creando..." : "Registrar Tienda ✨"}
                       <ShieldCheck className="ml-2 h-4 w-4" />
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
