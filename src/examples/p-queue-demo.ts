#!/usr/bin/env tsx

import {
  calculateOptimalSettings,
  getEnvironmentConfig,
  getOptimalLlmConfig,
  getOptimalRagConfig,
  validateQueueConfig,
} from '../modules/services/queue-config.js';

/**
 * Demo script showing p-queue integration for concurrency control
 */
async function demoPQueueIntegration() {
  console.log('🚀 P-Queue Integration Demo for LLM and RAG Concurrency Control\n');

  // Example 1: OpenAI GPT-4 configuration
  console.log('📋 Example 1: OpenAI GPT-4 Configuration');
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

  console.log('OpenAI GPT-4 Config:', {
    concurrency: openaiConfig.concurrency,
    intervalCap: openaiConfig.intervalCap,
    interval: openaiConfig.interval,
    timeout: openaiConfig.timeout,
  });

  // Example 2: Anthropic Claude configuration
  console.log('\n📋 Example 2: Anthropic Claude Configuration');
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

  console.log('Anthropic Claude Config:', {
    concurrency: anthropicConfig.concurrency,
    intervalCap: anthropicConfig.intervalCap,
    interval: anthropicConfig.interval,
    timeout: anthropicConfig.timeout,
  });

  // Example 3: RAG configuration
  console.log('\n📋 Example 3: RAG Configuration');
  const ragConfig = getOptimalRagConfig(
    {
      baseUrl: 'https://your-rag-service.com',
      apiKey: 'your-api-key',
    },
    'highThroughput'
  );

  console.log('RAG High Throughput Config:', {
    concurrency: ragConfig.concurrency,
    intervalCap: ragConfig.intervalCap,
    interval: ragConfig.interval,
    timeout: ragConfig.timeout,
  });

  // Example 4: Custom API limits calculation
  console.log('\n📋 Example 4: Custom API Limits Calculation');
  const customLimits = calculateOptimalSettings({
    requestsPerMinute: 100,
    maxConcurrent: 5,
  });

  console.log('Custom API Limits Config:', customLimits);

  // Example 5: Configuration validation
  console.log('\n📋 Example 5: Configuration Validation');
  const validation = validateQueueConfig(openaiConfig);
  console.log('Validation Result:', {
    isValid: validation.isValid,
    warnings: validation.warnings,
    suggestions: validation.suggestions,
  });

  // Example 6: Simulated LLM operations with queue
  console.log('\n📋 Example 6: Simulated LLM Operations with Queue');

  // Create a mock LLM client for demonstration
  const mockLlmConfig = {
    baseUrl: 'https://mock-api.com',
    apiKey: 'mock-key',
    model: 'mock-model',
    maxTokens: 1000,
    temperature: 0.1,
    concurrency: 2,
    intervalCap: 5,
    interval: 60000,
    timeout: 10000,
  };

  console.log('Mock LLM Config:', {
    concurrency: mockLlmConfig.concurrency,
    intervalCap: mockLlmConfig.intervalCap,
  });

  // Example 7: Simulated RAG operations with queue
  console.log('\n📋 Example 7: Simulated RAG Operations with Queue');

  const mockRagConfig = {
    baseUrl: 'https://mock-rag.com',
    apiKey: 'mock-key',
    concurrency: 3,
    intervalCap: 8,
    interval: 60000,
    timeout: 8000,
  };

  console.log('Mock RAG Config:', {
    concurrency: mockRagConfig.concurrency,
    intervalCap: mockRagConfig.intervalCap,
  });

  // Example 8: Queue monitoring and management
  console.log('\n📋 Example 8: Queue Monitoring and Management');
  console.log('Available queue management methods:');
  console.log('- getQueueStats(): Get current queue statistics');
  console.log('- waitForIdle(): Wait for all queued operations to complete');
  console.log('- pause(): Pause the queue (useful for rate limiting)');
  console.log('- resume(): Resume the queue');
  console.log('- clear(): Clear all pending requests');

  // Example 9: Priority and ID management
  console.log('\n📋 Example 9: Priority and ID Management');
  console.log('Queue operations support:');
  console.log('- Priority levels (higher numbers = higher priority)');
  console.log('- Unique IDs for tracking specific operations');
  console.log('- Batch operations with controlled concurrency');

  // Example 10: Environment-specific configurations
  console.log('\n📋 Example 10: Environment-Specific Configurations');
  const envConfigs = ['development', 'staging', 'production'] as const;

  for (const env of envConfigs) {
    const config = getEnvironmentConfig(env);
    console.log(`${env} config:`, config);
  }

  console.log('\n🎯 Benefits of P-Queue Integration:');
  console.log('✅ Prevents API rate limiting');
  console.log('✅ Manages resource usage efficiently');
  console.log('✅ Provides priority-based scheduling');
  console.log('✅ Offers comprehensive monitoring');
  console.log('✅ Supports batch operations');
  console.log('✅ Configurable for different providers');
  console.log('✅ Automatic retry and error handling');
  console.log('✅ Queue statistics and debugging');

  console.log('\n💡 Usage Tips:');
  console.log('1. Start with conservative settings and adjust based on API limits');
  console.log('2. Monitor queue statistics during operation');
  console.log('3. Use priority levels for critical operations');
  console.log('4. Set appropriate timeouts based on API response times');
  console.log('5. Consider environment-specific configurations');
  console.log('6. Validate configurations before deployment');

  console.log('\n🚀 Ready to use p-queue for concurrency control!');
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demoPQueueIntegration().catch(console.error);
}
