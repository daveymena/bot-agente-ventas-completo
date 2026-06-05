import { config } from './config';

export interface NvidiaModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  tools?: any[];
  tool_choice?: any;
}

export interface ModelHealth {
  id: string;
  available: boolean;
  latency?: number;
  status: string;
  error?: string;
}

function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOptions, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

export class NvidiaClient {
  private baseUrl: string;
  private apiKey: string;
  private lastRequestTime = 0;
  private minInterval: number;

  constructor() {
    this.baseUrl = config.nvidiaBaseUrl;
    this.apiKey = config.nvidiaApiKey;
    this.minInterval = 60000 / config.rpmLimit;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async rateLimit(): Promise<void> {
    if (!this.apiKey.startsWith('nvapi-')) return;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async listModels(): Promise<NvidiaModel[]> {
    await this.rateLimit();
    const res = await fetchWithTimeout(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.headers,
      timeout: 15000,
    });
    if (!res.ok) {
      throw new Error(`NVIDIA API error: ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    return (data.data || data) as NvidiaModel[];
  }

  async probeModel(modelId: string): Promise<ModelHealth> {
    const start = Date.now();
    try {
      await this.rateLimit();
      const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        timeout: 15000,
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { id: modelId, available: true, latency, status: 'available' };
      }
      if (res.status === 429) {
        return { id: modelId, available: true, latency, status: 'rate_limited' };
      }
      const body = await res.text().catch(() => '');
      return { id: modelId, available: false, latency, status: `http_${res.status}`, error: body.slice(0, 200) };
    } catch (err: any) {
      return { id: modelId, available: false, status: 'error', error: err.message };
    }
  }

  async probeModels(models: NvidiaModel[]): Promise<ModelHealth[]> {
    const results: ModelHealth[] = [];
    for (const m of models) {
      const health = await this.probeModel(m.id);
      results.push(health);
      process.stdout.write(health.available ? '+' : '.');
    }
    process.stdout.write('\n');
    return results;
  }

  async chatCompletion(req: ChatRequest): Promise<Response> {
    await this.rateLimit();
    const body: any = {
      model: req.model || config.defaultModel,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      top_p: req.top_p ?? 0.95,
      max_tokens: req.max_tokens ?? 4096,
      stream: req.stream ?? false,
    };
    if (req.stop) body.stop = req.stop;
    if (req.presence_penalty !== undefined) body.presence_penalty = req.presence_penalty;
    if (req.frequency_penalty !== undefined) body.frequency_penalty = req.frequency_penalty;
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;

    return fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      timeout: 120000,
    });
  }
}
