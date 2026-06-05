/**
 * Raw fetch to NVIDIA NIM (no SDK needed).
 */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'nvapi-your-key-here';

const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'moonshotai/kimi-k2.6',
    messages: [{ role: 'user', content: 'Hello! What can you do?' }],
    temperature: 0.7,
    max_tokens: 256,
  }),
});

const data = await res.json();
console.log(data.choices[0].message.content);
