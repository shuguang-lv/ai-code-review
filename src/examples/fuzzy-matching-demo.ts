#!/usr/bin/env tsx

import type { ReviewComment } from '../modules/types.js';
import { CodePatternMatcher } from '../modules/verification/pattern-matcher.js';

/**
 * Demo script showing how to use fuzzy matching to improve AI comment targeting
 */
async function demoFuzzyMatching() {
  console.log('🔍 Fuzzy Matching Demo for AI Code Review Comments\n');

  // Sample AI-generated comments that might have targeting issues
  const sampleComments: ReviewComment[] = [
    {
      file: 'src/modules/core/reviewer.ts',
      line: 150,
      severity: 'major',
      smell: 'Missing error handling',
      rationale: 'The function lacks proper error handling for the API call',
      suggestion: 'Add try-catch block around the API call and handle potential errors gracefully',
    },
    {
      file: 'src/modules/services/llm.ts',
      line: 80,
      severity: 'minor',
      smell: 'Type safety issue',
      rationale: 'The response type could be more specific than any',
      suggestion: 'Define a proper interface for the LLM response instead of using any type',
    },
    {
      file: 'src/modules/analysis/code-graph.ts',
      line: 45,
      severity: 'nit',
      smell: 'Code readability',
      rationale: 'This function is quite long and could benefit from refactoring',
      suggestion: 'Break down the function into smaller, more focused functions',
    },
  ];

  console.log('📝 Sample AI Comments:');
  sampleComments.forEach((comment, index) => {
    console.log(`${index + 1}. ${comment.smell} (${comment.severity})`);
    console.log(`   File: ${comment.file}:${comment.line}`);
    console.log(`   Rationale: ${comment.rationale}`);
    console.log(`   Suggestion: ${comment.suggestion}\n`);
  });

  // Initialize fuzzy matchers
  // const fuzzyMatcher = new FuzzyCodeMatcher({
  //   minConfidence: 0.6,
  //   maxContextMatches: 3,
  //   includeContext: true,
  // });

  const patternMatcher = new CodePatternMatcher();

  console.log('🎯 Pattern Matching Analysis:');
  for (const comment of sampleComments) {
    const patternMatch = patternMatcher.findBestPattern(comment);
    if (patternMatch) {
      console.log(`\nComment: "${comment.smell}"`);
      console.log(
        `Best Pattern: ${patternMatch.pattern.pattern} (${(patternMatch.confidence * 100).toFixed(1)}% match)`
      );
      console.log(`Description: ${patternMatch.pattern.description}`);
      console.log(`Severity: ${patternMatch.pattern.severity}`);

      // Get pattern suggestions
      const suggestions = patternMatcher.getPatternSuggestions(comment);
      if (suggestions.length > 0) {
        console.log('Additional suggestions:');
        suggestions.slice(0, 2).forEach((s) => {
          console.log(`  - ${s.pattern.pattern}: ${s.suggestions.join(', ')}`);
        });
      }
    }
  }

  console.log('\n🔍 Fuzzy Location Matching:');
  console.log('(This would require actual file contents to demonstrate)');
  console.log('The FuzzyCodeMatcher can:');
  console.log('- Find the most likely location for misplaced comments');
  console.log('- Suggest better file/line locations based on content similarity');
  console.log('- Detect when comments are targeting the wrong code section');
  console.log('- Provide confidence scores for location suggestions');

  console.log('\n💡 Usage in Code Review:');
  console.log('1. Load file contents into the FuzzyCodeMatcher');
  console.log('2. Run fuzzy matching on AI-generated comments');
  console.log('3. Identify potentially misplaced comments');
  console.log('4. Suggest better locations with confidence scores');
  console.log('5. Use pattern matching to categorize and validate comments');

  console.log('\n🚀 Benefits:');
  console.log('- Improved accuracy of AI comment targeting');
  console.log('- Reduced false positives in code reviews');
  console.log('- Better context for developers reviewing code');
  console.log('- Automated validation of comment relevance');
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demoFuzzyMatching().catch(console.error);
}
