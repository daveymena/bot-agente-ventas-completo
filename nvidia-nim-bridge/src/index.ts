#!/usr/bin/env node
import { config } from './config';
import { NvidiaClient } from './nvidia-client';
import { createServer } from './server';

async function main() {
  if (!config.nvidiaApiKey || !config.nvidiaApiKey.startsWith('nvapi-')) {
    console.error('ERROR: NVIDIA_API_KEY not set or invalid.');
    console.error('Get a free key at: https://build.nvidia.com/settings/api-keys');
    console.error('Then set it: set NVIDIA_API_KEY=nvapi-...  (or use .env file)');
    process.exit(1);
  }

  const nvidia = new NvidiaClient();
  const app = createServer(nvidia);

  if (config.probeOnStart) {
    console.log('Probing available models...');
    const models = await nvidia.listModels();
    const chatModels = models.filter(m =>
      !m.id.includes('embed') && !m.id.includes('guard') &&
      !m.id.includes('reward') && !m.id.includes('classify') &&
      !m.id.includes('parser') && !m.id.includes('rerank')
    );
    const health = await nvidia.probeModels(chatModels);
    const available = health.filter(h => h.available);
    console.log(`\n${available.length}/${chatModels.length} models available`);
  }

  app.listen(config.port, config.host, () => {
    console.log(`\n  NVIDIA NIM Bridge running at:`);
    console.log(`  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`\n  Endpoints:`);
    console.log(`  GET  /v1/models              - List all models`);
    console.log(`  GET  /v1/discover             - Discover models with playground URLs`);
    console.log(`  GET  /v1/health               - Probe which models are live`);
    console.log(`  POST /v1/chat/completions     - Chat completion (OpenAI-compatible)`);
    console.log(`\n  Default model: ${config.defaultModel}`);
    console.log(`  Use with any OpenAI client:`);
    console.log(`    baseURL: http://localhost:${config.port}/v1`);
    console.log(`    apiKey:  any-value (no auth needed locally)`);
    console.log(`\n  Or directly:`);
    console.log(`    curl http://localhost:${config.port}/v1/chat/completions \\`);
    console.log(`      -H \"Content-Type: application/json\" \\`);
    console.log(`      -d '{\"model\":\"${config.defaultModel}\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'`);
    console.log(``);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
