import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Trash2, Plus, Minus, ChevronLeft, Lock } from 'lucide-react';

const Cart = () => {
  const { cart, updateCartQuantity, removeFromCart } = useStore();
  const { slug: paramSlug } = useParams();
  const navigate = useNavigate();
  const slug = paramSlug || 'sofia-premium';
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  if (cart.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trash2 className="w-10 h-10 text-[var(--store-primary)]/60" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Tu carrito está vacío</h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">Parece que aún no has añadido nada. ¡Explora nuestra tienda y encuentra algo genial!</p>
        <Link to={`/tienda/${slug}`} className="inline-flex items-center gap-2 bg-[var(--store-primary)] text-[var(--store-on-primary)] px-8 py-4 rounded-xl font-bold hover:bg-[var(--store-primary-hover)] transition-colors">
          Ir a la Tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center gap-2 mb-8">
        <Link to={`/tienda/${slug}`} className="text-gray-400 hover:text-[var(--store-primary)]">
           <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900">Carrito de Compras</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-6">
          {cart.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-6">
              <img src={item.image} alt={item.name} className="w-24 h-24 rounded-xl object-contain bg-gray-50 p-1" />
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
                <p className="text-gray-500 text-sm mb-4">{item.category || 'Producto'}</p>
                <div className="flex items-center justify-between">
                  {/* Un curso digital no se compra "de a 3": es un acceso, no
                      una caja. Se veía en vivo un carrito con "Cant: 3" del
                      curso de piano por $180.000 -- el cliente paga el triple
                      por exactamente el mismo enlace de acceso, y después
                      reclama con razón. Peor: si igual paga, hay que
                      devolverle plata. Para lo físico el selector sigue igual. */}
                  {item.type === 'digital' ? (
                    <span className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      Acceso digital · 1 licencia
                    </span>
                  ) : (
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateCartQuantity(item.id, Math.max(1, item.quantity - 1))}
                      className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                      className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  )}
                  <span className="font-bold text-lg text-gray-900">
                    ${Math.round(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Resumen</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${Math.round(subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Envío</span>
                <span className="text-green-600 font-medium">Gratis</span>
              </div>
              <div className="pt-4 border-t border-gray-200 flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-black text-gray-900">
                  ${Math.round(subtotal).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate(`/tienda/${slug}/checkout`)}
                className="w-full bg-[var(--store-primary)] text-[var(--store-on-primary)] py-4 rounded-xl font-bold hover:bg-[var(--store-primary-hover)] transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" /> Finalizar Compra Segura
              </button>
            </div>
            
            <div className="mt-6 flex items-start gap-3 bg-white p-4 rounded-xl border border-gray-100">
              <Lock className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500 leading-relaxed">
                Tus datos están protegidos. El pago se procesará de forma segura en el siguiente paso.
              </p>
            </div>
          </div>

          <div className="bg-[var(--store-primary)]/10 p-6 rounded-2xl border border-[var(--store-primary)]/20">
             <h4 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--store-primary)]" /> Compra Protegida
             </h4>
             <p className="text-xs text-gray-700 leading-relaxed">
                Recibe el producto que esperabas o te devolvemos tu dinero. Seguridad garantizada por ProStore.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
