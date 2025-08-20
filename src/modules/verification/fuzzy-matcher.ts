import * as fuzzball from 'fuzzball';
import type { ReviewComment } from '../types.js';

export type FuzzyMatchResult = {
  comment: ReviewComment;
  confidence: number;
  suggestedLocation?: {
    file: string;
    line: number;
    confidence: number;
  };
  contextMatches: Array<{
    file: string;
    line: number;
    content: string;
    score: number;
  }>;
};

export type FuzzyMatchOptions = {
  minConfidence: number;
  maxContextMatches: number;
  includeContext: boolean;
};

/**
 * Uses fuzzy string matching to find the most likely location of code that AI comments are targeting
 */
export class FuzzyCodeMatcher {
  private fileContents: Map<string, string[]> = new Map();
  private fileSymbols: Map<string, Array<{ name: string; line: number; content: string }>> =
    new Map();

  constructor(
    private options: FuzzyMatchOptions = {
      minConfidence: 0.6,
      maxContextMatches: 5,
      includeContext: true,
    }
  ) {}

  /**
   * Load file contents and symbols for fuzzy matching
   */
  async loadFiles(
    repoDir: string,
    files: string[],
    definitionsByFile?: Record<string, Array<{ name: string; line: number; content?: string }>>
  ): Promise<void> {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');

    for (const file of files) {
      try {
        const fullPath = path.join(repoDir, file);
        const content = await readFile(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        this.fileContents.set(file, lines);

        // Extract symbols if definitions are provided
        if (definitionsByFile?.[file]) {
          const symbols = definitionsByFile[file].map((def) => ({
            name: def.name,
            line: def.line,
            content: lines[def.line - 1] || '',
          }));
          this.fileSymbols.set(file, symbols);
        }
      } catch (error) {
        console.warn(`Failed to load file ${file}:`, error);
      }
    }
  }

  /**
   * Find the most likely location for a comment using fuzzy matching
   */
  findCommentLocation(comment: ReviewComment): FuzzyMatchResult {
    const contextMatches: Array<{
      file: string;
      line: number;
      content: string;
      score: number;
    }> = [];

    // Search through all loaded files for potential matches
    for (const [file, lines] of this.fileContents) {
      for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i];
        const lineNumber = i + 1;

        // Calculate similarity scores using different fuzzball methods
        const tokenSortRatio = fuzzball.token_sort_ratio(
          comment.rationale.toLowerCase(),
          lineContent.toLowerCase()
        );
        const partialRatio = fuzzball.partial_ratio(
          comment.rationale.toLowerCase(),
          lineContent.toLowerCase()
        );
        const tokenSetRatio = fuzzball.token_set_ratio(
          comment.rationale.toLowerCase(),
          lineContent.toLowerCase()
        );

        // Use the best score
        const score = Math.max(tokenSortRatio, partialRatio, tokenSetRatio);

        if (score >= this.options.minConfidence * 100) {
          contextMatches.push({
            file,
            line: lineNumber,
            content: lineContent,
            score,
          });
        }
      }
    }

    // Sort by score and limit results
    contextMatches.sort((a, b) => b.score - a.score);
    const topMatches = contextMatches.slice(0, this.options.maxContextMatches);

    // Find the best overall match
    const bestMatch = topMatches[0];
    const confidence = bestMatch ? bestMatch.score / 100 : 0;

    // Suggest a location if confidence is high enough
    let suggestedLocation: FuzzyMatchResult['suggestedLocation'] | undefined;
    if (confidence >= this.options.minConfidence && bestMatch) {
      suggestedLocation = {
        file: bestMatch.file,
        line: bestMatch.line,
        confidence,
      };
    }

    return {
      comment,
      confidence,
      suggestedLocation,
      contextMatches: this.options.includeContext ? topMatches : [],
    };
  }

  /**
   * Find comments that might be targeting the wrong location
   */
  findMisplacedComments(comments: ReviewComment[]): Array<{
    comment: ReviewComment;
    originalLocation: { file: string; line: number };
    suggestedLocation: { file: string; line: number; confidence: number };
    contextEvidence: string[];
  }> {
    const misplaced: Array<{
      comment: ReviewComment;
      originalLocation: { file: string; line: number };
      suggestedLocation: { file: string; line: number; confidence: number };
      contextEvidence: string[];
    }> = [];

    for (const comment of comments) {
      const match = this.findCommentLocation(comment);

      if (
        match.suggestedLocation &&
        match.confidence >= this.options.minConfidence &&
        (match.suggestedLocation.file !== comment.file ||
          Math.abs(match.suggestedLocation.line - comment.line) > 5)
      ) {
        const contextEvidence = match.contextMatches
          .filter((m) => m.score >= this.options.minConfidence * 100)
          .map((m) => `${m.file}:${m.line} (${m.score}% match): "${m.content.trim()}"`);

        misplaced.push({
          comment,
          originalLocation: { file: comment.file, line: comment.line },
          suggestedLocation: match.suggestedLocation,
          contextEvidence,
        });
      }
    }

    return misplaced;
  }

  /**
   * Enhance comment accuracy by suggesting better locations
   */
  enhanceCommentLocations(
    comments: ReviewComment[]
  ): Array<ReviewComment & { confidence?: number }> {
    return comments.map((comment) => {
      const match = this.findCommentLocation(comment);

      if (match.suggestedLocation && match.confidence >= this.options.minConfidence) {
        return {
          ...comment,
          file: match.suggestedLocation.file,
          line: match.suggestedLocation.line,
          confidence: match.confidence,
        };
      }

      return comment;
    });
  }

  /**
   * Get similarity score between two pieces of text
   */
  getSimilarity(text1: string, text2: string): number {
    const tokenSortRatio = fuzzball.token_sort_ratio(text1.toLowerCase(), text2.toLowerCase());
    const partialRatio = fuzzball.partial_ratio(text1.toLowerCase(), text2.toLowerCase());
    const tokenSetRatio = fuzzball.token_set_ratio(text1.toLowerCase(), text2.toLowerCase());

    return Math.max(tokenSortRatio, partialRatio, tokenSetRatio) / 100;
  }

  /**
   * Find the best matching line in a specific file
   */
  findBestLineInFile(
    file: string,
    searchText: string,
    minScore: number = 60
  ): Array<{ line: number; content: string; score: number }> {
    const lines = this.fileContents.get(file);
    if (!lines) return [];

    const matches: Array<{ line: number; content: string; score: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      const lineNumber = i + 1;

      const score = fuzzball.token_sort_ratio(searchText.toLowerCase(), lineContent.toLowerCase());

      if (score >= minScore) {
        matches.push({
          line: lineNumber,
          content: lineContent,
          score,
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }
}
