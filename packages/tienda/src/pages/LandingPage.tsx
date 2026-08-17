import { useEffect, useParams } from 'react';
import { ArrowRight, Check, Shield, Truck, RotateCcw, Star, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/useStore';
import { darken, readableTextColor } from '../lib/color';

interface Product {
  id: string;
  title: string;
  image: string;
  price: number;
  originalPrice?: number;
  discount?: number;
}

const LandingPage = () => {
  const { slug } = useParams();
  const effectiveSlug = slug || 'sofia-premium';
  const { config, updateConfig } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

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

  const benefits = [
    { icon: Truck, title: 'Envío rápido', desc: 'Entrega en 3-7 días hábiles' },
    { icon: RotateCcw, title: 'Garantía', desc: '30 días de garantía de satisfacción' },
    { icon: Shield, title: 'Pago seguro', desc: 'Transacciones protegidas' },
    { icon: TrendingUp, title: 'Oferta limitada', desc: '40% descuento HOY' },
  ];

  const testimonials = [
    { name: 'María G.', city: 'Bogotá', rating: 5, text: '¡Excelente producto! Llegó antes de lo esperado.' },
    { name: 'Carlos R.', city: 'Medellín', rating: 5, text: 'Calidad impecable, muy satisfecho con mi compra.' },
    { name: 'Ana P.', city: 'Cali', rating: 5, text: 'Recomendado 100%, volvería a comprar.' },
  ];

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
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[var(--store-primary)]/20 border border-[var(--store-primary)]/50 rounded-full px-4 py-2 mb-6">
              <TrendingUp className="w-4 h-4 text-[var(--store-primary)]" />
              <span className="text-sm font-semibold text-[var(--store-primary)]">Oferta exclusiva limitada</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-tight">
              Descubre la mejor
              <span className="block text-[var(--store-primary)]">selección de productos</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              Productos premium con descuentos increíbles. Calidad garantizada y envío rápido a todo el país.
            </p>

            {/* CTA Button */}
            <button
              onClick={handleShopNow}
              className="inline-flex items-center gap-3 bg-[var(--store-primary)] hover:bg-[var(--store-primary-hover)] text-[var(--store-on-primary)] font-bold py-4 px-8 rounded-lg text-lg transition-all hover:scale-105 active:scale-95 shadow-xl mb-8"
            >
              Ver Productos Ahora
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Trust badges */}
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
                <span>Garantía 30 días</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, idx) => {
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
            {[
              { title: 'Productos auténticos', desc: 'Directamente del fabricante, sin intermediarios' },
              { title: 'Mejor precio garantizado', desc: 'Si encuentras más barato, igualamos el precio' },
              { title: 'Atención al cliente 24/7', desc: 'Estamos aquí para resolver cualquier duda' },
              { title: 'Devoluciones fáciles', desc: 'Sin preguntas si no estás satisfecho' },
            ].map((item, idx) => (
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
            {testimonials.map((testimonial, idx) => (
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

export default LandingPage;
