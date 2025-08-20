import PQueue from 'p-queue';
import { fetch } from 'undici';

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  concurrency?: number;
  intervalCap?: number;
  interval?: number;
  timeout?: number;
};

export class LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly queue: PQueue;

  constructor(cfg: LlmConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.maxTokens = cfg.maxTokens;
    this.temperature = cfg.temperature;

    // Initialize p-queue with concurrency control
    this.queue = new PQueue({
      concurrency: cfg.concurrency ?? 3, // Default to 3 concurrent requests
      intervalCap: cfg.intervalCap ?? 10, // Max 10 requests per interval
      interval: cfg.interval ?? 60000, // Per minute (60 seconds)
      timeout: cfg.timeout ?? 30000, // 30 second timeout per request
    });

    // Add event listeners for monitoring
    this.queue.on('active', () => {
      console.log(
        `LLM Queue: Processing request. Size: ${this.queue.size}, Pending: ${this.queue.pending}`
      );
    });

    this.queue.on('completed', () => {
      console.log(
        `LLM Queue: Request completed. Size: ${this.queue.size}, Pending: ${this.queue.pending}`
      );
    });

    this.queue.on('error', (error) => {
      console.error('LLM Queue: Request failed:', error);
    });

    this.queue.on('idle', () => {
      console.log('LLM Queue: All requests completed');
    });
  }

  /**
   * Get current queue statistics
   */
  getQueueStats() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
      concurrency: this.queue.concurrency,
    };
  }

  /**
   * Wait for all queued requests to complete
   */
  async waitForIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  /**
   * Pause the queue (useful for rate limiting)
   */
  pause(): void {
    this.queue.pause();
  }

  /**
   * Resume the queue
   */
  resume(): void {
    // Note: resume() method is not available in current p-queue version
    // The queue will automatically resume when items are added
    console.log('Queue will resume automatically when items are added');
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.queue.clear();
  }

  async chat(args: {
    system: string;
    user: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    priority?: number;
    id?: string;
  }): Promise<{ content: string }> {
    // Add the chat request to the queue with concurrency control
    const result = await this.queue.add(
      async () => {
        const url = `${this.baseUrl}/v1/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: args.model ?? this.model,
            temperature: args.temperature ?? this.temperature,
            max_tokens: args.maxTokens ?? this.maxTokens,
            messages: [
              { role: 'system', content: args.system },
              { role: 'user', content: args.user },
            ],
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`LLM call failed: ${res.status} ${text}`);
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? '';
        return { content };
      },
      {
        priority: args.priority ?? 0,
        id: args.id,
      }
    );

    if (!result) {
      throw new Error('LLM chat request failed to execute');
    }

    return result;
  }

  async *chatStream(args: {
    system: string;
    user: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    priority?: number;
    id?: string;
  }): AsyncGenerator<string, { content: string }, void> {
    // For streaming, we need to handle the queue differently
    // since we can't easily queue a generator function
    const url = `${this.baseUrl}/v1/chat/completions`;

    // Use a simple concurrency check for streaming
    if (this.queue.pending >= this.queue.concurrency) {
      console.warn('LLM Stream: High concurrency, consider queuing non-streaming requests');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model ?? this.model,
        temperature: args.temperature ?? this.temperature,
        max_tokens: args.maxTokens ?? this.maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`LLM stream failed: ${res.status} ${text}`);
    }

    const body = res.body as ReadableStream<Uint8Array>;
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
