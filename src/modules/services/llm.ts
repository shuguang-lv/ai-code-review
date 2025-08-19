import { fetch } from "undici";

export class LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(cfg: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number }) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.maxTokens = cfg.maxTokens;
    this.temperature = cfg.temperature;
  }

  async chat(args: { system: string; user: string; model?: string; temperature?: number; maxTokens?: number }): Promise<{ content: string }> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: args.model ?? this.model,
        temperature: args.temperature ?? this.temperature,
        max_tokens: args.maxTokens ?? this.maxTokens,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user }
        ]
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM call failed: ${res.status} ${text}`);
    }
    const json: any = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';
    return { content };
  }

  async *chatStream(args: { system: string; user: string; model?: string; temperature?: number; maxTokens?: number }): AsyncGenerator<string, { content: string }, void> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: args.model ?? this.model,
        temperature: args.temperature ?? this.temperature,
        max_tokens: args.maxTokens ?? this.maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user }
        ]
      })
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`LLM stream failed: ${res.status} ${text}`);
    }

    const body: any = res.body as any;
    const reader = body.getReader ? body.getReader() : undefined;
    if (!reader) {
      const text = await res.text();
      return { content: text };
    }

    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('data:')) {
          const payload = t.slice('data:'.length).trim();
          if (payload === '[DONE]') break;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              full += delta;
              yield delta;
            }
          } catch {
            // ignore parse errors for keep-alive lines
          }
        }
      }
    }

    return { content: full };
  }
}
