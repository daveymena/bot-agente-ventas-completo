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
