import * as fuzzball from 'fuzzball';
import type { ReviewComment } from '../types.js';

export type CodePattern = {
  pattern: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'nit';
  examples: string[];
};

export type PatternMatch = {
  pattern: CodePattern;
  comment: ReviewComment;
  confidence: number;
  matchedLines: Array<{
    file: string;
    line: number;
    content: string;
    score: number;
  }>;
};

/**
 * Matches AI comments to specific code patterns using fuzzy string matching
 */
export class CodePatternMatcher {
  private patterns: CodePattern[] = [];

  constructor() {
    this.initializeCommonPatterns();
  }

  /**
   * Initialize common code patterns that AI comments often target
   */
  private initializeCommonPatterns(): void {
    this.patterns = [
      {
        pattern: 'error handling',
        description: 'Missing or inadequate error handling',
        severity: 'major',
        examples: ['try-catch blocks', 'error logging', 'graceful degradation'],
      },
      {
        pattern: 'null check',
        description: 'Missing null/undefined checks',
        severity: 'major',
        examples: ['null guard', 'optional chaining', 'default values'],
      },
      {
        pattern: 'type safety',
        description: 'Type safety issues or missing type annotations',
        severity: 'minor',
        examples: ['any type', 'type assertions', 'interface compliance'],
      },
      {
        pattern: 'performance',
        description: 'Performance optimization opportunities',
        severity: 'minor',
        examples: ['loop optimization', 'memory usage', 'algorithm efficiency'],
      },
      {
        pattern: 'security',
        description: 'Security vulnerabilities or best practices',
        severity: 'critical',
        examples: ['input validation', 'authentication', 'authorization'],
      },
      {
        pattern: 'readability',
        description: 'Code readability and maintainability',
        severity: 'nit',
        examples: ['variable naming', 'function length', 'code organization'],
      },
      {
        pattern: 'testing',
        description: 'Missing or inadequate tests',
        severity: 'minor',
        examples: ['unit tests', 'integration tests', 'test coverage'],
      },
      {
        pattern: 'documentation',
        description: 'Missing or unclear documentation',
        severity: 'nit',
        examples: ['JSDoc comments', 'README updates', 'API documentation'],
      },
    ];
  }

  /**
   * Add custom patterns for specific project needs
   */
  addPattern(pattern: CodePattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Find the best matching pattern for a comment
   */
  findBestPattern(comment: ReviewComment): PatternMatch | null {
    let bestMatch: PatternMatch | null = null;
    let bestScore = 0;

    for (const pattern of this.patterns) {
      // Calculate similarity between comment content and pattern
      const rationaleScore = fuzzball.token_sort_ratio(
        comment.rationale.toLowerCase(),
        pattern.pattern.toLowerCase()
      );

      const suggestionScore = fuzzball.token_sort_ratio(
        comment.suggestion.toLowerCase(),
        pattern.pattern.toLowerCase()
      );

      // Combine scores with rationale having higher weight
      const combinedScore = rationaleScore * 0.7 + suggestionScore * 0.3;

      if (combinedScore > bestScore && combinedScore >= 60) {
        bestScore = combinedScore;
        bestMatch = {
          pattern,
          comment,
          confidence: combinedScore / 100,
          matchedLines: [],
        };
      }
    }

    return bestMatch;
  }

  /**
   * Match comment to specific code lines using pattern context
   */
  matchCommentToCode(
    comment: ReviewComment,
    fileContent: string[],
    minScore: number = 60
  ): Array<{ line: number; content: string; score: number; reason: string }> {
    const matches: Array<{ line: number; content: string; score: number; reason: string }> = [];

    // Extract key terms from the comment
    const commentTerms = this.extractKeyTerms(`${comment.rationale} ${comment.suggestion}`);

    for (let i = 0; i < fileContent.length; i++) {
      const lineContent = fileContent[i];
      const lineNumber = i + 1;

      let bestScore = 0;
      let bestReason = '';

      // Check each term against the line
      for (const term of commentTerms) {
        const score = fuzzball.token_sort_ratio(term.toLowerCase(), lineContent.toLowerCase());

        if (score > bestScore) {
          bestScore = score;
          bestReason = `Matches term: "${term}"`;
        }
      }

      // Also check the full comment against the line
      const fullCommentScore = fuzzball.token_sort_ratio(
        comment.rationale.toLowerCase(),
        lineContent.toLowerCase()
      );

      if (fullCommentScore > bestScore) {
        bestScore = fullCommentScore;
        bestReason = 'Matches comment rationale';
      }

      if (bestScore >= minScore) {
        matches.push({
          line: lineNumber,
          content: lineContent,
          score: bestScore,
          reason: bestReason,
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Extract key terms from text for pattern matching
   */
  private extractKeyTerms(text: string): string[] {
    // Remove common words and extract meaningful terms
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'mine',
      'yours',
      'hers',
      'ours',
      'theirs',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word))
      .slice(0, 10); // Limit to top 10 terms
  }

  /**
   * Get pattern suggestions for improving comment accuracy
   */
  getPatternSuggestions(comment: ReviewComment): Array<{
    pattern: CodePattern;
    confidence: number;
    suggestions: string[];
  }> {
    const suggestions: Array<{
      pattern: CodePattern;
      confidence: number;
      suggestions: string[];
    }> = [];

    for (const pattern of this.patterns) {
      const rationaleScore =
        fuzzball.token_sort_ratio(comment.rationale.toLowerCase(), pattern.pattern.toLowerCase()) /
        100;

      if (rationaleScore >= 0.3) {
        const patternSuggestions = pattern.examples.filter((example) => {
          const exampleScore =
            fuzzball.token_sort_ratio(comment.suggestion.toLowerCase(), example.toLowerCase()) /
            100;
          return exampleScore < 0.5; // Suggest examples not already mentioned
        });

        if (patternSuggestions.length > 0) {
          suggestions.push({
            pattern,
            confidence: rationaleScore,
            suggestions: patternSuggestions,
          });
        }
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Validate if a comment location makes sense given the pattern
   */
  validateCommentLocation(
    comment: ReviewComment,
    fileContent: string[],
    targetLine: number
  ): {
    isValid: boolean;
    confidence: number;
    suggestions: string[];
  } {
    const matches = this.matchCommentToCode(comment, fileContent, 40);

    // Check if the target line has any relevant matches
    const targetLineScore = matches
      .filter((m) => m.line === targetLine)
      .reduce((max, m) => Math.max(max, m.score), 0);

    const isValid = targetLineScore >= 50;
    const confidence = targetLineScore / 100;

    // Find better lines if the current one is poor
    const suggestions: string[] = [];
    if (!isValid && matches.length > 0) {
      const bestMatch = matches[0];
      suggestions.push(
        `Consider line ${bestMatch.line}: "${bestMatch.content.trim()}" (${bestMatch.score}% match)`
      );
    }

    return { isValid, confidence, suggestions };
  }
}
