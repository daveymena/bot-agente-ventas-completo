import { placeholderImage, placeholderBanner } from "../lib/placeholder-image";
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { ArrowRight, Star, ShieldCheck, Zap, Globe, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductWizard from '../components/ProductWizard';
import { htmlToPlainText } from '../lib/rich-text';

const Hero = () => {
  const { config } = useStore();
  
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-slate-950 text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute top-0 -left-4 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl animate-blob" style={{ backgroundColor: config.primaryColor }}></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" style={{ backgroundColor: config.secondaryColor }}></div>
      </div>
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-8">
              <Zap className="w-4 h-4" style={{ color: config.primaryColor }} /> Nueva Colección 2024
            </div>
            <h1 className="text-6xl md:text-8xl font-black leading-none mb-8 uppercase">
              {config.storeName.split(' ')[0]} <br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to right, ${config.primaryColor}, ${config.secondaryColor})` }}>PREMIUM</span> <br />
              EXCLUSIVO.
            </h1>
            <p className="text-xl text-slate-300 mb-10 max-w-lg leading-relaxed">
              Descubre una selección exclusiva de productos diseñados por {config.storeName} para elevar tu estilo de vida y productividad.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link 
                to="/shop" 
                style={{ backgroundColor: config.primaryColor }}
                className="px-10 py-5 text-white rounded-full font-black hover:scale-105 transition-transform flex items-center gap-3 shadow-xl"
              >
                COMPRAR AHORA <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="relative hidden lg:block"
          >
            <div className="relative z-10 rounded-[3rem] overflow-hidden border-8 border-white/10 shadow-2xl">
              <img 
                src={config.heroImage || placeholderBanner("Tu tienda")} 
                alt="Hero Product"
                className="w-full h-[600px] object-cover"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// FeatureCard removido por uso de componente inline en la nueva estructura

const ProductCard = ({ product }: { product: any }) => {
  const { addToCart } = useStore();

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group"
    >
      <div className="aspect-square overflow-hidden relative">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-4 right-4">
           <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
             product.type === 'digital' ? 'bg-blue-100 text-blue-700' :
             product.type === 'physical' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
           }`}>
             {product.type}
           </span>
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          ))}
          <span className="text-xs text-gray-400 ml-1">(4.8)</span>
        </div>
        <h3 className="font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
          {product.name}
        </h3>
        <p className="text-gray-500 text-xs line-clamp-2 mb-4">
          {htmlToPlainText(product.description || '')}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">${product.price}</span>
          <button
            onClick={() => addToCart(product)}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const CategoryCard = ({ title, img, count, type }: any) => (
  <Link to={`/category/${type}`} className="relative group overflow-hidden rounded-3xl h-80 flex items-end p-8">
    <img src={img} alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent"></div>
    <div className="relative z-10">
      <p className="text-white/60 text-sm font-bold mb-1">{count} Productos</p>
      <h3 className="text-2xl font-black text-white">{title}</h3>
    </div>
  </Link>
);

const Home = () => {
  const { products, config } = useStore();

  return (
    <div className="pb-0" style={{ fontFamily: config.fontFamily }}>
      {config.showHero && <Hero />}

      {/* Categories Grid */}
      {config.showCategories && (
        <section className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-950 mb-4 tracking-tighter">EXPLORA CATEGORÍAS</h2>
                <p className="text-slate-500 text-lg">Lo mejor de la industria en un solo lugar.</p>
              </div>
              <Link to="/shop" className="px-8 py-3 border-2 border-slate-950 rounded-full font-bold hover:bg-slate-950 hover:text-white transition-all">
                VER TODO
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <CategoryCard 
                title="Digital Pro" 
                type="digital" 
                count="24"
                img={placeholderImage("Digital Pro")} 
              />
              <CategoryCard 
                title="Equipamiento" 
                type="physical" 
                count="150+"
                img={placeholderImage("Equipamiento")} 
              />
              <CategoryCard 
                title="Gadgets" 
                type="dropshipping" 
                count="89"
                img={placeholderImage("Gadgets")} 
              />
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            {[
              { icon: ShieldCheck, title: "Pagos 100% Seguros", desc: "Certificado SSL y pasarelas oficiales" },
              { icon: Globe, title: "Envío Global", desc: "Llegamos a cualquier rincón del mundo" },
              { icon: Zap, title: "Entrega Inmediata", desc: "Para todos nuestros productos digitales" },
              { icon: Star, title: "Calidad Premium", desc: "Selección curada de los mejores artículos" }
            ].map((f, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
                  <f.icon className="w-8 h-8" style={{ color: config.primaryColor }} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Branch Selector & Search Highlight */}
      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-slate-50 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                <MapPin style={{ color: config.primaryColor }} className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sucursal Actual</p>
                <select 
                  className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
                  onChange={(e) => useStore.getState().setBranch(e.target.value)}
                  value={useStore.getState().activeBranch || ''}
                >
                  {useStore.getState().branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} - {b.city}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="h-10 w-[1px] bg-slate-200 hidden md:block"></div>
            <div className="flex-grow max-w-md">
               <p className="text-sm text-slate-500 italic">"Entregas en tiempo récord para {useStore.getState().branches.find(b => b.id === useStore.getState().activeBranch)?.city}"</p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Wizard Section */}
      {config.showWizard && (
        <section className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <ProductWizard />
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl font-black text-slate-950 mb-4 tracking-tighter uppercase">Productos Destacados</h2>
              <p className="text-slate-500">Nuestra selección curada para esta temporada.</p>
            </div>
            <Link to="/shop" className="px-6 py-2 border-2 border-slate-950 rounded-full text-sm font-bold hover:bg-slate-950 hover:text-white transition-all">
              VER TODO
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.slice(0, 3).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* Dropshipping/CTA Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-indigo-900 rounded-[2rem] p-8 md:p-16 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full opacity-10">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0 0 L100 0 L100 100 L0 100 Z" fill="url(#grid)" />
                  <defs>
                    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                </svg>
             </div>
             <div className="relative z-10 max-w-2xl">
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6">
                  ¿Tienes productos para vender?
                </h2>
                <p className="text-indigo-100 text-lg mb-8">
                  Nuestra plataforma permite gestionar inventarios complejos y automatizar procesos de dropshipping con un solo clic.
                </p>
                <button className="bg-white text-indigo-900 px-8 py-4 rounded-xl font-extrabold hover:bg-indigo-50 transition-colors">
                  Empezar ahora
                </button>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
