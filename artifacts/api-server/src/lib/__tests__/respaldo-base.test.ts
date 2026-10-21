import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  crearRespaldoBase,
  verificarRespaldo,
  listarRespaldosBase,
  aplicarRetencion,
  tablasDelEsquema,
  cifrarRespaldo,
  descifrarRespaldo,
  copiarRespaldoFueraDelServidor,
  PREFIJO_RESPALDO,
} from "../respaldo-base";

const CLAVE = "clave-de-prueba-larga-123";
const EXT = ".json.gz.enc";

let dir: string;
const anteriores = {
  BACKUP_DIR: process.env.BACKUP_DIR,
  RESPALDO_CLAVE: process.env.RESPALDO_CLAVE,
  RESPALDO_DESTINO_URL: process.env.RESPALDO_DESTINO_URL,
  RESPALDO_DESTINO_TOKEN: process.env.RESPALDO_DESTINO_TOKEN,
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-test-"));
  process.env.BACKUP_DIR = dir;
  process.env.RESPALDO_CLAVE = CLAVE;
  delete process.env.RESPALDO_DESTINO_URL;
  delete process.env.RESPALDO_DESTINO_TOKEN;
});

afterEach(() => {
  for (const [k, v] of Object.entries(anteriores)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("cifrado del respaldo", () => {
  it("cifra y descifra de vuelta al mismo contenido", () => {
    const texto = Buffer.from('{"hola":"mundo"}');
    const cifrado = cifrarRespaldo(texto, CLAVE);
    expect(cifrado.includes(texto)).toBe(false);
    expect(descifrarRespaldo(cifrado, CLAVE).equals(texto)).toBe(true);
  });

  it("con otra clave no se descifra", () => {
    const cifrado = cifrarRespaldo(Buffer.from("x"), CLAVE);
    expect(() => descifrarRespaldo(cifrado, "otra-clave-distinta-999")).toThrow();
  });

  it("un byte alterado hace fallar la verificación (GCM autentica)", () => {
    const cifrado = cifrarRespaldo(Buffer.from("datos"), CLAVE);
    cifrado[cifrado.length - 1] ^= 0xff;
    expect(() => descifrarRespaldo(cifrado, CLAVE)).toThrow();
  });

  it("sin RESPALDO_CLAVE no se crea ningún respaldo", async () => {
    delete process.env.RESPALDO_CLAVE;
    const r = await crearRespaldoBase("sqlite");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/RESPALDO_CLAVE/);
    expect(listarRespaldosBase().length).toBe(0);
  });
});

describe("respaldo completo de la base", () => {
  it("exporta todas las tablas del esquema", () => {
    expect(tablasDelEsquema().length).toBeGreaterThanOrEqual(13);
  });

  it("crea un respaldo cifrado que se puede releer y cuadra con su manifiesto", async () => {
    const r = await crearRespaldoBase("sqlite");
    expect(r.ok).toBe(true);
    expect(r.ruta!.endsWith(EXT)).toBe(true);
    const contenido = fs.readFileSync(r.ruta!);
    expect(contenido.subarray(0, 4).toString()).toBe("VPB1");
    const v = verificarRespaldo(r.ruta!);
    expect(v.ok).toBe(true);
    expect(v.manifiesto?.motor).toBe("sqlite");
    expect(Object.keys(v.manifiesto!.tablas).length).toBe(r.tablas);
  });

  it("detecta un respaldo dañado", async () => {
    const r = await crearRespaldoBase("sqlite");
    const buf = fs.readFileSync(r.ruta!);
    buf[buf.length - 5] ^= 0x01;
    fs.writeFileSync(r.ruta!, buf);
    expect(verificarRespaldo(r.ruta!).ok).toBe(false);
  });

  it("la retención conserva solo los respaldos más recientes", () => {
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(dir, `${PREFIJO_RESPALDO}2026-01-0${i + 1}T00-00-00-000Z${EXT}`), "x");
    }
    expect(listarRespaldosBase().length).toBe(3);
    expect(aplicarRetencion(2)).toBe(1);
    expect(listarRespaldosBase().map((r) => path.basename(r))).toEqual([
      `${PREFIJO_RESPALDO}2026-01-03T00-00-00-000Z${EXT}`,
      `${PREFIJO_RESPALDO}2026-01-02T00-00-00-000Z${EXT}`,
    ]);
  });
});

describe("copia fuera del servidor", () => {
  it("sin destino configurado no hace nada", async () => {
    const f = path.join(dir, `${PREFIJO_RESPALDO}x${EXT}`);
    fs.writeFileSync(f, "x");
    const r = await copiarRespaldoFueraDelServidor(f);
    expect(r.omitido).toBe(true);
  });

  it("sube el archivo cifrado íntegro, con el token", async () => {
    const http = await import("node:http");
    const recibido: { body?: Buffer; auth?: string; url?: string } = {};
    const srv = http.createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on("data", (c) => trozos.push(c));
      req.on("end", () => {
        recibido.body = Buffer.concat(trozos);
        recibido.auth = req.headers.authorization;
        recibido.url = req.url;
        res.writeHead(201).end();
      });
    });
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", () => ok()));
    const port = (srv.address() as any).port;
    process.env.RESPALDO_DESTINO_URL = `http://127.0.0.1:${port}/copias/`;
    process.env.RESPALDO_DESTINO_TOKEN = "tok-prueba";
    try {
      const f = path.join(dir, `${PREFIJO_RESPALDO}prueba${EXT}`);
      const contenido = cifrarRespaldo(Buffer.from("payload"), CLAVE);
      fs.writeFileSync(f, contenido);
      const r = await copiarRespaldoFueraDelServidor(f);
      expect(r.ok).toBe(true);
      expect(recibido.url).toBe(`/copias/${PREFIJO_RESPALDO}prueba${EXT}`);
      expect(recibido.auth).toBe("Bearer tok-prueba");
      expect(Buffer.compare(recibido.body!, contenido)).toBe(0);
    } finally {
      await new Promise<void>((ok) => srv.close(() => ok()));
    }
  });
});
