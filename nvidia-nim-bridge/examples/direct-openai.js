/**
 * Use NVIDIA NIM directly with the OpenAI JS SDK.
 * No bridge server needed - just change baseURL and apiKey.
 *
 * npm install openai
 */
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: 'nvapi-your-key-here', // Get from https://build.nvidia.com/settings/api-keys
});

async function main() {
  const completion = await client.chat.completions.create({
    model: 'moonshotai/kimi-k2.6',
    messages: [{ role: 'user', content: 'What is the speed of light?' }],
    temperature: 0.6,
    max_tokens: 512,
  });

  console.log(completion.choices[0].message.content);
}

main();
