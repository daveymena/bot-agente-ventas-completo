import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ChevronLeft, CreditCard, Lock, Package, MessageCircle, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { trackInitiateCheckout, trackContact } from '../lib/pixel';

export default function Checkout() {
  const { cart, clearCart } = useStore();
  const { slug: paramSlug } = useParams();
  const slug = paramSlug || 'sofia-premium';
  const navigate = useNavigate();
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [isProcessing, setIsProcessing] = useState<'mp' | 'pp' | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);

  useEffect(() => {
    if (cart.length === 0) {
      navigate(`/tienda/${slug}/cart`);
    }
  }, [cart, navigate, slug]);

  useEffect(() => {
    fetch(`/api/public/whatsapp-info/${slug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d?.phone && setWaPhone(d.phone))
      .catch(() => {});
  }, [slug]);

  const handleCheckout = async (method: 'mp' | 'pp') => {
    if (!formData.name.trim() || !formData.email.trim()) {
      Swal.fire({
        title: 'Faltan datos',
        text: 'Por favor, ingresa tu nombre y correo para continuar.',
        icon: 'warning'
      });
      return;
    }

    setIsProcessing(method);
    const gateway = method === 'mp' ? 'mercadopago' : 'paypal';
    trackInitiateCheckout({ ids: cart.map(i => i.id), value: subtotal });

    try {
      const res = await fetch(`/api/public/checkout-cart/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: gateway,
          items: cart.map(i => ({ productId: Number(i.id), quantity: i.quantity })),
          customer: formData 
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.message || 'No se pudo generar el enlace de pago');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setIsProcessing(null);
      Swal.fire({
        title: 'No pudimos abrir el pago',
        text: err instanceof Error ? err.message : 'Intenta de nuevo en un momento.',
        icon: 'error',
      });
    }
  };

  const handleWhatsAppOrder = () => {
    if (!waPhone) return;
    if (!formData.name.trim()) {
      Swal.fire({ title: 'Faltan datos', text: 'Ingresa al menos tu nombre para continuar.', icon: 'warning' });
      return;
    }

    const orderText = `Hola, soy ${formData.name}. Me gustaría completar mi pedido de:\n\n${cart.map(i => `- ${i.quantity}x ${i.name} ($${i.price})`).join('\n')}\n\nTotal: $${subtotal}\n\nPor favor envíenme instrucciones de pago manual.`;
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(orderText)}`;
    
    trackContact({ content_name: 'Cart WhatsApp Checkout' });
    
    // Clear cart since order is passed to WA
    clearCart();
    
    window.open(url, '_blank');
    navigate(`/tienda/${slug}`);
  };

  if (cart.length === 0) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
      <div className="mb-8 flex items-center gap-2">
        <Link to={`/tienda/${slug}/carrito`} className="text-gray-400 hover:text-indigo-400 transition-colors bg-white/5 p-2 rounded-xl border border-white/10">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-heading font-extrabold text-white tracking-tight">Finalizar Compra</h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
        <div className="space-y-8">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl">
            <h2 className="text-xl font-heading font-bold text-white mb-6 flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-400" /> Tus Datos Seguros
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Nombre Completo *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition-all shadow-sm placeholder-slate-400"
                  placeholder="Ej. Juan Pérez"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Correo Electrónico *</label>
                <input
                  type="email"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition-all shadow-sm placeholder-slate-400"
                  placeholder="tu@email.com (Para enviarte el acceso)"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">WhatsApp (Opcional)</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition-all shadow-sm placeholder-slate-400"
                  placeholder="+57 300 000 0000"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-5">
            <h2 className="text-xl font-heading font-bold text-white mb-4">Método de Pago</h2>
            <button
              onClick={() => handleCheckout('mp')}
              disabled={isProcessing !== null}
              className="w-full bg-[#009EE3] hover:bg-[#0088c4] text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 shadow-lg shadow-[#009EE3]/20"
            >
              <CreditCard className="w-5 h-5" />
              {isProcessing === 'mp' ? 'Abriendo MercadoPago…' : 'Pagar Seguro con MercadoPago'}
            </button>
            <button
              onClick={() => handleCheckout('pp')}
              disabled={isProcessing !== null}
              className="w-full bg-[#FFC439] hover:bg-[#eab308] text-[#003087] py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 shadow-lg shadow-[#FFC439]/20"
            >
              {isProcessing === 'pp' ? 'Abriendo PayPal…' : 'Pagar con PayPal'}
            </button>

            {waPhone && (
              <>
                <div className="relative py-4 flex items-center">
                  <div className="flex-grow border-t border-white/10" />
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Transferencia Manual</span>
                  <div className="flex-grow border-t border-white/10" />
                </div>
                <button
                  onClick={handleWhatsAppOrder}
                  className="w-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-4 rounded-xl font-bold hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2.5 shadow-glow"
                >
                  <MessageCircle className="w-5 h-5" />
                  Acordar pago por WhatsApp
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="glass-panel p-6 sm:p-8 rounded-3xl sticky top-28">
            <h2 className="text-xl font-heading font-bold text-white mb-6 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-400" /> Resumen de tu pedido
            </h2>
            <div className="space-y-4 mb-8">
              {cart.map(item => (
                <div key={item.id} className="flex gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover opacity-90" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-heading font-semibold text-gray-200 text-sm leading-tight mb-2 line-clamp-2">{item.name}</h4>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-medium">Cant: {item.quantity}</span>
                      <span className="font-bold text-white">${Math.round(item.price).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t border-white/10 pt-6 space-y-4">
              <div className="flex justify-between text-sm text-gray-400 font-medium">
                <span>Subtotal</span>
                <span>${Math.round(subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-400 font-bold">
                <span>Envío (Digital)</span>
                <span>Gratis</span>
              </div>
              <div className="flex justify-between text-2xl font-heading font-black text-white pt-4 border-t border-white/10">
                <span>Total a Pagar</span>
                <span>${Math.round(subtotal).toLocaleString()}</span>
              </div>
            </div>
            
            <div className="mt-8 flex items-start gap-3 bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20 shadow-glow">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-200/80 font-medium leading-relaxed">
                Pago 100% seguro. Tus datos están protegidos. El acceso a tus productos se enviará al correo proporcionado inmediatamente después de confirmar el pago.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

