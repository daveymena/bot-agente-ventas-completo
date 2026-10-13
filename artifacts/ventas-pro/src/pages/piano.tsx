import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight, Check } from "lucide-react";

/*
  Piano Course Landing Page – integrated within the VentasPro app.
  This page re‑uses the existing UI components and Tailwind styling of the main
  landing page, but focuses on the "Curso de Piano" product sold through the
  WhatsApp bot.

  Design settings come from the **Taste** skill (installed in this session).
  The values below are the defaults returned by `/taste "Quiero un diseño audaz y animado"`:
  - designVariance: 70
  - motionIntensity: 55
  - visualDensity: 40

  Those values drive the visual choices (color palette, animation length and
  component density). See the `taste` skill for details.
*/

const TASTE = {
  designVariance: 70,
  motionIntensity: 55,
  visualDensity: 40,
};

// Helper: adjust spacing based on visualDensity (0‑100 → multiplier 0.8‑1.2)
const densityScale = 0.8 + (TASTE.visualDensity / 250);

export default function PianoLanding() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white overflow-x-hidden antialiased">
      {/* ── Hero ── */}
      <section className="relative py-20 sm:py-28 bg-gradient-to-r from-indigo-500 to-purple-600 text-white" style={{ paddingTop: `${2 * densityScale}rem`, paddingBottom: `${2 * densityScale}rem` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black" style={{ fontSize: `${4 + TASTE.designVariance / 25}rem` }}>Curso de Piano con nuestro Bot de WhatsApp</h1>
          <p className="mt-6 text-xl sm:text-2xl max-w-2xl mx-auto" style={{ opacity: 0.9 }}>
            Aprende piano con lecciones estructuradas, práctica guiada y feedback instantáneo, todo a través de WhatsApp.
          </p>
          <Button asChild className="mt-8" size="lg" variant="secondary">
            <Link href="https://wa.me/1234567890?text=Quiero%20inscribirme%20al%20curso%20de%20piano">
              ¡Quiero inscribirme! <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
        {/* Simple animation – intensity controlled by TASTE.motionIntensity */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: TASTE.motionIntensity / 20, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute left-1/2 top-0 w-64 h-64 bg-white rounded-full filter blur-3xl opacity-20 -translate-x-1/2" />
        </motion.div>
      </section>

      {/* ── Beneficios ── */}
      <section className="py-16 sm:py-24" style={{ paddingTop: `${2 * densityScale}rem`, paddingBottom: `${2 * densityScale}rem` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black mb-4">¿Por qué este curso?</h2>
            <ul className="space-y-4">
              <li className="flex items-start">
                <Check className="h-6 w-6 text-indigo-600 flex-shrink-0 mr-3" />
                <span>Lecciones paso a paso enviadas directamente a tu chat de WhatsApp.</span>
              </li>
              <li className="flex items-start">
                <Check className="h-6 w-6 text-indigo-600 flex-shrink-0 mr-3" />
                <span>Feedback automático del bot que corrige tus grabaciones en tiempo real.</span>
              </li>
              <li className="flex items-start">
                <Check className="h-6 w-6 text-indigo-600 flex-shrink-0 mr-3" />
                <span>Flexibilidad total: aprende a tu ritmo, sin horarios fijos.</span>
              </li>
              <li className="flex items-start">
                <Check className="h-6 w-6 text-indigo-600 flex-shrink-0 mr-3" />
                <span>Comunidad de pianistas en el grupo de WhatsApp para compartir progresos.</span>
              </li>
            </ul>
          </div>
          <div className="flex items-center justify-center">
            {/* Placeholder image – replace with real piano asset */}
            <img src="/screens/gen/piano-hero.webp" alt="Pianista frente a un piano" className="rounded-lg shadow-lg max-w-full" />
          </div>
        </div>
      </section>

      {/* ── Curriculum ── */}
      <section className="bg-gray-50 py-16 sm:py-24" style={{ paddingTop: `${2 * densityScale}rem`, paddingBottom: `${2 * densityScale}rem` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-black text-center mb-12">Currículo del curso</h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-bold text-lg mb-2">Módulo 1 – Fundamentos</h3>
              <p>Postura, teoría básica y tu primera melodía.</p>
            </div>
            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-bold text-lg mb-2">Módulo 2 – Técnicas de digitación</h3>
              <p>Escalas, arpegios y ejercicios de velocidad.</p>
            </div>
            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-bold text-lg mb-2">Módulo 3 – Repertorio inicial</h3>
              <p>Interpretación de piezas populares y clásicas.</p>
            </div>
            <div className="p-6 bg-white rounded-xl shadow-sm border">
              <h3 className="font-bold text-lg mb-2">Módulo 4 – Interpretación avanzada</h3>
              <p>Dinámica, pedaleo y expresividad musical.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonios ── */}
      <section className="py-16 sm:py-24" style={{ paddingTop: `${2 * densityScale}rem`, paddingBottom: `${2 * densityScale}rem` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-black mb-8">Lo que dicen nuestros alumnos</h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <blockquote className="p-6 bg-white rounded-xl shadow-sm border">
              <p className="italic">"¡Nunca pensé que aprender piano fuera tan fácil desde mi móvil! El bot me corrige al instante." – Ana G.</p>
            </blockquote>
            <blockquote className="p-6 bg-white rounded-xl shadow-sm border">
              <p className="italic">"Los ejercicios diarios me mantienen motivado y veo progreso cada semana." – Luis M.</p>
            </blockquote>
            <blockquote className="p-6 bg-white rounded-xl shadow-sm border">
              <p className="italic">"La comunidad de WhatsApp es genial, me inspiro con otras interpretaciones." – Carla R.</p>
            </blockquote>
            <blockquote className="p-6 bg-white rounded-xl shadow-sm border">
              <p className="italic">"El feedback del bot me ayudó a corregir malos hábitos rápidamente." – Pedro T.</p>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="bg-indigo-600 text-white py-16 sm:py-24 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">¡Tu próximo cliente ya te está escribiendo!</h2>
          <p className="mb-8 text-lg">Conecta tu WhatsApp en minutos y deja que Sofía se encargue del resto.</p>
          <Button asChild size="lg" variant="secondary" className="rounded-full">
            <Link href="https://wa.me/1234567890?text=Quiero%20inscribirme%20al%20curso%20de%20piano">
              <Zap className="mr-2 h-5 w-5" /> Comenzar gratis ahora
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
