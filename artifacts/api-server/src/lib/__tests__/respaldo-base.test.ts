import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  crearRespaldoBase,
  verificarRespaldo,
  listarRespaldosBase,
  aplicarRetencion,
  tablasDelEsquema,
  PREFIJO_RESPALDO,
  copiarRespaldoFueraDelServidor,
} from "../respaldo-base";

let dir: string;
const anterior = process.env.BACKUP_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-test-"));
  process.env.BACKUP_DIR = dir;
});

afterEach(() => {
  process.env.BACKUP_DIR = anterior;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("respaldo completo de la base", () => {
  it("exporta todas las tablas del esquema", () => {
    expect(tablasDelEsquema().length).toBeGreaterThanOrEqual(13);
  });

  it("crea un respaldo que se puede releer y cuadra con su manifiesto", async () => {
    const r = await crearRespaldoBase("sqlite");
    expect(r.ok).toBe(true);
    expect(r.ruta).toBeTruthy();
    const v = verificarRespaldo(r.ruta!);
    expect(v.ok).toBe(true);
    expect(v.manifiesto?.motor).toBe("sqlite");
    expect(Object.keys(v.manifiesto!.tablas).length).toBe(r.tablas);
  });

  it("detecta un respaldo dañado", async () => {
    const r = await crearRespaldoBase("sqlite");
    fs.writeFileSync(r.ruta!, zlib.gzipSync("no es json"));
    expect(verificarRespaldo(r.ruta!).ok).toBe(false);
  });

  it("la retención conserva solo los respaldos más recientes", async () => {
    for (let i = 0; i < 3; i++) {
      const nombre = path.join(dir, `${PREFIJO_RESPALDO}2026-01-0${i + 1}T00-00-00-000Z.json.gz`);
      fs.writeFileSync(nombre, zlib.gzipSync("{}"));
    }
    expect(listarRespaldosBase().length).toBe(3);
    const borrados = aplicarRetencion(2);
    expect(borrados).toBe(1);
    const quedan = listarRespaldosBase().map((r) => path.basename(r));
    expect(quedan).toEqual([
      `${PREFIJO_RESPALDO}2026-01-03T00-00-00-000Z.json.gz`,
      `${PREFIJO_RESPALDO}2026-01-02T00-00-00-000Z.json.gz`,
    ]);
  });
});

describe("copia fuera del servidor", () => {
  it("sin destino configurado no hace nada", async () => {
    const anteriorUrl = process.env.RESPALDO_DESTINO_URL;
    delete process.env.RESPALDO_DESTINO_URL;
    const f = path.join(dir, "x.json.gz");
    fs.writeFileSync(f, "x");
    const r = await copiarRespaldoFueraDelServidor(f);
    expect(r.omitido).toBe(true);
    process.env.RESPALDO_DESTINO_URL = anteriorUrl;
  });

  it("sube el archivo íntegro al destino con el token", async () => {
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
    const anteriorUrl = process.env.RESPALDO_DESTINO_URL;
    const anteriorTok = process.env.RESPALDO_DESTINO_TOKEN;
    process.env.RESPALDO_DESTINO_URL = `http://127.0.0.1:${port}/copias/`;
    process.env.RESPALDO_DESTINO_TOKEN = "tok-prueba";
    try {
      const f = path.join(dir, `${PREFIJO_RESPALDO}prueba.json.gz`);
      const contenido = zlib.gzipSync('{"a":1}');
      fs.writeFileSync(f, contenido);
      const r = await copiarRespaldoFueraDelServidor(f);
      expect(r.ok).toBe(true);
      expect(recibido.url).toBe(`/copias/${PREFIJO_RESPALDO}prueba.json.gz`);
      expect(recibido.auth).toBe("Bearer tok-prueba");
      expect(Buffer.compare(recibido.body!, contenido)).toBe(0);
    } finally {
      process.env.RESPALDO_DESTINO_URL = anteriorUrl;
      process.env.RESPALDO_DESTINO_TOKEN = anteriorTok;
      await new Promise<void>((ok) => srv.close(() => ok()));
    }
  });
});
