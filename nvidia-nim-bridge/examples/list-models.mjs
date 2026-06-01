/**
 * List all available models on NVIDIA NIM.
 */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'nvapi-your-key-here';

const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

const data = await res.json();
const models = data.data || data;

console.log(`\nTotal models: ${models.length}\n`);
for (const m of models) {
  console.log(`  ${m.id}`);
}
