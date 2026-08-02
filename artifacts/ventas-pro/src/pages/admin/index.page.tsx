import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Facebook, Mail, Settings, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const sections = [
    {
      icon: CreditCard,
      title: "Pagos",
      description: "MercadoPago, PayPal, Transferencias",
      color: "from-emerald-500 to-teal-500",
      route: "/admin/payment-credentials"
    },
    {
      icon: Facebook,
      title: "Facebook",
      description: "Anuncios, Catálogo, Messenger",
      color: "from-blue-500 to-cyan-500",
      route: "/admin/facebook-credentials"
    },
    {
      icon: Mail,
      title: "Correo",
      description: "SMTP para confirmaciones",
      color: "from-purple-500 to-pink-500",
      route: "/admin/email-credentials"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Panel de Administración</h1>
          <p className="text-slate-400">Configura todas tus credenciales y integraciones</p>
        </div>

        {/* Grid de Secciones */}
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Card
                key={section.route}
                className="rounded-3xl border-0 shadow-2xl glass-panel overflow-hidden relative cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
                onClick={() => navigate(section.route)}
              >
                <div className={`absolute top-0 right-0 w-full h-2 bg-gradient-to-r ${section.color}`} />

                <CardHeader className="pt-8">
                  <div className={`p-3 bg-gradient-to-br ${section.color} bg-opacity-10 rounded-lg w-fit mb-3`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-2xl">{section.title}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-slate-400 text-sm">{section.description}</p>
                  <Button className={`w-full bg-gradient-to-r ${section.color} hover:opacity-90`}>
                    Configurar <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="mt-12 p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-slate-400 mt-1 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-200 mb-1">💡 Tip</h3>
              <p className="text-slate-400 text-sm">
                Todas tus credenciales se guardan cifradas y nunca se devuelven en texto plano. Prueba cada conexión antes de guardar para asegurarte de que funciona correctamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
