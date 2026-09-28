import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Globe, Loader2, Image as ImageIcon, Link as LinkIcon, Send } from "lucide-react";
import { toast } from "sonner";

interface ImagenScrapeada { src: string; absolute_url: string; alt: string }
interface ResultadoScrape {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  images: ImagenScrapeada[];
  es_spa_vacia?: boolean;
}

/** Panel ScraperPro dentro de Atlas: extrae una URL y manda la ficha al chat. Sin frontend aparte. */
export function ScraperPanel({ abierto, alCerrar, alEnviarAAtlas }: {
  abierto: boolean;
  alCerrar: () => void;
  alEnviarAAtlas: (texto: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [conJs, setConJs] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoScrape | null>(null);

  const extraer = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) { toast.error("Pegá una URL que empiece con http:// o https://"); return; }
    setCargando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/scraper/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: u, render_js: conJs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || d.message || "No se pudo extraer");
      setResultado(d);
      if (d.es_spa_vacia) toast.warning("La página carga su contenido con JavaScript: probá con 'Render JS'");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo extraer");
    } finally {
      setCargando(false);
    }
  };

  const enviarAAtlas = () => {
    if (!resultado) return;
    const lineas = [
      `Te paso lo que extraje de ${resultado.url}:`,
      `Título: ${resultado.title || "(sin título)"}`,
      resultado.description ? `Descripción: ${resultado.description}` : "",
      resultado.text ? `Texto: ${resultado.text.slice(0, 3000)}` : "(sin texto visible)",
      resultado.images.length ? `Imágenes (${resultado.images.length}): ${resultado.images.slice(0, 10).map((i) => i.absolute_url).join(", ")}` : "Sin imágenes",
    ].filter(Boolean);
    alEnviarAAtlas(lineas.join("\n\n"));
    alCerrar();
    toast.success("Extracción enviada al chat de Atlas");
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) alCerrar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> Scraper — extraer de una web
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="https://tienda-ejemplo.com/producto"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") extraer(); }}
          />
          <Button onClick={extraer} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extraer"}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={conJs} onChange={(e) => setConJs(e.target.checked)} />
          Render JS (para páginas que cargan con JavaScript — más lento)
        </label>
        {resultado && (
          <div className="space-y-3 mt-2">
            <div>
              <p className="font-semibold text-sm">{resultado.title || "(sin título)"}</p>
              {resultado.description && <p className="text-xs text-muted-foreground">{resultado.description}</p>}
              <p className="text-xs mt-1 whitespace-pre-wrap">{resultado.text.slice(0, 1200) || "(sin texto visible)"}</p>
            </div>
            {resultado.images.length > 0 && (
              <div>
                <p className="text-xs font-semibold flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Imágenes ({resultado.images.length})</p>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {resultado.images.slice(0, 12).map((im, i) => (
                    <a key={i} href={im.absolute_url} target="_blank" rel="noreferrer" title={im.alt || im.absolute_url}>
                      <img src={im.absolute_url} alt={im.alt || ""} loading="lazy" className="h-16 w-full object-cover rounded border" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {resultado.links.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <LinkIcon className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="break-all">{resultado.links.length} enlaces — {resultado.links.slice(0, 3).join(", ")}{resultado.links.length > 3 ? "…" : ""}</span>
              </p>
            )}
            <Button onClick={enviarAAtlas} className="w-full">
              <Send className="h-4 w-4 mr-1.5" /> Enviar a Atlas
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
