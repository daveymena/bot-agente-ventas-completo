import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function StorePage() {
  const [location] = useLocation();
  // location e.g. "/store/my-shop"
  const slug = location.split("/")[2]; // assuming /store/:slug
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/store/${slug}`);
        if (!res.ok) throw new Error("Failed to load store");
        const data = await res.json();
        setStore(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    if (slug) load();
  }, [slug]);

  if (loading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-4 w-full" count={3} /></div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{store.store.name}</h1>
      <p className="mb-4">{store.store.slug}</p>
      {/* Simple catalog render */}
      {store.categories.map((cat: any) => (
        <section key={cat.id} className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{cat.name}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {store.products
              .filter((p: any) => p.categoryId === cat.id)
              .map((p: any) => (
                <Link key={p.id} to={"/store/" + slug + "/product/" + p.id} className="border rounded p-2 hover:shadow">
                  {p.thumbUrl && <img src={p.thumbUrl} alt={p.title} className="w-full h-32 object-cover mb-2" />}
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-gray-600">${p.price}</p>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
