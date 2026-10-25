/**
 * /tienda/:slug decide qué mostrar: la vitrina (Shop) o, si el negocio es de
 * servicios, su página profesional. La decisión la toma el servidor
 * (store.presentacion, ver lib/presentacion-del-negocio.ts del api-server).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import Shop from './Shop';
import PaginaDeServicios, { type NegocioPublico, type ServicioPublico } from './PaginaDeServicios';
import PaginaDigital from './PaginaDigital';
import { tipoDeOferta } from '../lib/experiencia-de-compra';

type Respuesta = { store: NegocioPublico & { presentacion?: 'tienda' | 'servicios' | 'digital' }; products: Array<ServicioPublico & { linea?: string; kind?: string; category?: string }> };

const InicioDelNegocio = () => {
  const { slug } = useParams();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setListo(false);
    fetch(`/api/public/products/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setDatos(j); })
      .catch(() => { if (vivo) setDatos(null); })
      .finally(() => { if (vivo) setListo(true); });
    return () => { vivo = false; };
  }, [slug]);

  if (!listo) return <div className="min-h-screen" />;

  if (datos?.store?.presentacion === 'servicios') {
    const servicios = datos.products.filter((p) => tipoDeOferta(p) === 'service');
    return <PaginaDeServicios negocio={datos.store} servicios={servicios} />;
  }

  if (datos?.store?.presentacion === 'digital') return <PublicLayout><PaginaDigital negocio={datos.store} productos={datos.products} /></PublicLayout>;

  return (
    <PublicLayout>
      <Shop />
    </PublicLayout>
  );
};

export default InicioDelNegocio;
