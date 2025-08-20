import type { LlmConfig } from './llm.js';
import type { RagConfig } from './rag.js';

/**
 * Predefined queue configurations for different API providers and use cases
 */
export const QueueConfigs = {
  /**
   * OpenAI API configurations
   */
  openai: {
    gpt4: {
      concurrency: 3,
      intervalCap: 10,
      interval: 60000, // 1 minute
      timeout: 30000, // 30 seconds
    },
    gpt35: {
      concurrency: 5,
      intervalCap: 20,
      interval: 60000, // 1 minute
      timeout: 20000, // 20 seconds
    },
  },

  /**
   * Anthropic Claude API configurations
   */
  anthropic: {
    claude3: {
      concurrency: 2,
      intervalCap: 8,
      interval: 60000, // 1 minute
      timeout: 45000, // 45 seconds
    },
    claude2: {
      concurrency: 3,
      intervalCap: 12,
      interval: 60000, // 1 minute
      timeout: 40000, // 40 seconds
    },
  },

  /**
   * Local/self-hosted LLM configurations
   */
  local: {
    default: {
      concurrency: 2,
      intervalCap: 50,
      interval: 60000, // 1 minute
      timeout: 120000, // 2 minutes
    },
    highPerformance: {
      concurrency: 4,
      intervalCap: 100,
      interval: 60000, // 1 minute
      timeout: 60000, // 1 minute
    },
  },

  /**
   * RAG service configurations
   */
  rag: {
    default: {
      concurrency: 5,
      intervalCap: 20,
      interval: 60000, // 1 minute
      timeout: 15000, // 15 seconds
    },
    highThroughput: {
      concurrency: 10,
      intervalCap: 50,
      interval: 60000, // 1 minute
      timeout: 10000, // 10 seconds
    },
    conservative: {
      concurrency: 2,
      intervalCap: 10,
      interval: 60000, // 1 minute
      timeout: 30000, // 30 seconds
    },
  },
} as const;

/**
 * Get optimal queue configuration based on model and provider
 */
export function getOptimalLlmConfig(
  baseConfig: Omit<LlmConfig, 'concurrency' | 'intervalCap' | 'interval' | 'timeout'>,
  provider: 'openai' | 'anthropic' | 'local' = 'openai',
  modelType: string = 'default'
): LlmConfig {
  let config: {
    concurrency: number;
    intervalCap: number;
    interval: number;
    timeout: number;
  };

  if (provider === 'openai') {
    if (modelType.includes('gpt-4')) {
      config = QueueConfigs.openai.gpt4;
    } else {
      config = QueueConfigs.openai.gpt35;
    }
  } else if (provider === 'anthropic') {
    if (modelType.includes('claude-3')) {
      config = QueueConfigs.anthropic.claude3;
    } else {
      config = QueueConfigs.anthropic.claude2;
    }
  } else {
    config = QueueConfigs.local.default;
  }

  return {
    ...baseConfig,
    ...config,
  };
}

/**
 * Get optimal RAG configuration based on use case
 */
export function getOptimalRagConfig(
  baseConfig: Omit<RagConfig, 'concurrency' | 'intervalCap' | 'interval' | 'timeout'>,
  useCase: keyof typeof QueueConfigs.rag = 'default'
): RagConfig {
  const config = QueueConfigs.rag[useCase];

  return {
    ...baseConfig,
    ...config,
  };
}

/**
 * Validate queue configuration and provide warnings for potential issues
 */
export function validateQueueConfig(config: LlmConfig | RagConfig): {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let isValid = true;

  // Check concurrency settings
  if (config.concurrency && config.concurrency > 10) {
    warnings.push('High concurrency may cause API rate limiting');
    suggestions.push('Consider reducing concurrency to 5-8 for most APIs');
  }

  if (config.concurrency && config.concurrency < 1) {
    warnings.push('Concurrency must be at least 1');
    isValid = false;
  }

  // Check interval settings
  if (config.interval && config.interval < 1000) {
    warnings.push('Interval too short, may cause excessive API calls');
    suggestions.push('Use interval >= 1000ms (1 second)');
    isValid = false;
  }

  // Check timeout settings
  if (config.timeout && config.timeout < 5000) {
    warnings.push('Timeout too short, may cause premature failures');
    suggestions.push('Use timeout >= 5000ms (5 seconds)');
    isValid = false;
  }

  // Check intervalCap vs concurrency
  if (config.intervalCap && config.concurrency && config.intervalCap < config.concurrency) {
    warnings.push('intervalCap should be >= concurrency for optimal performance');
    suggestions.push('Set intervalCap to at least 2x concurrency');
  }

  return { isValid, warnings, suggestions };
}

/**
 * Get queue configuration for different environments
 */
export function getEnvironmentConfig(
  environment: 'development' | 'staging' | 'production' = 'development'
) {
  const baseConfig = {
    development: {
      concurrency: 2,
      intervalCap: 10,
      interval: 60000,
      timeout: 30000,
    },
    staging: {
      concurrency: 3,
      intervalCap: 15,
      interval: 60000,
      timeout: 25000,
    },
    production: {
      concurrency: 5,
      intervalCap: 25,
      interval: 60000,
      timeout: 20000,
    },
  };

  return baseConfig[environment];
}

/**
 * Calculate optimal queue settings based on API limits
 */
export function calculateOptimalSettings(apiLimits: {
  requestsPerMinute: number;
  requestsPerSecond?: number;
  maxConcurrent?: number;
}): {
  concurrency: number;
  intervalCap: number;
  interval: number;
} {
  const { requestsPerMinute, maxConcurrent } = apiLimits;

  // Calculate optimal concurrency
  const concurrency = Math.min(
    maxConcurrent ?? Math.ceil(requestsPerMinute / 60),
    10 // Cap at 10 for stability
  );

  // Calculate interval cap (requests per interval)
  const intervalCap = Math.floor(requestsPerMinute * 0.8); // Use 80% of limit for safety

  // Use 1 minute intervals for most APIs
  const interval = 60000;

  return {
    concurrency,
    intervalCap,
    interval,
  };
}
