import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Star, ShieldCheck, Zap, Globe, Package, Sparkles, TrendingUp, Award } from "lucide-react";
import { useStoreCart } from "./store-context";
import { StorePageRenderer } from "./StorePageRenderer";

function Hero() {
  const { config, products } = useStoreCart();
  const catCount = useMemo(() => new Set(products.map((p: any) => p.category).filter(Boolean)).size, [products]);

  return (
    <section className="relative min-h-[88vh] flex items-center overflow-hidden bg-slate-950 text-white">
      {/* Animated brand-colored blobs */}
      <div className="absolute inset-0 z-0 opacity-50">
        <div className="absolute top-0 -left-4 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl animate-blob" style={{ backgroundColor: config.primaryColor }} />
        <div className="absolute top-0 -right-4 w-96 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" style={{ backgroundColor: config.secondaryColor }} />
        <div className="absolute -bottom-8 left-20 w-96 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" style={{ backgroundColor: config.primaryColor }} />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(${config.primaryColor} 1px, transparent 1px), linear-gradient(90deg, ${config.primaryColor} 1px, transparent 1px)`,
        backgroundSize: "50px 50px",
      }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold uppercase tracking-widest mb-8" style={{ color: config.primaryColor }}>
              <Sparkles className="w-4 h-4" /> {products.length > 0 ? `${products.length} Productos Disponibles` : "Bienvenido"}
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[0.95] mb-6 uppercase tracking-tight">
              {config.name}
            </h1>
            <p className="text-xl text-slate-300 mb-10 max-w-lg leading-relaxed">
              {products.length > 0
                ? `Descubre nuestra colección de ${products.length} productos en ${catCount} ${catCount === 1 ? "categoría" : "categorías"}. Calidad premium, entrega inmediata.`
                : "Tu tienda de productos digitales y físicos con entrega inmediata y soporte 24/7."}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to={`/store/${config.slug}/productos`}
                style={{ backgroundColor: config.primaryColor }}
                className="px-10 py-5 text-white rounded-full font-black hover:scale-105 transition-transform flex items-center gap-3 shadow-xl"
              >
                EXPLORAR CATÁLOGO <ArrowRight className="w-5 h-5" />
              </Link>
              {config.logo && (
                <div className="px-6 py-5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5" style={{ color: config.secondaryColor }} />
                  <span className="text-sm font-bold text-slate-200">Compra Segura</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Product showcase mosaic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="relative hidden lg:block"
          >
            <div className="grid grid-cols-2 gap-4">
              {products.slice(0, 4).map((p: any, i: number) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className={`rounded-3xl overflow-hidden border-4 border-white/10 shadow-2xl ${i % 2 === 0 ? "translate-y-8" : ""}`}
                >
                  <img
                    src={p.image || `https://placehold.co/400x400/${config.primaryColor.replace("#", "")}/ffffff?text=${encodeURIComponent(p.name.slice(0, 10))}`}
                    alt={p.name}
                    className="w-full h-48 object-cover"
                  />
                </motion.div>
              ))}
              {products.length === 0 && (
                <div className="col-span-2 rounded-3xl border-4 border-white/10 shadow-2xl overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1556745757-8d76bdb798a5?w=800&auto=format&fit=crop&q=80" alt="Store" className="w-full h-96 object-cover" />
                </div>
              )}
            </div>
            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2 }}
              className="absolute -top-4 -right-4 z-20 bg-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-2"
            >
              <Award className="w-6 h-6" style={{ color: config.primaryColor }} />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold leading-none mb-1">Tienda</p>
                <p className="text-sm font-black text-slate-900 leading-none">Premium</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Wave divider */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <svg viewBox="0 0 1440 120" className="w-full h-auto" preserveAspectRatio="none">
          <path d="M0 60L60 50C120 40 240 20 360 20C480 20 600 40 720 50C840 60 960 60 1080 50C1200 40 1320 20 1380 10L1440 0V120H0Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}

