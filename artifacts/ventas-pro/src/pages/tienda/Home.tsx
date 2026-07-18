import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Star, ShieldCheck, Package, Sparkles, Award, Clock, Users, BookOpen, PlayCircle, CreditCard, Lock, Download } from "lucide-react";
import { useStoreCart } from "./store-context";
import { StorePageRenderer } from "./StorePageRenderer";

/* ─── WhatsApp Icon ─── */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/* ─── Payment helper ─── */
async function generateCheckout(slug: string, productId: number, method: "mercadopago" | "paypal") {
  const res = await fetch(`/api/public/checkout/${slug}/${productId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  });
  if (!res.ok) throw new Error("Error generando enlace de pago");
  const data = await res.json();
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
}

/* ─── WhatsApp helper ─── */
function buyViaWhatsApp(phone: string | null | undefined, product: any) {
  if (!phone) { alert("WhatsApp no disponible. Contacta al administrador."); return; }
  const msg = `¡Hola! 👋%0A%0AQuiero comprar este producto:%0A%0A*${encodeURIComponent(product.name)}*%0APrecio: $${encodeURIComponent(String(product.price))} ${encodeURIComponent(product.currency || "COP")}%0A%0A¿Me ayudas con el proceso de pago y entrega? 🙌`;
  window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
}

/* ─── Hero tipo Teducas: limpio, claro, educativo ─── */
function Hero() {
  const { config, products } = useStoreCart();
  const catCount = useMemo(() => new Set(products.map((p: any) => p.category).filter(Boolean)).size, [products]);

  return (
    <section className="bg-white pt-16 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
              style={{ backgroundColor: `${config.primaryColor}15`, color: config.primaryColor }}
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              {products.length > 0 ? `${products.length} Productos Disponibles` : "Bienvenido"}
            </span>
            <h1 className="text-4xl md:text-6xl font-black text-slate-900 mb-5 leading-tight">
              Aprende, crece y <span style={{ color: config.primaryColor }}>domina</span> nuevas habilidades
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-2xl mx-auto leading-relaxed">
              {products.length > 0
                ? `Cursos, megapacks y recursos digitales paso a paso para que aprendas a tu ritmo. ${products.length} productos en ${catCount} ${catCount === 1 ? "categoría" : "categorías"}.`
                : "Cursos, megapacks y recursos digitales paso a paso para que aprendas a tu ritmo desde la comodidad de tu casa."}
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                to={`/store/${config.slug}/productos`}
                style={{ backgroundColor: config.primaryColor }}
                className="px-8 py-4 text-white rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-lg"
              >
                Ver productos <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to={`/store/${config.slug}/productos`}
                className="px-8 py-4 rounded-xl font-bold border-2 transition-all hover:bg-slate-50"
                style={{ borderColor: config.primaryColor, color: config.primaryColor }}
              >
                Explorar catálogo
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Hero image / product showcase */}
        {products.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-16"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {products.slice(0, 4).map((p: any, i: number) => (
                <div key={p.id} className="rounded-2xl overflow-hidden shadow-md border border-slate-100 group">
                  <div className="aspect-video overflow-hidden bg-slate-100">
                    <img
                      src={p.image || `https://placehold.co/600x400/f1f5f9/64748b?text=${encodeURIComponent(p.name.slice(0, 12))}`}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
                      {p.category || "General"}
                    </p>
                    <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{p.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

/* ─── Course-style Product Card (tipo Teducas) ─── */
function CourseCard({ product, idx }: { product: any; idx: number }) {
  const { addToCart, config } = useStoreCart();
  const [paying, setPaying] = useState<string | null>(null);

  const handlePay = async (method: "mercadopago" | "paypal") => {
    if (config.slug == null || product.id == null) return;
    setPaying(method);
    try {
      await generateCheckout(config.slug, product.id, method);
    } catch {
      setPaying(null);
      alert("No se pudo generar el enlace de pago. Intenta de nuevo.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: idx * 0.06 }}
      className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
    >
      {/* Image 16:9 */}
      <div className="aspect-video overflow-hidden relative bg-slate-100">
        <img
          src={product.image || `https://placehold.co/600x400/f1f5f9/64748b?text=${encodeURIComponent(product.name.slice(0, 12))}`}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Level badge */}
        <div className="absolute top-3 left-3">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm">
            {product.category || "General"}
          </span>
        </div>
        {/* Kind badge */}
        <div className="absolute top-3 right-3">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${
            product.kind === "digital" ? "bg-blue-500" :
            product.kind === "physical" ? "bg-green-500" : "bg-purple-500"
          }`}>
            {product.kind === "digital" ? "Digital" : product.kind === "physical" ? "Físico" : "Drop"}
          </span>
        </div>
        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <PlayCircle className="w-7 h-7" style={{ color: config.primaryColor }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-slate-900 mb-2 group-hover:text-slate-600 transition-colors leading-tight line-clamp-2">{product.name}</h3>
        <p className="text-sm text-slate-400 line-clamp-2 mb-3 leading-relaxed">{product.description}</p>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className={`w-3.5 h-3.5 ${i < 5 ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
          ))}
          <span className="text-xs text-slate-400 ml-1">5.0</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <div>
            <span className="text-xl font-black text-slate-900">
              {Number(product.price).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 ml-1">{product.currency || "USD"}</span>
          </div>
          <button
            onClick={() => buyViaWhatsApp(config.whatsappPhone, product)}
            style={{ backgroundColor: config.primaryColor }}
            className="px-4 py-2.5 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all hover:shadow-lg active:scale-95 flex items-center gap-1.5"
          >
            <WhatsAppIcon className="w-4 h-4" /> WhatsApp
          </button>
        </div>

        {/* Payment buttons */}
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handlePay("mercadopago")}
              disabled={paying !== null}
              style={{ borderColor: config.primaryColor, color: config.primaryColor }}
              className="px-3 py-2 rounded-xl font-bold text-xs border-2 transition-all hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {paying === "mercadopago" ? "..." : "MercadoPago"}
            </button>
            <button
              onClick={() => handlePay("paypal")}
              disabled={paying !== null}
              style={{ borderColor: "#0070ba", color: "#0070ba" }}
              className="px-3 py-2 rounded-xl font-bold text-xs border-2 transition-all hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {paying === "paypal" ? "..." : "PayPal"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Category Card (tipo Teducas) ─── */
function CategoryCard({ title, count, slug, img, color }: any) {
  return (
    <Link to={`/store/${slug}/productos`} className="block group">
      <div className="rounded-2xl overflow-hidden relative h-56 shadow-md border border-slate-100">
        <img src={img} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-white/70 text-xs font-bold mb-1">{count} {count === 1 ? "producto" : "productos"}</p>
          <h3 className="text-xl font-black text-white">{title}</h3>
        </div>
        <div className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
          <BookOpen className="text-white w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}

export default function StoreHome() {
  const { products, config } = useStoreCart();
  const [layout, setLayout] = useState<unknown>(null);
  const [layoutLoading, setLayoutLoading] = useState(true);

  useEffect(() => {
    if (!config.slug) return;
    setLayoutLoading(true);
    fetch(`/api/store/${config.slug}/layout`)
      .then(r => r.json())
      .then(data => setLayout(data.layout))
      .catch(() => setLayout(null))
      .finally(() => setLayoutLoading(false));
  }, [config.slug]);

  if (layout && !layoutLoading) {
    return <StorePageRenderer layout={layout} />;
  }

  const categoryMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p: any) => {
      const cat = p.category || "General";
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).slice(0, 3);
  }, [products]);

  const featured = products.slice(0, 6);

  const catImages: Record<string, string> = {
    "Diseño Gráfico": "https://images.unsplash.com/photo-1626785774573-4b7997634a33?w=600&auto=format&fit=crop&q=60",
    "Idiomas": "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=60",
    "Música": "https://images.unsplash.com/photo-1521673252667-eca8606d609c?w=600&auto=format&fit=crop&q=60",
    "Tecnología": "https://images.unsplash.com/photo-1518770660439-463ea1933586?w=600&auto=format&fit=crop&q=60",
    "General": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&auto=format&fit=crop&q=60",
  };

  return (
    <div className="bg-white">
      <Hero />

      {/* Categories */}
      {categoryMap.length > 0 && (
        <section className="py-16 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <span className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: config.primaryColor }}>Explora</span>
              <h2 className="text-3xl md:text-4xl font-black text-slate-900">Categorías</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {categoryMap.map(([cat, count], i) => (
                <CategoryCard
                  key={cat}
                  title={cat}
                  count={count}
                  slug={config.slug}
                  img={catImages[cat] || catImages["General"]}
                  color={i === 0 ? config.primaryColor : i === 1 ? config.secondaryColor : config.primaryColor}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products - Course grid style */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: config.primaryColor }}>Destacados</span>
              <h2 className="text-3xl md:text-4xl font-black text-slate-900">Productos prácticos</h2>
              <p className="text-slate-500 mt-2">Paso a paso, sin conocimiento previo.</p>
            </div>
            <Link
              to={`/store/${config.slug}/productos`}
              className="hidden sm:flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105"
              style={{ backgroundColor: `${config.primaryColor}10`, color: config.primaryColor }}
            >
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((product, idx) => <CourseCard key={product.id} product={product} idx={idx} />)}
            {featured.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-400">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">No hay productos disponibles aún</p>
              </div>
            )}
          </div>
          {featured.length > 0 && (
            <div className="text-center mt-10">
              <Link
                to={`/store/${config.slug}/productos`}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all hover:scale-105 shadow-lg text-white"
                style={{ backgroundColor: config.primaryColor }}
              >
                Ver todos los productos <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Trust features bar */}
      <section className="py-12 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: ShieldCheck, title: "Pago Seguro", desc: "Certificado SSL" },
              { icon: Clock, title: "Acceso Inmediato", desc: "Tras la compra" },
              { icon: Users, title: "Soporte 24/7", desc: "Estamos para ayudarte" },
              { icon: Award, title: "Calidad Premium", desc: "Selección curada" },
            ].map((f, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm mb-3 border border-slate-100" style={{ color: config.primaryColor }}>
                  <f.icon className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">{f.title}</h4>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / Quote section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${config.primaryColor}15` }}>
            <svg className="w-8 h-8" style={{ color: config.primaryColor }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.017 21L14.017 14.375H18.458L19 10.5H14.017V8.042C14.017 6.922 14.584 6 15.917 6H19V2.625C19 2.625 17.75 2.5 16.458 2.5C13.75 2.5 11.5 4.25 11.5 7.5V10.5H7V14.375H11.5L11.5 21H14.017Z" />
            </svg>
          </div>
          <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed mb-6 italic">
            "Cuando lo que hacemos lo hacemos desde el corazón, no hay nada que te haga sentir mejor!"
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: config.primaryColor }}>
              {config.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="font-bold text-slate-900 text-sm">{config.name}</p>
              <p className="text-xs text-slate-400">CEO · {config.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Clean card */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}>
            <div className="px-8 md:px-16 py-12 md:py-16 text-center text-white relative">
              <h2 className="text-3xl md:text-4xl font-black mb-4">¿Listo para empezar?</h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                Explora nuestro catálogo completo y encuentra el producto perfecto para ti.
              </p>
              <Link
                to={`/store/${config.slug}/productos`}
                className="inline-flex items-center gap-2 bg-white px-8 py-4 rounded-xl font-bold hover:scale-105 transition-transform shadow-2xl"
                style={{ color: config.primaryColor }}
              >
                Ver productos <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: products.length, label: "Productos" },
              { value: categoryMap.length, label: "Categorías" },
              { value: "24/7", label: "Soporte" },
              { value: "100%", label: "Garantía" },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-3xl font-black" style={{ color: config.primaryColor }}>{s.value}</p>
                <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}