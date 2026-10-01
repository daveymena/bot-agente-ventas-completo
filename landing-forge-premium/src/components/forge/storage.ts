'use client';

import type { LandingDocument } from '@/premium/types';

const DRAFTS_KEY = 'lf_drafts_v1';
const SETTINGS_KEY = 'lf_panel_settings_v1';

export interface PanelSettings {
  /** API key opcional para pulir el copy con un LLM. Se guarda solo en este navegador. */
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  webhookUrl: string;
  capiToken: string;
  publicBaseUrl: string;
}

export const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
  webhookUrl: '',
  capiToken: '',
  publicBaseUrl: '',
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadDrafts(): LandingDocument[] {
  if (typeof window === 'undefined') return [];
  const list = safeParse<LandingDocument[]>(window.localStorage.getItem(DRAFTS_KEY), []);
  return Array.isArray(list) ? list : [];
}

export function saveDraft(doc: LandingDocument): LandingDocument[] {
  if (typeof window === 'undefined') return [];
  const list = loadDrafts();
  const next = { ...doc, updatedAt: new Date().toISOString() };
  const index = list.findIndex((d) => d.id === doc.id);
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  const trimmed = list.slice(0, 40);
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Cuota llena: guardamos solo los 10 más recientes.
    try {
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(trimmed.slice(0, 10)));
    } catch {
      /* se ignora */
    }
  }
  return trimmed;
}

export function deleteDraft(id: string): LandingDocument[] {
  if (typeof window === 'undefined') return [];
  const list = loadDrafts().filter((d) => d.id !== id);
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  return list;
}

export function loadPanelSettings(): PanelSettings {
  if (typeof window === 'undefined') return DEFAULT_PANEL_SETTINGS;
  return { ...DEFAULT_PANEL_SETTINGS, ...safeParse(window.localStorage.getItem(SETTINGS_KEY), {}) };
}

export function savePanelSettings(settings: PanelSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Descarga un string como archivo. */
export function downloadFile(filename: string, content: string, mime = 'text/html;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
