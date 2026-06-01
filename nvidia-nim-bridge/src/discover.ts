#!/usr/bin/env node
import { config } from './config';
import { NvidiaClient } from './nvidia-client';

async function discover() {
  if (!config.nvidiaApiKey || !config.nvidiaApiKey.startsWith('nvapi-')) {
    console.error('ERROR: NVIDIA_API_KEY not set or invalid.');
    console.error('Get a free key at: https://build.nvidia.com/settings/api-keys');
    process.exit(1);
  }

  const nvidia = new NvidiaClient();
  console.log('Fetching model catalog...');
  const models = await nvidia.listModels();
  console.log(`\nTotal models in catalog: ${models.length}`);

  const chatModels = models.filter(m =>
    !m.id.includes('embed') && !m.id.includes('guard') &&
    !m.id.includes('reward') && !m.id.includes('classify') &&
    !m.id.includes('parser') && !m.id.includes('rerank')
  );
  console.log(`Chat-capable candidates: ${chatModels.length}`);

  console.log('\nProbing each model... (this will take a while)');
  const results = await nvidia.probeModels(chatModels);
  const available = results.filter(r => r.available);

  console.log(`\n=== AVAILABLE MODELS (${available.length}/${results.length}) ===\n`);
  for (const m of available) {
    console.log(`  ${m.id.padEnd(55)} ${m.latency ? `${m.latency}ms` : ''}`);
  }

  console.log(`\n=== UNAVAILABLE MODELS (${results.length - available.length}) ===\n`);
  for (const m of results.filter(r => !r.available)) {
    console.log(`  ${m.id.padEnd(55)} ${m.status} ${m.error ? `- ${m.error}` : ''}`);
  }
}

discover().catch(console.error);
