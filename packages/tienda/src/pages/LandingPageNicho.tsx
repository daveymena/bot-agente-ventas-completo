import { useEffect, useMemo } from 'react';
import { ArrowRight, Check, Shield, Truck, RotateCcw, Star, TrendingUp, Zap } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { darken, readableTextColor } from '../lib/color';

interface Product {
  id: string;
  title: string;
  image: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  category?: string;
}

interface NichoConfig {
  headline: string;
  subheadline: string;
  benefits: Array<{ icon: any; title: string; desc: string }>;
  whyUs: Array<{ title: string; desc: string }>;
  testimonials: Array<{ name: string; city: string; rating: number; text: string }>;
  colors?: {
    primary?: string;
    gradient?: string;
  };
}

const NICHO_CONFIGS: Record<string, NichoConfig> = {
  tecnologia: {
    headline: 'Últimas Novedades en Tecnología',
    subheadline: 'Gadgets y accesorios tech con garantía y envío express a todo el país.',
    benefits: [
      { icon: Truck, title: 'Envío express', desc: 'Entrega en 2-5 días hábiles' },
      { icon: Zap, title: 'Garantía', desc: '2 años de cobertura completa' },
      { icon: Shield, title: 'Pago seguro', desc: 'Transacciones protegidas' },
      { icon: TrendingUp, title: 'Tech garantizado', desc: 'Productos 100% originales' },
    ],
    whyUs: [
      { title: 'Productos de marca verificada', desc: 'Distribuidor oficial de marcas top' },
      { title: 'Soporte técnico 24/7', desc: 'Asesoría experta en cada compra' },
      { title: 'Garantía internacional', desc: 'Válida en todo el continente' },
      { title: 'Actualización garantizada', desc: 'Warranty cover y updates incluidos' },
    ],
    testimonials: [
      { name: 'Felipe T.', city: 'Bogotá', rating: 5, text: '¡Excelente! Compré un smartphone y es 100% original. Llegó en 3 días.' },
      { name: 'Andrés M.', city: 'Medellín', rating: 5, text: 'El mejor soporte tech que he encontrado. Resolvieron mi problema en minutos.' },
      { name: 'Diego L.', city: 'Cali', rating: 5, text: 'Gadgets de verdadera calidad. Volvería a comprar sin dudarlo.' },
    ],
  },
  moda: {
    headline: 'Moda Exclusiva para Ti',
    subheadline: 'Ropa y accesorios de tendencia. Estilo garantizado y envío rápido.',
    benefits: [
      { icon: Truck, title: 'Envío a todo el país', desc: 'Entrega en 3-7 días' },
      { icon: RotateCcw, title: 'Cambios gratis', desc: 'Talla no te encajó? Cambiamos' },
      { icon: Shield, title: 'Compra segura', desc: 'Protección al 100%' },
      { icon: TrendingUp, title: 'Tendencia 2024', desc: 'Diseños exclusivos' },
    ],
    whyUs: [
      { title: 'Ropa de calidad premium', desc: 'Materiales importados y durables' },
      { title: 'Envíos discretos', desc: 'Embalaje cuidado y elegante' },
      { title: 'Cambios sin costo', desc: 'Devuelve si no eres feliz' },
      { title: 'Ofertas semanales', desc: 'Nuevas colecciones cada semana' },
    ],
    testimonials: [
      { name: 'María S.', city: 'Bogotá', rating: 5, text: 'La ropa es de excelente calidad. La talla es exacta como la describía.' },
      { name: 'Laura R.', city: 'Medellín', rating: 5, text: 'Estoy enamorada de mi compra. Los colores son hermosos.' },
      { name: 'Camila P.', city: 'Cali', rating: 5, text: 'Servicio impecable. Recomendado 100% a todas mis amigas.' },
    ],
  },
  hogar: {
    headline: 'Transforma tu Hogar',
    subheadline: 'Muebles y decoración de estilo. Diseño moderno con envío e instalación.',
    benefits: [
      { icon: Truck, title: 'Envío e instalación', desc: 'Gratis en tu hogar' },
      { icon: RotateCcw, title: 'Garantía de diseño', desc: 'Si no te gusta, canjeamos' },
      { icon: Shield, title: 'Compra segura', desc: 'Protección total' },
      { icon: TrendingUp, title: 'Diseño de tendencia', desc: '2024 styles' },
    ],
    whyUs: [
      { title: 'Diseño interior profesional', desc: 'Asesoría gratis con expertos' },
      { title: 'Materiales resistentes', desc: 'Muebles que duran años' },
      { title: 'Instalación incluida', desc: 'Nuestro equipo lo instala' },
      { title: 'Crédito disponible', desc: 'Planes de pago flexible' },
    ],
    testimonials: [
      { name: 'Roberto G.', city: 'Bogotá', rating: 5, text: 'Mi sala cambió completamente. Servicio de instalación impecable.' },
      { name: 'Patricia M.', city: 'Medellín', rating: 5, text: 'Muebles de calidad excepcional. El diseño es tal como aparece.' },
      { name: 'Juan C.', city: 'Cali', rating: 5, text: 'La mejor decisión para nuestro hogar. Recomendado.' },
    ],
  },
  belleza: {
    headline: 'Belleza y Cuidado Premium',
    subheadline: 'Productos de belleza original con envío rápido y garantía de satisfacción.',
    benefits: [
      { icon: Truck, title: 'Envío rápido', desc: 'Entrega en 2-3 días' },
      { icon: RotateCcw, title: 'Devoluciones', desc: '15 días sin preguntas' },
      { icon: Shield, title: 'Productos originales', desc: '100% garantizado' },
      { icon: TrendingUp, title: 'Marcas top', desc: 'Todas las mejores marcas' },
    ],
    whyUs: [
      { title: 'Cosméticos 100% originales', desc: 'Certificado y verificado' },
      { title: 'Dermatologo recomendado', desc: 'Productos aprobados' },
      { title: 'Muestras gratis', desc: 'Prueba antes de usar' },
      { title: 'Consejos de belleza', desc: 'Blog y tutorials incluidos' },
    ],
    testimonials: [
      { name: 'Sofía L.', city: 'Bogotá', rating: 5, text: 'Por fin encuentro cosméticos originales. Mi piel está radiante.' },
      { name: 'Alejandra T.', city: 'Medellín', rating: 5, text: 'Productos de marca reconocida a precios justos. Excelente.' },
      { name: 'Natalia R.', city: 'Cali', rating: 5, text: 'Impresionada con la calidad. Las muestras fueron un detalle genial.' },
    ],
  },
  electrodomesticos: {
    headline: 'Electrodomésticos de Clase A',
    subheadline: 'Marcas líderes con garantía extendida y servicio técnico incluido.',
    benefits: [
      { icon: Truck, title: 'Entrega certificada', desc: 'Con descargo de firma' },
      { icon: RotateCcw, title: 'Garantía extendida', desc: 'Hasta 5 años disponible' },
      { icon: Shield, title: 'Compra 100% segura', desc: 'Protección total' },
      { icon: TrendingUp, title: 'Precios competitivos', desc: 'Mejor valor del mercado' },
    ],
    whyUs: [
      { title: 'Marcas originales solamente', desc: 'Samsung, LG, Whirlpool y más' },
      { title: 'Servicio técnico a domicilio', desc: 'Reparación garantizada' },
      { title: 'Instalación profesional', desc: 'Técnicos certificados' },
      { title: 'Financiación sin interés', desc: 'Hasta 24 meses' },
    ],
    testimonials: [
      { name: 'Carlos M.', city: 'Bogotá', rating: 5, text: 'Compré una nevera y el servicio de entrega fue profesional.' },
      { name: 'Fernando R.', city: 'Medellín', rating: 5, text: 'Electrodomésticos nuevos con garantía. Muy confiable.' },
      { name: 'Miguel L.', city: 'Cali', rating: 5, text: 'La mejor opción para equipos de marca. Recomendado.' },
    ],
  },
  deportes: {
    headline: 'Equipo Deportivo Profesional',
    subheadline: 'Ropa y accesorios deportivos con garantía. Para atletas y aficionados.',
    benefits: [
      { icon: Truck, title: 'Envío rápido', desc: 'Listo en 24-48 horas' },
      { icon: RotateCcw, title: 'Cambio de talla gratis', desc: 'Llegó grande? Cambiamos' },
      { icon: Shield, title: 'Producto verificado', desc: 'Marcas 100% originales' },
      { icon: TrendingUp, title: 'Gear profesional', desc: 'Equipo de atletas' },
    ],
    whyUs: [
      { title: 'Equipos de marca reconocida', desc: 'Nike, Adidas, Puma y más' },
      { title: 'Asesoría deportiva', desc: 'Consejo de expertos' },
      { title: 'Devoluciones fáciles', desc: 'No te encajó? Sin problema' },
      { title: 'Comunidad atleta', desc: 'Eventos y promociones exclusivas' },
    ],
    testimonials: [
      { name: 'Javier H.', city: 'Bogotá', rating: 5, text: 'Material deportivo de excelente calidad. Entreno con confianza.' },
      { name: 'Santiago P.', city: 'Medellín', rating: 5, text: 'Equipo original a buen precio. Muy satisfecho.' },
      { name: 'David C.', city: 'Cali', rating: 5, text: 'Para cualquier deporte, tienen todo. Recomendado.' },
    ],
  },
};

