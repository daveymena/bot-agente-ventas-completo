/**
 * Una burbuja de WhatsApp tal como la ve el cliente: foto con pie, texto con
 * el formato de WhatsApp. La usan el chat de prueba y "Enseñar con un ejemplo".
 */
import { useRef, useState } from "react";
import { Loader2, Mic, Package, Pause, Play } from "lucide-react";

/** Un mensaje tal como llega por WhatsApp: con `imagen` es una foto con pie. */
/** `audio`: es una nota de voz; `texto` es lo que dice. */
export type Burbuja = { imagen?: string; texto: string; productoId?: number; audio?: boolean };

/**
 * El formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y enlaces. Se arma
 * con nodos de React (nada de HTML crudo): el texto viene del modelo.
 */
export function formatoWhatsApp(texto: string): React.ReactNode[] {
  const patron = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  return texto.split(patron).map((trozo, i) => {
    if (!trozo) return null;
    if (/^https?:\/\//.test(trozo)) {
      return <a key={i} href={trozo} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#027eb5] underline break-all">{trozo}</a>;
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


/**
 * La nota de voz como en WhatsApp: botón de reproducir y, debajo, lo que dice.
 * El audio se genera al tocar play, con la misma voz que sale por WhatsApp.
 */
function NotaDeVoz({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"quieto" | "cargando" | "sonando">("quieto");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const alternar = async () => {
    if (estado === "sonando") { audioRef.current?.pause(); setEstado("quieto"); return; }
    try {
      if (!audioRef.current) {
        setEstado("cargando");
        const r = await fetch("/api/probar-vendedor/voz", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
        if (!r.ok) throw new Error();
        const audio = new Audio(URL.createObjectURL(await r.blob()));
        audio.onended = () => setEstado("quieto");
        audioRef.current = audio;
      }
      await audioRef.current.play();
      setEstado("sonando");
    } catch {
      setEstado("quieto");
    }
  };

  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); alternar(); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white" aria-label={estado === "sonando" ? "Pausar" : "Escuchar nota de voz"}>
          {estado === "cargando" ? <Loader2 className="h-4 w-4 animate-spin" /> : estado === "sonando" ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
          {Array.from({ length: 28 }, (_, i) => (
            <span key={i} className={`w-[3px] rounded-full ${estado === "sonando" ? "bg-[#00a884]" : "bg-slate-300"}`} style={{ height: `${6 + ((i * 7) % 16)}px` }} />
          ))}
        </div>
        <Mic className="h-4 w-4 shrink-0 text-[#00a884]" />
      </div>
      <p className="mt-1.5 text-[12px] italic leading-snug text-slate-500">Lo que dice el audio: {texto}</p>
    </div>
  );
}

/**
 * `alTocar`: la burbuja se puede tocar (chat de prueba: tocar un mensaje del
 * vendedor lo elige para corregirlo). `elegida` la resalta.
 */
export function BurbujaWhatsApp({ burbuja, deCliente, primera, alTocar, elegida }: {
  burbuja: Burbuja; deCliente: boolean; primera: boolean; alTocar?: () => void; elegida?: boolean;
}) {
  const conFoto = burbuja.imagen !== undefined;
  const tocable = alTocar
    ? {
        role: "button" as const,
        tabIndex: 0,
        title: "Toca para corregir este mensaje",
        onClick: alTocar,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alTocar(); } },
      }
    : {};
  const marco = alTocar ? `cursor-pointer transition hover:ring-2 hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${elegida ? "ring-2 ring-indigo-500" : ""}` : "";
  if (burbuja.audio) {
    return (
      <div {...tocable} className={`rounded-lg bg-white px-2.5 py-2 shadow-sm ${primera ? "rounded-tl-none" : ""} ${marco}`}>
        <NotaDeVoz texto={burbuja.texto} />
      </div>
    );
  }
  return (
    <div
      {...tocable}
      className={`rounded-lg text-[14.2px] leading-[1.35] shadow-sm whitespace-pre-wrap break-words text-[#111b21] ${
        deCliente ? "self-end bg-[#d9fdd3] rounded-tr-none" : `self-start bg-white ${primera ? "rounded-tl-none" : ""}`
      } ${conFoto ? "p-1" : "px-2.5 py-1.5"} ${marco}`}
    >
      {conFoto && <Foto src={burbuja.imagen!} />}
      <div className={conFoto ? "px-1.5 pb-1" : ""}>{formatoWhatsApp(burbuja.texto)}</div>
    </div>
  );
}
