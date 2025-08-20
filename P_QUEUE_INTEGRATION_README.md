# P-Queue Integration for LLM and RAG Concurrency Control

This module integrates [p-queue](https://github.com/sindresorhus/p-queue) to provide intelligent concurrency control for LLM chat and RAG operations, preventing API rate limiting and managing resource usage efficiently.

## 🎯 Overview

The p-queue integration provides:

- **Concurrency Control**: Limit simultaneous API requests to prevent rate limiting
- **Rate Limiting**: Control requests per time interval (e.g., per minute)
- **Priority Scheduling**: Prioritize critical operations over others
- **Queue Monitoring**: Real-time statistics and event tracking
- **Automatic Retry**: Built-in error handling and retry mechanisms
- **Provider Optimization**: Pre-configured settings for popular LLM providers

## 🚀 Features

### 1. LLM Service Concurrency Control

The `LlmClient` now uses p-queue for all chat operations:

```typescript
import { LlmClient } from './modules/services/llm.js';

const llm = new LlmClient({
  baseUrl: 'https://api.openai.com',
  apiKey: 'your-api-key',
  model: 'gpt-4',
  maxTokens: 2000,
  temperature: 0.1,
  // Queue configuration
  concurrency: 3,        // Max 3 concurrent requests
  intervalCap: 10,       // Max 10 requests per interval
  interval: 60000,       // Per minute (60 seconds)
  timeout: 30000,        // 30 second timeout per request
});

// Queue-aware chat operation
const response = await llm.chat({
  system: 'You are a helpful assistant',
  user: 'Hello, world!',
  priority: 1,           // High priority
  id: 'greeting-request' // Unique identifier
});
```

### 2. RAG Service Concurrency Control

The `RagClient` also uses p-queue for query operations:

```typescript
import { RagClient } from './modules/services/rag.js';

const rag = new RagClient({
  baseUrl: 'https://your-rag-service.com',
  apiKey: 'your-api-key',
  // Queue configuration
  concurrency: 5,        // Max 5 concurrent queries
  intervalCap: 20,       // Max 20 queries per interval
  interval: 60000,       // Per minute
  timeout: 15000,        // 15 second timeout
});

// Queue-aware RAG query
const results = await rag.query({
  query: 'Best practices for code review',
  tags: ['code-review', 'best-practices'],
  priority: 2,           // Medium priority
  id: 'code-review-query'
});
```

### 3. Pre-configured Provider Settings

Use optimized configurations for popular LLM providers:

```typescript
import { getOptimalLlmConfig } from './modules/services/queue-config.js';

// OpenAI GPT-4 optimized settings
const openaiConfig = getOptimalLlmConfig(
  {
    baseUrl: 'https://api.openai.com',
    apiKey: 'your-api-key',
    model: 'gpt-4',
    maxTokens: 2000,
    temperature: 0.1,
  },
  'openai',
  'gpt-4'
);

// Anthropic Claude optimized settings
const anthropicConfig = getOptimalLlmConfig(
  {
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'your-api-key',
    model: 'claude-3-sonnet',
    maxTokens: 2000,
    temperature: 0.1,
  },
  'anthropic',
  'claude-3'
);
```

## 🔧 Configuration Options

### Queue Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `concurrency` | number | 3 (LLM), 5 (RAG) | Maximum concurrent operations |
| `intervalCap` | number | 10 (LLM), 20 (RAG) | Maximum operations per interval |
| `interval` | number | 60000 | Interval in milliseconds (1 minute) |
| `timeout` | number | 30000 (LLM), 15000 (RAG) | Timeout per operation in milliseconds |

### Provider-Specific Defaults

#### OpenAI
- **GPT-4**: `concurrency: 3, intervalCap: 10, timeout: 30000`
- **GPT-3.5**: `concurrency: 5, intervalCap: 20, timeout: 20000`

#### Anthropic
- **Claude-3**: `concurrency: 2, intervalCap: 8, timeout: 45000`
- **Claude-2**: `concurrency: 3, intervalCap: 12, timeout: 40000`

#### RAG Services
- **Default**: `concurrency: 5, intervalCap: 20, timeout: 15000`
- **High Throughput**: `concurrency: 10, intervalCap: 50, timeout: 10000`
- **Conservative**: `concurrency: 2, intervalCap: 10, timeout: 30000`

## 📊 Queue Management

### Queue Statistics

Monitor queue performance in real-time:

```typescript
// Get current queue statistics
const stats = llm.getQueueStats();
console.log('Queue Status:', {
  size: stats.size,           // Items waiting in queue
  pending: stats.pending,     // Currently processing
  isPaused: stats.isPaused,  // Queue pause status
  concurrency: stats.concurrency // Current concurrency limit
});
```

### Queue Control

Manage queue operations:

```typescript
// Pause the queue (useful for rate limiting)
llm.pause();

// Resume the queue
llm.resume();

// Clear all pending requests
llm.clear();

// Wait for all operations to complete
await llm.waitForIdle();
```

### Event Monitoring

Listen to queue events for debugging and monitoring:

```typescript
// Queue automatically logs events, but you can add custom listeners
llm.queue.on('active', () => {
  console.log('Processing new request');
});

llm.queue.on('completed', (result) => {
  console.log('Request completed:', result);
});

llm.queue.on('error', (error) => {
  console.error('Request failed:', error);
});

llm.queue.on('idle', () => {
  console.log('All requests completed');
});
```

## 🎯 Priority and ID Management

### Priority Levels

Set priority for different operations:

```typescript
// High priority (processed first)
await llm.chat({
  system: 'Critical system prompt',
  user: 'Urgent request',
  priority: 10,
  id: 'critical-request'
});

// Low priority (processed last)
await llm.chat({
  system: 'Background task',
  user: 'Non-urgent request',
  priority: -5,
  id: 'background-task'
});
```

### Unique Identifiers

Track specific operations:

```typescript
const request = await llm.chat({
  system: 'Code review assistant',
  user: 'Review this code',
  id: 'code-review-001'
});

// Later, you can check if this specific request is still pending
const stats = llm.getQueueStats();
console.log('Code review request status:', stats);
```

## 🔄 Batch Operations

### RAG Batch Queries

Process multiple RAG queries with controlled concurrency:

```typescript
const queries = [
  { query: 'Error handling best practices', priority: 1, id: 'error-handling' },
  { query: 'Performance optimization', priority: 2, id: 'performance' },
  { query: 'Security considerations', priority: 3, id: 'security' },
];

const results = await rag.batchQuery(queries);
```

### LLM Batch Processing

Process multiple LLM requests efficiently:

```typescript
const requests = [
  {
    system: 'Code reviewer',
    user: 'Review function A',
    priority: 1,
    id: 'review-a'
  },
  {
    system: 'Code reviewer',
    user: 'Review function B',
    priority: 2,
    id: 'review-b'
  },
];

// Process with controlled concurrency
const responses = await Promise.all(
  requests.map(req => llm.chat(req))
);
```

## 🛠️ Configuration Validation

Validate your queue configuration before deployment:

```typescript
import { validateQueueConfig } from './modules/services/queue-config.js';

const config = {
  concurrency: 10,
  intervalCap: 50,
  interval: 60000,
  timeout: 5000,
};

const validation = validateQueueConfig(config);
if (!validation.isValid) {
  console.warn('Configuration issues:', validation.warnings);
  console.log('Suggestions:', validation.suggestions);
}
```

## 🌍 Environment-Specific Configurations

Use different settings for different environments:

```typescript
import { getEnvironmentConfig } from './modules/services/queue-config.js';

// Development: Conservative settings
const devConfig = getEnvironmentConfig('development');

// Staging: Balanced settings
const stagingConfig = getEnvironmentConfig('staging');

// Production: Optimized settings
const prodConfig = getEnvironmentConfig('production');
```

## 📈 Performance Optimization

### Calculate Optimal Settings

Automatically calculate optimal settings based on API limits:

```typescript
import { calculateOptimalSettings } from './modules/services/queue-config.js';

const apiLimits = {
  requestsPerMinute: 100,
  maxConcurrent: 5,
};

const optimalSettings = calculateOptimalSettings(apiLimits);
console.log('Optimal settings:', optimalSettings);
// Output: { concurrency: 5, intervalCap: 80, interval: 60000 }
```

### Monitoring and Tuning

1. **Start Conservative**: Begin with lower concurrency and increase gradually
2. **Monitor Performance**: Watch queue statistics and error rates
3. **Adjust Settings**: Fine-tune based on API provider feedback
4. **Test Limits**: Find the optimal balance between speed and stability

## 🔍 Integration with Code Review

The p-queue integration is fully integrated into the code review system:

```typescript
// In reviewer.ts, queue operations are automatically managed
const verification = await verifyComments(refined, {
  repoDir: workingDirectory,
  definitionsByFile: defsByFile,
  minSuggestionChars: 16,
  enableFuzzyMatching: true,
  fuzzyMatchOptions: {
    minConfidence: 0.7,
    maxContextMatches: 5,
    includeContext: true,
  },
});

// Wait for all queued operations to complete
if (llm) {
  await llm.waitForIdle();
  console.log('LLM queue completed. Final stats:', llm.getQueueStats());
}

if (rag) {
  await rag.waitForIdle();
  console.log('RAG queue completed. Final stats:', rag.getQueueStats());
}
```

## 🧪 Testing and Examples

Run the demo script to see p-queue in action:

```bash
pnpm exec tsx src/examples/p-queue-demo.ts
```

The demo shows:
- Provider-specific configurations
- Queue management operations
- Priority and ID management
- Configuration validation
- Environment-specific settings

## 🚀 Benefits

### For Developers
- **Predictable Performance**: Consistent response times with controlled concurrency
- **Better Error Handling**: Automatic retry and queue management
- **Resource Optimization**: Efficient use of API quotas and rate limits
- **Debugging Support**: Comprehensive logging and monitoring

### For Operations
- **Rate Limit Prevention**: Automatic throttling to stay within API limits
- **Scalability**: Handle high-volume operations without overwhelming APIs
- **Monitoring**: Real-time visibility into queue performance
- **Reliability**: Reduced failures due to API rate limiting

### For Business
- **Cost Control**: Optimize API usage and reduce unnecessary retries
- **User Experience**: Consistent response times and fewer failures
- **Compliance**: Stay within API provider terms and limits
- **Scalability**: Support growth without API-related bottlenecks

## 🔮 Future Enhancements

- **Dynamic Scaling**: Automatically adjust concurrency based on API response times
- **Circuit Breaker**: Implement circuit breaker pattern for API failures
- **Metrics Export**: Export queue metrics to monitoring systems
- **Load Balancing**: Distribute requests across multiple API endpoints
- **Machine Learning**: Use ML to optimize queue parameters

## 📚 Dependencies

- **p-queue**: Promise queue with concurrency control
- **TypeScript**: Full type safety and IntelliSense support
- **Node.js**: Built on Node.js streams and promises

## 🤝 Contributing

The p-queue integration is designed to be extensible. You can:

- Add new provider configurations
- Implement custom queue strategies
- Create specialized monitoring tools
- Add new validation rules
- Implement advanced scheduling algorithms

## 📄 License

This module is part of the AI Code Review project and follows the same licensing terms.

---

**Ready to optimize your LLM and RAG operations with intelligent concurrency control! 🚀**
