import { fetch } from 'undici';

export class RagClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(cfg: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
  }

  async query(args: {
    query: string;
    tags?: string[];
    topK?: number;
  }): Promise<{ results?: unknown[]; data?: unknown[] } | unknown[]> {
    const url = `${this.baseUrl}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: args.query,
        tags: args.tags ?? [],
        topK: args.topK ?? 5,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RAG query failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<{ results?: unknown[]; data?: unknown[] } | unknown[]>;
  }
}
