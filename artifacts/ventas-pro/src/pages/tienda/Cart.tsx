import { Link, useLocation } from "wouter";
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft, Package, Star, ShieldCheck, Truck, CreditCard, Lock, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { useStoreCart } from "./store-context";

export default function StoreCart() {
  const [location] = useLocation();
  const slug = location.split("/")[2];
  const { cart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal, config } = useStoreCart();

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-28 h-28 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
            <ShoppingCart className="w-14 h-14 text-indigo-300" />
          </div>
          <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">Carrito vacío</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Agrega productos desde la tienda y vuelve aquí para finalizar tu compra.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/store/${slug}/productos`}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-black text-white transition-all hover:scale-105 hover:shadow-xl"
              style={{ backgroundColor: config.primaryColor }}
            >
              <ArrowLeft className="w-5 h-5" /> VER PRODUCTOS
            </Link>
          </div>
          {/* Suggested */}
          <div className="mt-12 pt-8 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Métodos de pago</p>
            <div className="flex justify-center gap-4 text-slate-300">
              <CreditCard className="w-8 h-8" />
              <ShieldCheck className="w-8 h-8" />
              <Lock className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tighter uppercase">Carrito</h1>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                  {cartCount} items
                </span>
              </div>
              <p className="text-slate-400 text-sm">{cart.length} productos diferentes</p>
            </div>
            <Link
              to={`/store/${slug}/productos`}
              className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors px-4 py-2 rounded-xl hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" /> Seguir comprando
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex gap-5 hover:shadow-md transition-shadow"
              >
                <div className="w-24 h-24 rounded-xl bg-slate-50 overflow-hidden flex-shrink-0 border border-slate-100">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 m-auto text-slate-200 mt-8" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-bold text-slate-900">{item.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < 4 ? "fill-yellow-400 text-yellow-400" : "text-slate-200"}`} />
                        ))}
                        <span className="text-[10px] text-slate-400 ml-1">(4.8)</span>
                      </div>
                    </div>
                    <span className="text-xl font-black text-slate-900 flex-shrink-0 ml-2">
                      ${(Number(item.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    <Tag className="w-3 h-3 inline mr-1" />
                    {item.category} · ${Number(item.price).toFixed(2)} c/u
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-1 bg-slate-50">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-10 text-center font-bold text-sm text-slate-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-all font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Trust badges */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mt-6">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: ShieldCheck, label: "Compra Segura", desc: "SSL 256-bit" },
                  { icon: Truck, label: "Envío Gratis", desc: "En pedidos +$50" },
                  { icon: CreditCard, label: "Pagos Fáciles", desc: "Tarjetas y transferencia" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <b.icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{b.label}</p>
                      <p className="text-[10px] text-slate-400">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm sticky top-28 space-y-5">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Resumen</h3>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-bold text-slate-900">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Envío</span>
                  <div className="text-right">
                    <span className="font-bold text-green-600">Gratis</span>
                    {cartTotal < 50 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">Faltan ${(50 - cartTotal).toFixed(2)}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Impuestos</span>
                  <span className="font-medium text-slate-900">$0.00</span>
                </div>
                {cartTotal >= 50 && (
                  <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
                    <Truck className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-bold text-green-700">Envío gratis aplicado</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-bold text-slate-900">Total</span>
                  <span className="text-2xl font-black text-slate-900">${cartTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={() => {
                    const items = cart.map(i =>
                      `• ${i.name} x${i.quantity} = $${(Number(i.price) * i.quantity).toFixed(2)}`
                    ).join("\n");
                    const msg = encodeURIComponent(
                      `🛒 *Nuevo Pedido - ${config.name}*\n\n${items}\n\n*Subtotal: $${cartTotal.toFixed(2)}*\n*Envío: Gratis*\n*Total: $${cartTotal.toFixed(2)}*`
                    );
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                  }}
                  className="w-full py-4 rounded-xl font-black text-white transition-all hover:scale-[1.02] hover:shadow-xl mb-3 flex items-center justify-center gap-2"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  <ShoppingCart className="w-5 h-5" /> PEDIR POR WHATSAPP
                </button>

                <button
                  onClick={clearCart}
                  className="w-full py-3 rounded-xl font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-slate-200 text-sm"
                >
                  Vaciar carrito
                </button>
              </div>

              {/* Secure badge */}
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-50">
                <Lock className="w-3 h-3 text-slate-300" />
                <span className="text-[10px] text-slate-400">Compra 100% segura</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Bar */}
      <div className="bg-white border-t border-slate-100 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-400">
            <ShoppingCart className="w-4 h-4 inline mr-2 text-indigo-400" />
            {cartCount} productos en tu carrito
          </p>
          <div className="flex gap-3">
            <Link to={`/store/${slug}/productos`} className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
              Seguir comprando
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
