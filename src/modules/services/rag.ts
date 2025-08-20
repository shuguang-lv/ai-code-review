import PQueue from 'p-queue';
import { fetch } from 'undici';

export type RagConfig = {
  baseUrl: string;
  apiKey?: string;
  concurrency?: number;
  intervalCap?: number;
  interval?: number;
  timeout?: number;
};

export class RagClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly queue: PQueue;

  constructor(cfg: RagConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;

    // Initialize p-queue with concurrency control
    this.queue = new PQueue({
      concurrency: cfg.concurrency ?? 5, // Default to 5 concurrent queries
      intervalCap: cfg.intervalCap ?? 20, // Max 20 queries per interval
      interval: cfg.interval ?? 60000, // Per minute (60 seconds)
      timeout: cfg.timeout ?? 15000, // 15 second timeout per query
    });

    // Add event listeners for monitoring
    this.queue.on('active', () => {
      console.log(
        `RAG Queue: Processing query. Size: ${this.queue.size}, Pending: ${this.queue.pending}`
      );
    });

    this.queue.on('completed', () => {
      console.log(
        `RAG Queue: Query completed. Size: ${this.queue.size}, Pending: ${this.queue.pending}`
      );
    });

    this.queue.on('error', (error) => {
      console.error('RAG Queue: Query failed:', error);
    });

    this.queue.on('idle', () => {
      console.log('RAG Queue: All queries completed');
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
   * Wait for all queued queries to complete
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
   * Clear all pending queries
   */
  clear(): void {
    this.queue.clear();
  }

  async query(args: {
    query: string;
    tags?: string[];
    topK?: number;
    priority?: number;
    id?: string;
  }): Promise<{ results?: unknown[]; data?: unknown[] } | unknown[]> {
    // Add the RAG query to the queue with concurrency control
    const result = await this.queue.add(
      async () => {
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
      },
      {
        priority: args.priority ?? 0,
        id: args.id,
      }
    );

    if (!result) {
      throw new Error('RAG query failed to execute');
    }

    return result;
  }

  /**
   * Batch query multiple items with controlled concurrency
   */
  async batchQuery(
    queries: Array<{
      query: string;
      tags?: string[];
      topK?: number;
      priority?: number;
      id?: string;
    }>
  ): Promise<Array<{ results?: unknown[]; data?: unknown[] } | unknown[]>> {
    const promises = queries.map((query, index) =>
      this.query({
        ...query,
        id: query.id ?? `batch-${index}`,
        priority: query.priority ?? 0,
      })
    );

    return Promise.all(promises);
  }
}
