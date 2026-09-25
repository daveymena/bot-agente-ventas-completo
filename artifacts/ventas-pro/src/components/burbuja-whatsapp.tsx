/**
 * Una burbuja de WhatsApp tal como la ve el cliente: foto con pie, texto con
 * el formato de WhatsApp. La usan el chat de prueba y "Enseñar con un ejemplo".
 */
import { useState } from "react";
import { Package } from "lucide-react";

/** Un mensaje tal como llega por WhatsApp: con `imagen` es una foto con pie. */
export type Burbuja = { imagen?: string; texto: string; productoId?: number };

/**
 * El formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y enlaces. Se arma
 * con nodos de React (nada de HTML crudo): el texto viene del modelo.
 */
export function formatoWhatsApp(texto: string): React.ReactNode[] {
  const patron = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  return texto.split(patron).map((trozo, i) => {
    if (!trozo) return null;
    if (/^https?:\/\//.test(trozo)) {
      return <a key={i} href={trozo} target="_blank" rel="noopener noreferrer" className="text-[#027eb5] underline break-all">{trozo}</a>;
    }
    if (/^\*[^*]+\*$/.test(trozo)) return <strong key={i}>{trozo.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(trozo)) return <em key={i}>{trozo.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(trozo)) return <s key={i}>{trozo.slice(1, -1)}</s>;
    return <span key={i}>{trozo}</span>;
  });
}

export function Foto({ src }: { src: string }) {
  const [rota, setRota] = useState(!src);
  if (rota) {
    return (
      <div className="mb-1 flex h-28 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
        <Package className="mr-1.5 h-4 w-4" /> Sin foto: por WhatsApp sale solo el texto
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setRota(true)} className="mb-1 max-h-72 w-full rounded-md object-cover" />;
}


export function BurbujaWhatsApp({ burbuja, deCliente, primera }: { burbuja: Burbuja; deCliente: boolean; primera: boolean }) {
  const conFoto = burbuja.imagen !== undefined;
  return (
    <div
      className={`rounded-lg text-[14.2px] leading-[1.35] shadow-sm whitespace-pre-wrap break-words text-[#111b21] ${
        deCliente ? "self-end bg-[#d9fdd3] rounded-tr-none" : `self-start bg-white ${primera ? "rounded-tl-none" : ""}`
      } ${conFoto ? "p-1" : "px-2.5 py-1.5"}`}
    >
      {conFoto && <Foto src={burbuja.imagen!} />}
      <div className={conFoto ? "px-1.5 pb-1" : ""}>{formatoWhatsApp(burbuja.texto)}</div>
    </div>
  );
}
