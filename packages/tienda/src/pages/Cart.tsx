import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Trash2, Plus, Minus, CreditCard, ChevronLeft, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';

const Cart = () => {
  const { cart, updateCartQuantity, removeFromCart } = useStore();
  const { slug: paramSlug } = useParams();
  const slug = paramSlug || 'demo';
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const [isProcessing, setIsProcessing] = useState(false);
  // Número real conectado al bot por QR — no uno fijo en el código, que queda
  // obsoleto en cuanto se escanea otro teléfono.
  const [waPhone, setWaPhone] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/whatsapp-info/${slug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d?.phone && setWaPhone(d.phone))
      .catch(() => {});
  }, [slug]);

  // Pide a la API el enlace de pago (la API lo crea contra MercadoPago/PayPal
  // con los precios de la base de datos) y manda al cliente a la pasarela.
  const handleCheckout = async (method: 'mp' | 'pp') => {
    setIsProcessing(true);
    const gateway = method === 'mp' ? 'mercadopago' : 'paypal';

    try {
      const res = await fetch(`/api/public/checkout-cart/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: gateway,
          items: cart.map(i => ({ productId: Number(i.id), quantity: i.quantity })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.message || 'No se pudo generar el enlace de pago');
      }

      // El carrito NO se vacía aquí: el pago aún no ocurrió. Si se limpiara
      // ahora y el cliente cancelara en la pasarela, perdería su selección.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setIsProcessing(false);
      Swal.fire({
        title: 'No pudimos abrir el pago',
        text: err instanceof Error ? err.message : 'Intenta de nuevo en un momento.',
        icon: 'error',
      });
    }
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trash2 className="w-10 h-10 text-indigo-300" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Tu carrito está vacío</h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">Parece que aún no has añadido nada. ¡Explora nuestra tienda y encuentra algo genial!</p>
        <Link to="/shop" className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors">
          Ir a la Tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center gap-2 mb-8">
        <Link to="/shop" className="text-gray-400 hover:text-indigo-600">
           <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900">Carrito de Compras</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-6">
          {cart.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-6">
              <img src={item.image} alt={item.name} className="w-24 h-24 rounded-xl object-cover" />
              <div className="flex-grow">
                <div className="flex justify-between mb-1">
                  <h3 className="font-bold text-gray-900">{item.name}</h3>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{item.category} • {item.type}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                      className="p-2 hover:bg-gray-50 text-gray-500 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2 text-sm font-bold text-gray-900">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                      className="p-2 hover:bg-gray-50 text-gray-500 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="font-bold text-lg text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Resumen del Pedido</h3>
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Envío</span>
                <span className="text-green-600 font-bold uppercase text-xs">Gratis</span>
              </div>
              <div className="h-[1px] bg-gray-100"></div>
              <div className="flex justify-between text-xl font-extrabold text-gray-900">
                <span>Total</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                disabled={isProcessing}
                onClick={() => handleCheckout('mp')}
                className="w-full bg-[#009EE3] text-white py-4 rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <CreditCard className="w-5 h-5" />
                Pagar con Mercado Pago
              </button>
              <button
                disabled={isProcessing}
                onClick={() => handleCheckout('pp')}
                className="w-full bg-[#FFC439] text-[#003087] py-4 rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" className="h-5" alt="PayPal" />
                Pagar con PayPal
              </button>

              <div className="relative py-4 flex items-center">
                <div className="flex-grow border-t border-gray-100"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-[10px] font-bold">O CONTINUAR CON AGENTE</span>
                <div className="flex-grow border-t border-gray-100"></div>
              </div>

              <button
                disabled={!waPhone}
                onClick={() => {
                  if (!waPhone) return;
                  const message = `Hola! Quiero confirmar mi pedido:\n\n${cart.map(i => `- ${i.name} x${i.quantity}`).join('\n')}\n\nTotal: $${subtotal.toFixed(2)}`;
                  window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, '_blank');
                }}
                className="w-full bg-green-500 text-white py-4 rounded-xl font-bold hover:bg-green-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.588-5.946 0-6.556 5.332-11.888 11.888-11.888 3.176 0 6.161 1.237 8.404 3.48s3.48 5.228 3.48 8.404c0 6.556-5.332 11.888-11.888 11.888-2.013 0-3.987-.511-5.733-1.483l-6.25 1.638zm6.052-4.041c1.517.899 3.111 1.373 4.743 1.373 5.011 0 9.088-4.077 9.088-9.088 0-2.427-.945-4.709-2.662-6.426s-3.999-2.662-6.426-2.662c-5.011 0-9.088 4.077-9.088 9.088 0 1.748.498 3.454 1.442 4.939l-.953 3.484 3.571-.937zm10.749-6.393c-.275-.138-1.63-.804-1.882-.896-.252-.092-.437-.138-.62.138s-.713.896-.874 1.079-.321.207-.596.069c-.275-.138-1.163-.428-2.215-1.366-.819-.731-1.372-1.633-1.533-1.908-.16-.275-.017-.424.12-.561.124-.123.275-.321.412-.482.138-.161.184-.275.275-.459.092-.184.046-.344-.023-.482-.069-.138-.62-1.493-.849-2.044-.223-.537-.468-.464-.639-.473-.163-.009-.348-.011-.533-.011s-.486.069-.74.344c-.253.275-.964.941-.964 2.296s.987 2.662 1.124 2.846c.138.184 1.942 2.964 4.704 4.156.657.283 1.17.452 1.57.579.66.21 1.26.181 1.735.11.529-.078 1.63-.665 1.859-1.308.229-.643.229-1.194.161-1.308-.069-.113-.253-.182-.528-.32z"/></svg>
                Confirmar por WhatsApp
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-gray-400 text-[10px] font-bold uppercase tracking-widest">
              <Lock className="w-3 h-3" />
              Pago Encriptado y Seguro
            </div>
          </div>

          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
             <h4 className="font-bold text-indigo-900 text-sm mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Compra Protegida
             </h4>
             <p className="text-xs text-indigo-700 leading-relaxed">
                Recibe el producto que esperabas o te devolvemos tu dinero. Seguridad garantizada por ProStore.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