function ProductCardMini({ product }: { product: any }) {
  const { addToCart, config } = useStoreCart();

  return (
    <motion.div whileHover={{ y: -6 }} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group">
      <div className="aspect-square overflow-hidden relative bg-slate-50">
        <img
          src={product.image || `https://placehold.co/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name.slice(0, 12))}`}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-3 right-3">
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm ${
            product.kind === "digital" ? "bg-blue-500/90 text-white" :
            product.kind === "physical" ? "bg-green-500/90 text-white" : "bg-purple-500/90 text-white"
          }`}>
            {product.kind === "digital" ? "Digital" : product.kind === "physical" ? "Físico" : "Drop"}
          </span>
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-bold text-slate-900 mb-1 group-hover:text-slate-600 transition-colors leading-tight line-clamp-1">{product.name}</h3>
        <p className="text-gray-400 text-xs line-clamp-2 mb-4">{product.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-black text-slate-900">
            {product.currency === "COP" ? "$" : product.currency === "USD" ? "$" : ""}
            {Number(product.price).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
          <button
            onClick={() => addToCart(product)}
            style={{ backgroundColor: config.primaryColor }}
            className="p-2.5 text-white rounded-xl hover:opacity-90 transition-all hover:shadow-lg active:scale-95"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CategoryCard({ title, count, type, slug, img, color }: any) {
  return (
    <Link to={`/store/${slug}/productos`} className="relative group overflow-hidden rounded-3xl h-72 flex items-end p-8 block">
      <img src={img} alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
      <div className="absolute top-4 right-4 w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
        <Package className="text-white w-5 h-5" />
      </div>
      <div className="relative z-10">
        <p className="text-white/60 text-sm font-bold mb-1">{count} {count === 1 ? "Producto" : "Productos"}</p>
        <h3 className="text-2xl font-black text-white">{title}</h3>
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

  // If custom layout exists, render it
  if (layout && !layoutLoading) {
    return <StorePageRenderer layout={layout} />;
  }

  // Dynamic categories from real products
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
    <div>
      <Hero />

      {/* Categories - Dynamic */}
      {categoryMap.length > 0 && (
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-950 mb-3 tracking-tighter">EXPLORA CATEGORÍAS</h2>
                <p className="text-slate-500 text-lg">Encuentra exactamente lo que buscas.</p>
              </div>
              <Link to={`/store/${config.slug}/productos`} className="px-8 py-3 border-2 rounded-full font-bold hover:text-white transition-all" style={{ borderColor: config.primaryColor, color: config.primaryColor, ":hover": { backgroundColor: config.primaryColor } } as any}>
                VER TODO
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {categoryMap.map(([cat, count], i) => (
                <CategoryCard
                  key={cat}
                  title={cat}
                  count={count}
                  type={`categoria/${cat}`}
                  slug={config.slug}
                  img={catImages[cat] || catImages["General"]}
                  color={i === 0 ? config.primaryColor : i === 1 ? config.secondaryColor : config.primaryColor}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust Features */}
      <section className="py-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: ShieldCheck, title: "Pagos Seguros", desc: "Certificado SSL y pasarelas oficiales" },
              { icon: Globe, title: "Acceso Global", desc: "Disponible desde cualquier dispositivo" },
              { icon: Zap, title: "Entrega Inmediata", desc: "Productos digitales al instante" },
              { icon: Award, title: "Calidad Premium", desc: "Selección curada de los mejores productos" },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 border border-slate-100" style={{ color: config.primaryColor }}>
                  <f.icon className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl font-black text-slate-950 mb-3 tracking-tighter uppercase">Productos Destacados</h2>
              <p className="text-slate-500">Los favoritos de nuestros clientes.</p>
            </div>
            <Link
              to={`/store/${config.slug}/productos`}
              className="px-6 py-2.5 border-2 rounded-full text-sm font-bold transition-all hover:text-white"
              style={{ borderColor: config.primaryColor, color: config.primaryColor, backgroundColor: "transparent" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = config.primaryColor}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              VER TODO
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((product) => <ProductCardMini key={product.id} product={product} />)}
            {featured.length === 0 && (
              <div className="col-span-full text-center py-16 text-slate-400">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No hay productos disponibles aún</p>
                <p className="text-sm mt-2">Los productos aparecerán aquí cuando se agreguen al catálogo.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA - Brand colored */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-[2.5rem] p-8 md:p-16 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}>
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full filter blur-3xl opacity-20" style={{ backgroundColor: "white" }} />
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6">
                ¿Listo para empezar?
              </h2>
              <p className="text-white/80 text-lg mb-8">
                Explora nuestro catálogo completo y encuentra el producto perfecto para ti. Acceso inmediato tras la compra.
              </p>
              <Link
                to={`/store/${config.slug}/productos`}
                className="inline-flex items-center gap-3 bg-white px-8 py-4 rounded-xl font-extrabold hover:scale-105 transition-transform shadow-2xl"
                style={{ color: config.primaryColor }}
              >
                VER PRODUCTOS <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-12 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: products.length, label: "Productos" },
              { value: categoryMap.length, label: "Categorías" },
              { value: "24/7", label: "Soporte" },
              { value: "100%", label: "Garantía" },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-3xl md:text-4xl font-black" style={{ color: config.primaryColor }}>{s.value}</p>
                <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}