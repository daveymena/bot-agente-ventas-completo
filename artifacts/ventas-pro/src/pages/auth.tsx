import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Rocket, Mail, Lock, Store, User, ArrowRight, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { useSession } from "@/App";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { refreshSession } = useSession();

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      console.log("🔐 Enviando login request...");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Importante: incluir cookies
        body: JSON.stringify(loginData)
      });
      
      console.log("📊 Response status:", res.status);
      
      const data = await res.json();
      console.log("📊 Response data:", data);
      
      if (res.ok) {
        console.log("✅ Login exitoso. Refrescando sesión...");
        toast.success("¡Bienvenido de nuevo! 🚀");
        
        // Refrescar la sesión para actualizar el contexto
        await refreshSession();
        
        // Redirigir al dashboard
        setLocation("/");
      } else {
        toast.error(data.error || "Credenciales incorrectas");
      }
    } catch (err) {
      console.error("❌ Error en login:", err);
      toast.error("Error conectando con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerData)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("¡Cuenta creada exitosamente! Ahora inicia sesión.");
        // Switch to login tab could be added here
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
        setForgotPasswordStep("code");
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
        toast.success("✅ Código verificado. Ahora ingresa tu nueva contraseña.");
        setForgotPasswordStep("newPassword");
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

    if (forgotPasswordData.newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
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
        
        // Resetear estados del formulario de recuperación
        setShowForgotPassword(false);
        setForgotPasswordStep("email");
        setForgotPasswordData({ email: "", code: "", newPassword: "", confirmPassword: "" });
        
        // Hacer login automático con la nueva contraseña
        try {
          const loginRes = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              email: forgotPasswordData.email,
              password: forgotPasswordData.newPassword
            })
          });
          
          if (loginRes.ok) {
            await refreshSession();
            toast.success("¡Bienvenido de nuevo! 🚀");
            setLocation("/");
          } else {
            toast.info("Contraseña cambiada. Por favor inicia sesión.");
          }
        } catch (loginErr) {
          toast.info("Contraseña cambiada. Por favor inicia sesión.");
        }
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
    <div className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background p-4">
      <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
      
      <div className="w-full max-w-[450px] animate-enter">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/20 mb-4">
            <Rocket className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Sofía AI Sales</h1>
          <p className="text-muted-foreground mt-2">La plataforma de ventas autónoma de élite</p>
        </div>

        {/* Pantalla de Recuperación de Contraseña */}
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
                {forgotPasswordStep === "email" && "Ingresa tu email para recibir un código de recuperación"}
                {forgotPasswordStep === "code" && "Ingresa el código de 6 dígitos que enviamos a tu email"}
                {forgotPasswordStep === "newPassword" && "Ingresa tu nueva contraseña"}
              </CardDescription>
            </CardHeader>

            {/* Paso 1: Solicitar código */}
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
                    {isLoading ? "Enviando..." : "Enviar Código de Recuperación"}
                    <Mail className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </form>
            )}

            {/* Paso 2: Verificar código */}
            {forgotPasswordStep === "code" && (
              <form onSubmit={handleVerifyResetCode}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">Código de Verificación</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-code"
                        type="text"
                        placeholder="123456"
                        className="pl-10 text-center text-2xl tracking-widest font-mono"
                        maxLength={6}
                        required
                        value={forgotPasswordData.code}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, code: e.target.value.replace(/\D/g, '') })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El código expira en 15 minutos
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                  <Button className="w-full" disabled={isLoading}>
                    {isLoading ? "Verificando..." : "Verificar Código"}
                    <ShieldCheck className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForgotPasswordStep("email")}
                    className="text-xs"
                  >
                    ¿No recibiste el código? Reenviar
                  </Button>
                </CardFooter>
              </form>
            )}

            {/* Paso 3: Nueva contraseña */}
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
                        minLength={6}
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
                        minLength={6}
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
          /* Pantallas de Login y Registro */
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 glass-panel p-1">
              <TabsTrigger value="login" className="rounded-lg">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register" className="rounded-lg">Crear Cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="glass-panel border-none shadow-2xl">
                <CardHeader>
                  <CardTitle>Bienvenido</CardTitle>
                  <CardDescription>Ingresa tus credenciales para acceder a tu panel.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
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
                        <Label htmlFor="password">Contraseña</Label>
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
                          id="password" 
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
                        <Input id="reg-email" type="email" placeholder="juan@tienda.com" className="pl-10" required 
                          value={registerData.email}
                          onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-slug">Slug (URL personalizada)</Label>
                      <div className="flex items-center">
                        <div className="bg-muted px-3 h-10 flex items-center rounded-l-md border border-r-0 text-xs text-muted-foreground">app.com/</div>
                        <Input id="reg-slug" placeholder="mi-tienda" className="rounded-l-none" required 
                          value={registerData.slug}
                          onChange={(e) => setRegisterData({...registerData, slug: e.target.value.toLowerCase().replace(/ /g, '-')})}
                        />
                      </div>
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
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full shadow-lg shadow-primary/20 group" disabled={isLoading}>
                      {isLoading ? "Creando..." : "Registrar Tienda ✨"}
                      <ShieldCheck className="ml-2 h-4 w-4" />
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8 px-8 leading-relaxed">
          Al continuar, aceptas nuestros términos de servicio y políticas de privacidad. 
          Tu información está protegida por encriptación de grado militar.
        </p>
      </div>
    </div>
  );
}
