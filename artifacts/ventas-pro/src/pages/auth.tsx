import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Rocket, Mail, Lock, Store, User, ArrowRight, ShieldCheck } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

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
      console.log("📊 Response headers:", res.headers);
      
      const data = await res.json();
      console.log("📊 Response data:", data);
      
      if (res.ok) {
        console.log("✅ Login exitoso. Guardando sesión...");
        // Guardar sesión en localStorage
        localStorage.setItem("tenant", JSON.stringify(data.tenant));
        
        // Verificar que la cookie se guardó
        console.log("🍪 Verificando cookies después del login...");
        const meRes = await fetch("/api/auth/me", {
          credentials: "include"
        });
        console.log("🍪 /auth/me status:", meRes.status);
        
        toast.success("¡Bienvenido de nuevo! 🚀");
        // Pequeño delay para asegurar que la cookie se guarde
        setTimeout(() => setLocation("/"), 100);
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
                    <Label htmlFor="password">Contraseña</Label>
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

        <p className="text-center text-xs text-muted-foreground mt-8 px-8 leading-relaxed">
          Al continuar, aceptas nuestros términos de servicio y políticas de privacidad. 
          Tu información está protegida por encriptación de grado militar.
        </p>
      </div>
    </div>
  );
}
