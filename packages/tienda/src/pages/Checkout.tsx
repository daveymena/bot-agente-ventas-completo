import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ChevronLeft, CreditCard, Lock, Package, MessageCircle, ShieldCheck, Truck, CheckCircle2, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';
import { trackInitiateCheckout, trackContact } from '../lib/pixel';
import { useMoneda } from '@/lib/moneda';
import {
  DatosDeEnvio, ENVIO_VACIO, ETIQUETAS, DEPARTAMENTOS,
  CIUDADES_POR_DEPARTAMENTO,
  faltantes, errorDeFormato, departamentoDeCiudad,
} from '../lib/envio';

/** Un producto de dropshipping es físico: se despacha y se paga al recibir. */
const esFisico = (tipo: string) => tipo === 'physical' || tipo === 'dropshipping';

export default function Checkout() {
  const { cart, clearCart } = useStore();
  const { formatear } = useMoneda();
  const { slug: paramSlug } = useParams();
  const slug = paramSlug || 'sofia-premium';
  const navigate = useNavigate();
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // Qué hay en el carrito decide TODO el checkout: un producto físico en
  // Colombia se paga contra entrega (al mensajero), y para eso hay que pedirle
  // dirección y cédula al cliente. Un curso se paga en línea y solo necesita
  // un correo a dónde mandarlo. Antes había un único formulario digital, así
  // que un pedido físico no tenía forma de completarse: nunca se le pedía a
  // dónde enviarlo.
  const hayFisicos = cart.some(i => esFisico(i.type));
  const hayDigitales = cart.some(i => !esFisico(i.type));
  const mixto = hayFisicos && hayDigitales;

  const [datosDigital, setDatosDigital] = useState({ name: '', email: '', phone: '' });
  const [envio, setEnvio] = useState<DatosDeEnvio>(ENVIO_VACIO);
  const [isProcessing, setIsProcessing] = useState<'mp' | 'pp' | 'cod' | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ pedidos: { id: number; producto: string }[]; total: number } | null>(null);

  useEffect(() => {
    if (cart.length === 0 && !confirmado) {
      navigate(`/tienda/${slug}/carrito`);
    }
  }, [cart, navigate, slug, confirmado]);

  useEffect(() => {
    fetch(`/api/public/whatsapp-info/${slug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d?.phone && setWaPhone(d.phone))
      .catch(() => {});
  }, [slug]);

  const faltan = useMemo(() => faltantes(envio), [envio]);

  const setCampo = (campo: keyof DatosDeEnvio, valor: string) => {
    setEnvio(prev => {
      const siguiente = { ...prev, [campo]: valor };
      // Si escriben una ciudad grande, el departamento se completa solo: un
      // campo menos y un origen menos de error al despachar.
      if (campo === 'ciudad' && !prev.departamento) {
        const depto = departamentoDeCiudad(valor);
        if (depto) siguiente.departamento = depto;
      }
      // Si cambian de departamento y la ciudad actual no pertenece al nuevo,
      // se limpia: así no queda "Medellín" con "Valle del Cauca".
      if (campo === 'departamento' && prev.ciudad) {
        const ciudadesDelNuevo = CIUDADES_POR_DEPARTAMENTO[valor] || [];
        if (ciudadesDelNuevo.length && !ciudadesDelNuevo.includes(prev.ciudad)) {
          siguiente.ciudad = '';
        }
      }
      return siguiente;
    });
  };

  // ── CONTRA ENTREGA ────────────────────────────────────────────────────────
  const confirmarContraentrega = async () => {
    if (faltan.length > 0) {
      Swal.fire({
        title: 'Faltan datos para el envío',
        text: `Necesitamos: ${faltan.map(f => ETIQUETAS[f].toLowerCase()).join(', ')}.`,
        icon: 'warning',
      });
      return;
    }
    const errFormato = errorDeFormato(envio);
    if (errFormato) {
      Swal.fire({ title: 'Revisa estos datos', text: errFormato, icon: 'warning' });
      return;
    }

    setIsProcessing('cod');
    trackInitiateCheckout({ ids: cart.map(i => i.id), value: subtotal });

    try {
      const res = await fetch(`/api/public/checkout-cart/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'contraentrega',
          items: cart.map(i => ({ productId: Number(i.id), quantity: i.quantity, variante: i.variante || undefined })),
          customer: envio,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || 'No pudimos registrar el pedido');
      }

      // No hay redirección a pasarela: no hay nada que pagar ahora. Se muestra
      // la confirmación acá mismo y se vacía el carrito.
      setConfirmado({ pedidos: data.pedidos || [], total: data.total ?? subtotal });
      clearCart();
    } catch (err) {
      Swal.fire({
        title: 'No pudimos registrar tu pedido',
        text: err instanceof Error ? err.message : 'Intenta de nuevo en un momento.',
        icon: 'error',
      });
    } finally {
      setIsProcessing(null);
    }
  };

  // ── PAGO EN LÍNEA (digital) ───────────────────────────────────────────────
  const handleCheckout = async (method: 'mp' | 'pp') => {
    if (!datosDigital.name.trim() || !datosDigital.email.trim()) {
      Swal.fire({
        title: 'Faltan datos',
        text: 'Por favor, ingresa tu nombre y correo para continuar.',
        icon: 'warning',
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
          items: cart.map(i => ({ productId: Number(i.id), quantity: i.quantity, variante: i.variante || undefined })),
          customer: datosDigital,
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
    const nombre = hayFisicos ? envio.nombre : datosDigital.name;
    if (!nombre.trim()) {
      Swal.fire({ title: 'Faltan datos', text: 'Ingresa al menos tu nombre para continuar.', icon: 'warning' });
      return;
    }

    const orderText = `Hola, soy ${nombre}. Me gustaría completar mi pedido de:\n\n${cart.map(i => `- ${i.quantity}x ${i.name}${i.variante ? ` (${i.variante})` : ''} (${formatear(i.price)})`).join('\n')}\n\nTotal: ${formatear(subtotal)}`;
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(orderText)}`;

    trackContact('Cart WhatsApp Checkout');
    clearCart();
    window.open(url, '_blank');
    navigate(`/tienda/${slug}`);
  };

  // ── CONFIRMACIÓN DE PEDIDO CONTRA ENTREGA ─────────────────────────────────
  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-3">Pedido confirmado</h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          Lo despachamos a <strong className="text-gray-900">{envio.direccion}</strong>, {envio.ciudad}.
          Pagas <strong className="text-gray-900">{formatear(confirmado.total)}</strong> en efectivo cuando lo recibas.
        </p>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-left mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Tu pedido</p>
          {confirmado.pedidos.map(p => (
            <div key={p.id} className="flex justify-between py-2 text-sm border-b border-gray-100 last:border-0">
              <span className="text-gray-700">{p.producto}</span>
              <span className="text-gray-400 font-mono">#{p.id}</span>
            </div>
          ))}
        </div>
        <Link
          to={`/tienda/${slug}`}
          className="inline-flex h-12 px-8 items-center rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary)] font-bold hover:bg-[var(--store-primary-hover)] transition-all"
        >
          Seguir comprando
        </Link>
      </div>
    );
  }

  if (cart.length === 0) return null;

  const inputCls =
    'w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[var(--store-primary)]/30 focus:border-[var(--store-primary)] outline-none transition-all shadow-sm placeholder-gray-400';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-2">
        <Link to={`/tienda/${slug}/carrito`} className="text-gray-500 hover:text-[var(--store-primary)] transition-colors bg-white p-2 rounded-xl border border-gray-200">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Finalizar compra</h1>
      </div>

      {/* Un carrito con un curso Y una rodillera no se puede cobrar de una:
          uno se paga ahora en línea y el otro al mensajero. En vez de elegir
          por el cliente (y cobrarle online algo que esperaba pagar al recibir),
          se le dice y se le deja separar el pedido. */}
      {mixto && (
        <div className="mb-8 flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">Tu carrito mezcla dos formas de pago</p>
            <p className="leading-relaxed">
              Los productos físicos se pagan contra entrega y los digitales se pagan en línea.
              Haz dos pedidos por separado: quita unos del{' '}
              <Link to={`/tienda/${slug}/carrito`} className="underline font-semibold">carrito</Link>, termina la compra, y luego pide los otros.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
        <div className="space-y-8">
          {hayFisicos && !mixto ? (
            /* ── DATOS DE ENVÍO PARA CONTRA ENTREGA ──────────────────────── */
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Truck className="w-5 h-5 text-[var(--store-primary)]" /> ¿A dónde lo enviamos?
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Pagas en efectivo al recibir. La transportadora pide la cédula de quien recibe.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.nombre} *</label>
                  <input className={inputCls} placeholder="Ej. Juan Pérez" value={envio.nombre}
                    onChange={e => setCampo('nombre', e.target.value)} autoComplete="name" />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.departamento} *</label>
                    <select className={inputCls} value={envio.departamento}
                      onChange={e => setCampo('departamento', e.target.value)}>
                      <option value="">Selecciona…</option>
                      {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.ciudad} *</label>
                    {/* Selector de ciudad filtrado por el departamento elegido.
                        Si el municipio no está en la lista (pueblos pequeños),
                        se puede escribir libremente: el input acepta texto
                        además de las sugerencias del datalist. */}
                    <input className={inputCls} list="ciudades-datalist"
                      placeholder={envio.departamento ? 'Ej. ' + (CIUDADES_POR_DEPARTAMENTO[envio.departamento]?.[0] || 'Medellín') : 'Elige departamento primero'}
                      value={envio.ciudad}
                      onChange={e => setCampo('ciudad', e.target.value)} autoComplete="address-level2" />
                    <datalist id="ciudades-datalist">
                      {(envio.departamento ? CIUDADES_POR_DEPARTAMENTO[envio.departamento] || [] : [])
                        .map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.direccion} *</label>
                  <input className={inputCls} placeholder="Calle 10 # 5-32, apto 301" value={envio.direccion}
                    onChange={e => setCampo('direccion', e.target.value)} autoComplete="street-address" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.barrio}</label>
                  <input className={inputCls} placeholder="Opcional — ayuda a que llegue más rápido" value={envio.barrio}
                    onChange={e => setCampo('barrio', e.target.value)} />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.telefono} *</label>
                    <input className={inputCls} type="tel" inputMode="numeric" placeholder="300 123 4567" value={envio.telefono}
                      onChange={e => setCampo('telefono', e.target.value)} autoComplete="tel" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.documento} *</label>
                    <input className={inputCls} inputMode="numeric" placeholder="Sin puntos ni comas" value={envio.documento}
                      onChange={e => setCampo('documento', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{ETIQUETAS.notas}</label>
                  <textarea className={`${inputCls} min-h-[80px] resize-y`} placeholder="Opcional — punto de referencia, horario…"
                    value={envio.notas} onChange={e => setCampo('notas', e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            /* ── DATOS PARA ENTREGA DIGITAL ──────────────────────────────── */
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" /> Tus datos
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre completo *</label>
                  <input className={inputCls} placeholder="Ej. Juan Pérez" value={datosDigital.name}
                    onChange={e => setDatosDigital({ ...datosDigital, name: e.target.value })} autoComplete="name" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Correo electrónico *</label>
                  <input className={inputCls} type="email" placeholder="tu@email.com (te enviamos el acceso acá)"
                    value={datosDigital.email}
                    onChange={e => setDatosDigital({ ...datosDigital, email: e.target.value })} autoComplete="email" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">WhatsApp (opcional)</label>
                  <input className={inputCls} type="tel" placeholder="+57 300 000 0000" value={datosDigital.phone}
                    onChange={e => setDatosDigital({ ...datosDigital, phone: e.target.value })} autoComplete="tel" />
                </div>
              </div>
            </div>
          )}

          {/* ── FORMA DE PAGO ────────────────────────────────────────────── */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 space-y-5">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Forma de pago</h2>

            {hayFisicos && !mixto ? (
              <>
                <div className="flex gap-3 bg-[var(--store-primary-soft)] rounded-xl p-4">
                  <Truck className="w-5 h-5 text-[var(--store-primary)] shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p className="font-bold text-gray-900 mb-0.5">Pago contra entrega</p>
                    <p className="leading-relaxed">
                      No pagas nada ahora. Le entregas el dinero al mensajero cuando recibas el pedido.
                    </p>
                  </div>
                </div>
                <button
                  onClick={confirmarContraentrega}
                  disabled={isProcessing !== null}
                  className="w-full bg-[var(--store-primary)] text-[var(--store-on-primary)] py-4 rounded-full font-bold hover:bg-[var(--store-primary-hover)] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <Truck className="w-5 h-5" />
                  {isProcessing === 'cod' ? 'Registrando pedido…' : 'Confirmar pedido'}
                </button>
                {faltan.length > 0 && (
                  <p className="text-xs text-gray-500 text-center">
                    Falta: {faltan.map(f => ETIQUETAS[f].toLowerCase()).join(', ')}
                  </p>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => handleCheckout('mp')}
                  disabled={isProcessing !== null || mixto}
                  className="w-full bg-[#009EE3] hover:bg-[#0088c4] text-white py-4 rounded-full font-bold transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <CreditCard className="w-5 h-5" />
                  {isProcessing === 'mp' ? 'Abriendo MercadoPago…' : 'Pagar con MercadoPago'}
                </button>
                <button
                  onClick={() => handleCheckout('pp')}
                  disabled={isProcessing !== null || mixto}
                  className="w-full bg-[#FFC439] hover:bg-[#eab308] text-[#003087] py-4 rounded-full font-bold transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {isProcessing === 'pp' ? 'Abriendo PayPal…' : 'Pagar con PayPal'}
                </button>
              </>
            )}

            {waPhone && (
              <>
                <div className="relative py-2 flex items-center">
                  <div className="flex-grow border-t border-gray-200" />
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">o</span>
                  <div className="flex-grow border-t border-gray-200" />
                </div>
                <button
                  onClick={handleWhatsAppOrder}
                  className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 py-4 rounded-full font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2.5"
                >
                  <MessageCircle className="w-5 h-5" />
                  Coordinar por WhatsApp
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── RESUMEN ────────────────────────────────────────────────────── */}
        <div>
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Package className="w-5 h-5 text-[var(--store-primary)]" /> Resumen de tu pedido
            </h2>
            <div className="space-y-4 mb-8">
              {cart.map(item => (
                <div key={`${item.id}-${item.variante || ''}`} className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--store-primary-soft)]">
                    <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">{item.name}</h4>
                    {item.variante && (
                      <p className="text-[11px] font-semibold text-[var(--store-primary)] mb-1">{item.variante}</p>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-medium">Cant: {item.quantity}</span>
                      <span className="font-bold text-gray-900">{formatear(item.price)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-6 space-y-4">
              <div className="flex justify-between text-sm text-gray-500 font-medium">
                <span>Subtotal</span>
                <span>{formatear(subtotal)}</span>
              </div>
              {/* Decía "Envío (Digital) — Gratis" SIEMPRE, incluso para una
                  rodillera que sí se despacha. Ahora se dice lo que aplica. */}
              {hayFisicos ? (
                <div className="flex justify-between text-sm text-gray-500 font-medium">
                  <span>Envío</span>
                  <span>Se cobra al recibir</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm text-emerald-600 font-bold">
                  <span>Entrega digital</span>
                  <span>Sin costo</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-black text-gray-900 pt-4 border-t border-gray-200">
                <span>{hayFisicos && !mixto ? 'Pagas al recibir' : 'Total a pagar'}</span>
                <span>{formatear(subtotal)}</span>
              </div>
            </div>

            <div className="mt-8 flex items-start gap-3 bg-[var(--store-primary-soft)] p-4 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-[var(--store-primary)] shrink-0 mt-0.5" />
              <p className="text-xs text-gray-700 font-medium leading-relaxed">
                {hayFisicos && !mixto
                  ? 'No pagas nada por adelantado. Revisas el pedido y le pagas al mensajero cuando lo recibas.'
                  : 'Pago seguro por pasarela oficial. El acceso a tus productos se envía al correo que registres apenas se confirme el pago.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
