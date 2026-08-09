import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Palette, Upload, Eye, Globe, Facebook, Instagram, Twitter, Linkedin, Phone } from "lucide-react";
import { toast } from "sonner";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("branding")!;

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
}

interface BrandTheme {
  mode: "light" | "dark" | "auto";
  font: string;
  borderRadius: "none" | "sm" | "md" | "lg" | "xl";
  customCSS?: string;
}

interface BrandSocial {
  website?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  whatsapp?: string;
}

interface BrandingData {
  brandName: string;
  brandLogo: string | null;
  brandColors: BrandColors;
  brandTheme: BrandTheme;
  brandSocial: BrandSocial;
  contactEmail: string;
  contactPhone: string;
  supportEmail: string;
  slug: string;
  domain: string | null;
}

const defaultColors: BrandColors = {
  primary: "#f97316",
  secondary: "#fb923c",
  accent: "#a855f7",
  background: "#ffffff",
  foreground: "#1f2937",
  muted: "#f3f4f6",
};

const defaultTheme: BrandTheme = {
  mode: "light",
  font: "Inter",
  borderRadius: "lg",
};

export default function Branding() {
  useAutoTour(HELP_GUIDE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [formData, setFormData] = useState<BrandingData>({
    brandName: "",
    brandLogo: null,
    brandColors: defaultColors,
    brandTheme: defaultTheme,
    brandSocial: {},
    contactEmail: "",
    contactPhone: "",
    supportEmail: "",
    slug: "",
    domain: null,
  });

  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    try {
      const res = await fetch("/api/branding");
      if (!res.ok) throw new Error("Error al cargar configuración");
      const data = await res.json();
      setFormData(data);
      if (data.brandLogo) setLogoUrl(data.brandLogo);
    } catch (e) {
      toast.error("Error al cargar configuración de marca");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Error al guardar");
      
      toast.success("Configuración de marca guardada exitosamente");
      await loadBranding();
    } catch (e) {
      toast.error("Error al guardar configuración");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoUrl) {
      toast.error("Ingresa una URL de logo primero");
      return;
    }

    try {
      const res = await fetch("/api/branding/upload-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      });

      if (!res.ok) throw new Error("Error al subir logo");
      
      toast.success("Logo actualizado exitosamente");
      await loadBranding();
    } catch (e) {
      toast.error("Error al actualizar logo");
      console.error(e);
    }
  };

  const updateColor = (key: keyof BrandColors, value: string) => {
    setFormData(prev => ({
      ...prev,
      brandColors: {
        ...prev.brandColors,
        [key]: value,
      },
    }));
  };

  const updateTheme = (key: keyof BrandTheme, value: any) => {
    setFormData(prev => ({
      ...prev,
      brandTheme: {
        ...prev.brandTheme,
        [key]: value,
      },
    }));
  };

  const updateSocial = (key: keyof BrandSocial, value: string) => {
    setFormData(prev => ({
      ...prev,
      brandSocial: {
        ...prev.brandSocial,
        [key]: value,
      },
    }));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-8 max-w-6xl mx-auto animate-enter">
          <Skeleton className="h-20 w-full rounded-3xl" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[500px] w-full rounded-3xl" />
            <Skeleton className="h-[500px] w-full rounded-3xl" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-6xl mx-auto animate-enter">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-3xl font-bold tracking-tight">
                Personalización de Marca
              </h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground mt-1">
              Configura los colores, logo y redes sociales de tu negocio
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              data-tour="branding-preview-toggle"
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              className="h-11 px-6 rounded-xl"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? "Ocultar" : "Vista Previa"}
            </Button>
            <Button
              data-tour="branding-save-button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 px-6 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>

        {/* Preview Banner */}
        {showPreview && (
          <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative animate-in fade-in slide-in-from-top-4">
            <div 
              className="absolute top-0 right-0 w-full h-2"
              style={{ background: `linear-gradient(to right, ${formData.brandColors.primary}, ${formData.brandColors.accent})` }}
            />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl">Vista Previa</CardTitle>
              <CardDescription>Así se verá tu marca en la aplicación</CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className="p-8 rounded-2xl border"
                style={{
                  backgroundColor: formData.brandColors.background,
                  borderColor: formData.brandColors.muted,
                  color: formData.brandColors.foreground,
                  fontFamily: formData.brandTheme.font,
                }}
              >
                <div className="flex items-center gap-4 mb-6">
                  {formData.brandLogo && (
                    <img 
                      src={formData.brandLogo} 
                      alt={formData.brandName}
                      className="h-16 w-16 object-contain rounded-xl"
                    />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold break-words">{formData.brandName || "Tu Marca"}</h2>
                    <p className="text-sm opacity-70 break-all">{formData.slug}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div 
                    className="p-4 rounded-xl text-white text-center font-semibold"
                    style={{ backgroundColor: formData.brandColors.primary }}
                  >
                    Primario
                  </div>
                  <div 
                    className="p-4 rounded-xl text-white text-center font-semibold"
                    style={{ backgroundColor: formData.brandColors.secondary }}
                  >
                    Secundario
                  </div>
                  <div 
                    className="p-4 rounded-xl text-white text-center font-semibold"
                    style={{ backgroundColor: formData.brandColors.accent }}
                  >
                    Acento
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Logo y Nombre */}
          <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-primary to-accent" />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                Logo y Nombre
              </CardTitle>
              <CardDescription>Identidad visual de tu marca</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Nombre de la Marca
                </Label>
                <Input
                  value={formData.brandName}
                  onChange={e => setFormData({ ...formData, brandName: e.target.value })}
                  placeholder="Ej. TecnoVariedades D&S"
                  className="font-medium bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  URL del Logo
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={logoUrl}
                    onChange={e => setLogoUrl(e.target.value)}
                    placeholder="https://ejemplo.com/logo.png"
                    className="bg-muted/30"
                  />
                  <Button
                    onClick={handleUploadLogo}
                    variant="outline"
                    className="shrink-0"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {formData.brandLogo && (
                <div className="p-4 bg-muted/20 rounded-2xl border border-white/5">
                  <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-3 block">
                    Logo Actual
                  </Label>
                  <img
                    src={formData.brandLogo}
                    alt={formData.brandName}
                    className="h-24 w-auto object-contain mx-auto"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Slug (URL única)
                </Label>
                <Input
                  value={formData.slug}
                  disabled
                  className="bg-muted/30 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground break-all">
                  Tu tienda: app.com/{formData.slug}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Colores de Marca */}
          <Card data-tour="branding-colors" className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-purple-500 to-pink-500" />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                  <Palette className="h-5 w-5" />
                </div>
                Colores de Marca
              </CardTitle>
              <CardDescription>Paleta de colores personalizada</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(formData.brandColors).map(([key, value]) => (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                      {key === "primary" && "Primario"}
                      {key === "secondary" && "Secundario"}
                      {key === "accent" && "Acento"}
                      {key === "background" && "Fondo"}
                      {key === "foreground" && "Texto"}
                      {key === "muted" && "Desactivado"}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={value}
                        onChange={e => updateColor(key as keyof BrandColors, e.target.value)}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={value}
                        onChange={e => updateColor(key as keyof BrandColors, e.target.value)}
                        placeholder="#000000"
                        className="font-mono text-sm bg-muted/30"
                      />
                    </div>
                  </div>
                  <div
                    className="w-12 h-12 rounded-xl border-2 border-white/20 shadow-lg shrink-0"
                    style={{ backgroundColor: value }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tema */}
          <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-500 to-cyan-500" />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl">Configuración de Tema</CardTitle>
              <CardDescription>Apariencia y estilo visual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Modo de Color
                </Label>
                <select
                  value={formData.brandTheme.mode}
                  onChange={e => updateTheme("mode", e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                  <option value="auto">Automático</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Fuente
                </Label>
                <select
                  value={formData.brandTheme.font}
                  onChange={e => updateTheme("font", e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="Inter">Inter</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Lato">Lato</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Radio de Bordes
                </Label>
                <select
                  value={formData.brandTheme.borderRadius}
                  onChange={e => updateTheme("borderRadius", e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="none">Sin bordes redondeados</option>
                  <option value="sm">Pequeño (0.25rem)</option>
                  <option value="md">Mediano (0.5rem)</option>
                  <option value="lg">Grande (0.75rem)</option>
                  <option value="xl">Extra Grande (1rem)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  CSS Personalizado (Opcional)
                </Label>
                <Textarea
                  value={formData.brandTheme.customCSS || ""}
                  onChange={e => updateTheme("customCSS", e.target.value)}
                  placeholder="/* Tu CSS personalizado aquí */"
                  className="h-32 resize-none bg-muted/30 font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Redes Sociales */}
          <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-green-500 to-emerald-500" />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                  <Globe className="h-5 w-5" />
                </div>
                Redes Sociales
              </CardTitle>
              <CardDescription>Enlaces a tus perfiles sociales</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Globe className="h-3 w-3" /> Sitio Web
                </Label>
                <Input
                  value={formData.brandSocial.website || ""}
                  onChange={e => updateSocial("website", e.target.value)}
                  placeholder="https://tusitio.com"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Facebook className="h-3 w-3" /> Facebook
                </Label>
                <Input
                  value={formData.brandSocial.facebook || ""}
                  onChange={e => updateSocial("facebook", e.target.value)}
                  placeholder="https://facebook.com/tupagina"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Instagram className="h-3 w-3" /> Instagram
                </Label>
                <Input
                  value={formData.brandSocial.instagram || ""}
                  onChange={e => updateSocial("instagram", e.target.value)}
                  placeholder="https://instagram.com/tuperfil"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Twitter className="h-3 w-3" /> Twitter / X
                </Label>
                <Input
                  value={formData.brandSocial.twitter || ""}
                  onChange={e => updateSocial("twitter", e.target.value)}
                  placeholder="https://twitter.com/tuperfil"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </Label>
                <Input
                  value={formData.brandSocial.linkedin || ""}
                  onChange={e => updateSocial("linkedin", e.target.value)}
                  placeholder="https://linkedin.com/company/tuempresa"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                  <Phone className="h-3 w-3" /> WhatsApp
                </Label>
                <Input
                  value={formData.brandSocial.whatsapp || ""}
                  onChange={e => updateSocial("whatsapp", e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="bg-muted/30"
                />
              </div>
            </CardContent>
          </Card>

          {/* Información de Contacto */}
          <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
            <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-orange-500 to-yellow-500" />
            <CardHeader className="pt-8">
              <CardTitle className="text-xl">Información de Contacto</CardTitle>
              <CardDescription>Datos de contacto para tus clientes</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Email de Contacto
                </Label>
                <Input
                  type="email"
                  value={formData.contactEmail}
                  onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                  placeholder="contacto@tuempresa.com"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Teléfono de Contacto
                </Label>
                <Input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="+57 300 123 4567"
                  className="bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  Email de Soporte
                </Label>
                <Input
                  type="email"
                  value={formData.supportEmail}
                  onChange={e => setFormData({ ...formData, supportEmail: e.target.value })}
                  placeholder="soporte@tuempresa.com"
                  className="bg-muted/30"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Save Button (Mobile) */}
        <div className="md:hidden fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-4 right-4 z-40">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-2xl"
          >
            <Save className="h-5 w-5 mr-2" />
            {isSaving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