const LandingPageNicho = () => {
  const { slug } = useParams();
  const effectiveSlug = slug || 'sofia-premium';
  const { config, updateConfig } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const nichoConfig = useMemo(() => {
    const category = products[0]?.category || 'general';
    return NICHO_CONFIGS[category.toLowerCase()] || NICHO_CONFIGS.tecnologia;
  }, [products]);

  useEffect(() => {
    fetch(`/api/public/products/${effectiveSlug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.store) return;
        updateConfig({
          socialLinks: d.store.socialLinks || {},
          ...(d.store.colors?.primary ? { primaryColor: d.store.colors.primary } : {}),
        });
        if (d.products) {
          setProducts(d.products.slice(0, 6));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveSlug]);

  const themeVars = {
    '--store-primary': config.primaryColor || '#dc2626',
    '--store-primary-hover': darken(config.primaryColor || '#dc2626', 0.15),
    '--store-on-primary': readableTextColor(config.primaryColor || '#dc2626'),
  } as React.CSSProperties;

  const handleShopNow = () => {
    window.location.href = slug ? `/tienda/${slug}` : '/tienda';
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" style={themeVars}>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white pt-20 pb-32">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--store-primary)] rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--store-primary)] rounded-full blur-3xl opacity-50"></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-[var(--store-primary)]/20 border border-[var(--store-primary)]/50 rounded-full px-4 py-2 mb-6">
              <TrendingUp className="w-4 h-4 text-[var(--store-primary)]" />
              <span className="text-sm font-semibold text-[var(--store-primary)]">Oferta exclusiva limitada</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-tight">
              {nichoConfig.headline}
              <span className="block text-[var(--store-primary)]">Con descuentos increíbles</span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              {nichoConfig.subheadline}
            </p>

            <button
              onClick={handleShopNow}
              className="inline-flex items-center gap-3 bg-[var(--store-primary)] hover:bg-[var(--store-primary-hover)] text-[var(--store-on-primary)] font-bold py-4 px-8 rounded-lg text-lg transition-all hover:scale-105 active:scale-95 shadow-xl mb-8"
            >
              Ver Productos Ahora
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                <span>Pago 100% seguro</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-400" />
                <span>Envío rápido</span>
              </div>
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-orange-400" />
                <span>Garantía completa</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {nichoConfig.benefits.map((benefit, idx) => {
              const Icon = benefit.icon;
              return (
                <div key={idx} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--store-primary)]/10 rounded-full mb-4">
                    <Icon className="w-7 h-7 text-[var(--store-primary)]" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                  <p className="text-gray-600 text-sm">{benefit.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">Productos destacados</h2>
            <p className="text-gray-600 text-lg">Los más vendidos con los mejores precios</p>
          </div>

          {!loading && products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-2xl transition-all hover:scale-105"
                >
                  <div className="relative aspect-square bg-gray-200 overflow-hidden">
                    <img
                      src={product.image || '/placeholder.jpg'}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                    {product.discount && (
                      <div className="absolute top-4 right-4 bg-[var(--store-primary)] text-[var(--store-on-primary)] px-3 py-1 rounded-full font-bold text-sm">
                        -{product.discount}%
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <h3 className="font-bold text-lg mb-2 line-clamp-2">{product.title}</h3>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl font-black text-[var(--store-primary)]">
                        ${product.price.toLocaleString()}
                      </span>
                      {product.originalPrice && (
                        <span className="text-sm text-gray-500 line-through">
                          ${product.originalPrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleShopNow}
                      className="w-full bg-[var(--store-primary)] hover:bg-[var(--store-primary-hover)] text-[var(--store-on-primary)] font-bold py-2 rounded-lg transition-colors"
                    >
                      Ver producto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600">Cargando productos...</p>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={handleShopNow}
              className="inline-flex items-center gap-2 bg-[var(--store-primary)] hover:bg-[var(--store-primary-hover)] text-[var(--store-on-primary)] font-bold py-3 px-8 rounded-lg transition-all hover:scale-105"
            >
              Ver todos los productos
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-gradient-to-r from-slate-50 to-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">¿Por qué nosotros?</h2>
            <p className="text-gray-600 text-lg">Somos líderes en satisfacción de clientes</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {nichoConfig.whyUs.map((item, idx) => (
              <div key={idx} className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 shrink-0 mt-1" />
                <div>
                  <h4 className="font-bold text-lg mb-1">{item.title}</h4>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">Qué dicen nuestros clientes</h2>
            <p className="text-gray-600 text-lg">Miles de compradores satisfechos</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {nichoConfig.testimonials.map((testimonial, idx) => (
              <div key={idx} className="bg-white p-6 rounded-lg shadow-lg">
                <div className="flex gap-1 mb-3">
                  {Array(testimonial.rating)
                    .fill(0)
                    .map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                </div>
                <p className="text-gray-700 mb-4 italic">"{testimonial.text}"</p>
                <div>
                  <p className="font-bold">{testimonial.name}</p>
                  <p className="text-sm text-gray-600">{testimonial.city}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-r from-[var(--store-primary)] to-[var(--store-primary-hover)] text-[var(--store-on-primary)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-black mb-4">¿Listo para comprar?</h2>
          <p className="text-xl mb-8 opacity-90">
            Consigue los mejores productos con descuentos exclusivos. ¡Hoy solamente!
          </p>
          <button
            onClick={handleShopNow}
            className="inline-flex items-center gap-3 bg-white text-[var(--store-primary)] hover:bg-gray-100 font-bold py-4 px-10 rounded-lg text-lg transition-all hover:scale-105 active:scale-95"
          >
            Comprar ahora
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-sm mt-6 opacity-75">Oferta válida solo hoy. ¡No pierdas esta oportunidad!</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} {config.storeName || 'Tienda'} — Todos los derechos reservados
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPageNicho;
