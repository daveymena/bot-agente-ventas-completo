/**
 * Almacén de landings publicadas.
 *
 * Guarda cada documento como un JSON en disco (`LANDINGS_DIR`, por defecto
 * `.data/landings`). Es a propósito simple: así el módulo funciona solo,
 * sin base de datos, y el generador existente puede reemplazar estas cuatro
 * funciones por su propio repositorio sin tocar nada más.
 */

import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { LandingDocument } from '@/premium/types';

const DIR = path.resolve(process.env.LANDINGS_DIR || '.data/landings');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function fileFor(slug: string): string {
  return path.join(DIR, `${slug}.json`);
}

async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true });
}

export async function saveLanding(doc: LandingDocument): Promise<void> {
  if (!isValidSlug(doc.slug)) throw new Error('Slug inválido');
  await ensureDir();
  await writeFile(fileFor(doc.slug), JSON.stringify(doc, null, 2), 'utf8');
}

export async function getLanding(slug: string): Promise<LandingDocument | null> {
  if (!isValidSlug(slug)) return null;
  try {
    const raw = await readFile(fileFor(slug), 'utf8');
    const doc = JSON.parse(raw) as LandingDocument;
    return doc && doc.product && doc.settings ? doc : null;
  } catch {
    return null;
  }
}

export async function listLandings(): Promise<Array<{ slug: string; title: string; updatedAt: string }>> {
  try {
    const files = await readdir(DIR);
    const out: Array<{ slug: string; title: string; updatedAt: string }> = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const doc = await getLanding(f.replace(/\.json$/, ''));
      if (doc) out.push({ slug: doc.slug, title: doc.title, updatedAt: doc.updatedAt });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function deleteLanding(slug: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false;
  try {
    await unlink(fileFor(slug));
    return true;
  } catch {
    return false;
  }
}
