import express from 'express';
import cors from 'cors';
import { NvidiaClient, ChatMessage, ModelHealth, NvidiaModel } from './nvidia-client';
import { config } from './config';

export function createServer(nvidia: NvidiaClient) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let modelsCache: { models: NvidiaModel[]; timestamp: number } | null = null;
  let healthCache: { health: ModelHealth[]; timestamp: number } | null = null;
  const CACHE_TTL = 5 * 60 * 1000;

  async function getModels(): Promise<NvidiaModel[]> {
    if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_TTL) {
      return modelsCache.models;
    }
    const models = await nvidia.listModels();
    const chatModels = models.filter(m =>
      !m.id.includes('embed') &&
      !m.id.includes('guard') &&
      !m.id.includes('reward') &&
      !m.id.includes('classify') &&
      !m.id.includes('parser') &&
      !m.id.includes('rerank')
    );
    modelsCache = { models: chatModels, timestamp: Date.now() };
    return chatModels;
  }

  app.get('/v1/models', async (_req, res) => {
    try {
      const models = await getModels();
      res.json({ object: 'list', data: models });
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message } });
    }
  });

  app.get('/v1/health', async (_req, res) => {
    try {
      if (healthCache && Date.now() - healthCache.timestamp < CACHE_TTL) {
        return res.json({ object: 'list', data: healthCache.health });
      }
      const models = await getModels();
      const health = await nvidia.probeModels(models);
      healthCache = { health, timestamp: Date.now() };
      res.json({ object: 'list', data: health });
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message } });
    }
  });

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const upstreamRes = await nvidia.chatCompletion(req.body);

      if (!upstreamRes.ok) {
        const body = await upstreamRes.text().catch(() => '');
        return res.status(upstreamRes.status).json({
          error: {
            message: `NVIDIA API error (${upstreamRes.status}): ${body.slice(0, 500)}`,
            type: 'upstream_error',
            code: upstreamRes.status,
          }
        });
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      const isStream = req.body.stream || contentType.includes('stream');

      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const reader = upstreamRes.body?.getReader();
        if (!reader) return res.end();

        const decoder = new TextDecoder();
        let buffer = '';
        let aborted = false;

        req.on('close', () => { aborted = true; reader.cancel(); });

        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              res.write(line + '\n\n');
            }
          }
        }
        if (buffer && !aborted) {
          res.write(buffer + '\n\n');
        }
        if (!aborted) {
          res.write('data: [DONE]\n\n');
        }
        res.end();
      } else {
        const body = await upstreamRes.json();
        res.json(body);
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err.message } });
      }
    }
  });

  app.get('/v1/discover', async (_req, res) => {
    try {
      const models = await getModels();
      res.json({
        object: 'list',
        total: models.length,
        data: models.map(m => ({
          id: m.id,
          owned_by: m.owned_by,
          playground: `https://build.nvidia.com/${m.owned_by}/${m.id.split('/').pop()}`,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message } });
    }
  });

  return app;
}
