/** Bounded startup: reconnect saved sessions only, never generate 1,000 QRs. */
export async function restaurarSesiones<T>(ids: number[], options: {
  concurrency: number;
  load: (id: number) => Promise<T | null>;
  start: (id: number, tenant: T) => Promise<unknown>;
  onError: (id: number, error: unknown) => void;
}): Promise<void> {
  const pending = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  let cursor = 0;
  const concurrency = Number.isFinite(options.concurrency) ? Math.max(1, Math.min(16, Math.floor(options.concurrency))) : 4;
  await Promise.all(Array.from({ length: Math.min(pending.length, concurrency) }, async () => {
    while (cursor < pending.length) {
      const id = pending[cursor++];
      try {
        const tenant = await options.load(id);
        if (tenant) await options.start(id, tenant);
      } catch (error) { options.onError(id, error); }
    }
  }));
}
