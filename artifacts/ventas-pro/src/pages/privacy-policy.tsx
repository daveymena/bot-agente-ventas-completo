export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen w-full bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: 2026</p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Quiénes somos</h2>
            <p>
              VentasPro es una plataforma de ventas que conecta catálogos de productos con
              canales de mensajería (WhatsApp, Facebook Messenger) para atender consultas y
              gestionar ventas mediante agentes de inteligencia artificial.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Datos que recopilamos</h2>
            <p>Cuando interactúas con nosotros por WhatsApp, Facebook Messenger o nuestra tienda web, podemos recopilar:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Nombre y número de teléfono o identificador de contacto</li>
              <li>Contenido de los mensajes que envías a nuestros agentes</li>
              <li>Información de pedidos: productos consultados o comprados</li>
              <li>Datos de pago procesados a través de pasarelas externas (MercadoPago, PayPal) — nosotros no almacenamos números de tarjeta</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Cómo usamos tus datos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Responder tus consultas y gestionar tu compra</li>
              <li>Enviarte información sobre productos y confirmaciones de pedido</li>
              <li>Mejorar la calidad de nuestras respuestas automatizadas</li>
            </ul>
            <p className="mt-2">No vendemos tus datos personales a terceros.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Integración con Facebook / Meta</h2>
            <p>
              Usamos las APIs de Facebook e Instagram (Messenger, comentarios, Marketplace y
              anuncios) exclusivamente para gestionar la comunicación con clientes que nos
              contactan a través de nuestra página. Cumplimos con las Políticas de la Plataforma
              de Meta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Conservación de datos</h2>
            <p>
              Conservamos tus datos de conversación y pedidos mientras mantengas una relación
              comercial con nosotros, y puedes solicitar su eliminación en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Tus derechos</h2>
            <p>
              Puedes solicitar acceso, corrección o eliminación de tus datos personales
              escribiéndonos por los mismos canales de contacto (WhatsApp o Facebook) que usaste
              para comunicarte con nosotros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Contacto</h2>
            <p>Para cualquier consulta sobre esta política, contáctanos a través de nuestros canales oficiales.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
