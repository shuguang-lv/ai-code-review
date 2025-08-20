import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReviewComment } from '../types.js';
import { FuzzyCodeMatcher } from './fuzzy-matcher.js';

export type VerificationResult = {
  kept: ReviewComment[];
  dropped: Array<{ comment: ReviewComment; reasons: string[] }>;
  enhanced: Array<ReviewComment & { confidence?: number }>;
  misplaced: Array<{
    comment: ReviewComment;
    originalLocation: { file: string; line: number };
    suggestedLocation: { file: string; line: number; confidence: number };
    contextEvidence: string[];
  }>;
};

export type VerifyOptions = {
  repoDir: string;
  definitionsByFile?: Record<string, Array<{ name: string; line: number; content?: string }>>;
  minSuggestionChars?: number;
  enableFuzzyMatching?: boolean;
  fuzzyMatchOptions?: {
    minConfidence: number;
    maxContextMatches: number;
    includeContext: boolean;
  };
};

export const verifyComments = async (
  comments: ReviewComment[],
  opts: VerifyOptions
): Promise<VerificationResult> => {
  const kept: ReviewComment[] = [];
  const dropped: Array<{ comment: ReviewComment; reasons: string[] }> = [];
  const enhanced: Array<ReviewComment & { confidence?: number }> = [];
  const misplaced: Array<{
    comment: ReviewComment;
    originalLocation: { file: string; line: number };
    suggestedLocation: { file: string; line: number; confidence: number };
    contextEvidence: string[];
  }> = [];

  // Initialize fuzzy matcher if enabled
  let fuzzyMatcher: FuzzyCodeMatcher | undefined;
  if (opts.enableFuzzyMatching) {
    fuzzyMatcher = new FuzzyCodeMatcher(opts.fuzzyMatchOptions);

    // Get all unique files from comments
    const files = [...new Set(comments.map((c) => c.file))];

    // Load file contents for fuzzy matching
    await fuzzyMatcher.loadFiles(opts.repoDir, files, opts.definitionsByFile);

    // Find misplaced comments
    misplaced.push(...fuzzyMatcher.findMisplacedComments(comments));

    // Enhance comment locations
    enhanced.push(...fuzzyMatcher.enhanceCommentLocations(comments));
  }

  for (const c of comments) {
    const reasons: string[] = [];

    if (!(await fileAndLineExists(opts.repoDir, c.file, c.line))) {
      reasons.push('invalid-file-or-line');
    }

    if (!hasNonTrivialSuggestion(c, opts.minSuggestionChars ?? 12)) {
      reasons.push('suggestion-too-weak');
    }

    if (!referencesKnownSymbols(c, opts.definitionsByFile ?? {})) {
      reasons.push('no-known-symbols-referenced');
    }

    if (isDuplicateAgainst(kept, c)) {
      reasons.push('duplicate-comment');
    }

    // Use fuzzy matching to improve duplicate detection
    if (fuzzyMatcher && reasons.length === 0) {
      const fuzzyMatch = fuzzyMatcher.findCommentLocation(c);
      if (fuzzyMatch.confidence > 0.9) {
        // Check if this comment is too similar to existing ones using fuzzy matching
        const isFuzzyDuplicate = kept.some(
          (k) => fuzzyMatcher.getSimilarity(k.rationale, c.rationale) > 0.85
        );
        if (isFuzzyDuplicate) {
          reasons.push('fuzzy-duplicate-comment');
        }
      }
    }

    if (reasons.length === 0) {
      kept.push(c);
    } else {
      dropped.push({ comment: c, reasons });
    }
  }

  return { kept, dropped, enhanced, misplaced };
};

const fileAndLineExists = async (repoDir: string, rel: string, line: number) => {
  try {
    const full = path.join(repoDir, rel);
    const text = await readFile(full, 'utf8');
    const lines = text.split(/\r?\n/);
    return line >= 1 && line <= lines.length;
  } catch {
    return false;
  }
};

const hasNonTrivialSuggestion = (c: ReviewComment, minChars: number) => {
  const s = (c.suggestion ?? '').trim();
  if (s.length < minChars) return false;
  const generic = [/consider refactoring/i, /improve readability/i, /add tests?/i];
  return !generic.some((re) => re.test(s));
};

const referencesKnownSymbols = (
  c: ReviewComment,
  defsByFile: Record<string, Array<{ name: string }>>
) => {
  const defs = defsByFile[c.file] ?? [];
  if (defs.length === 0) return true; // do not over-filter when we have no defs
  const content = `${c.rationale}\n${c.suggestion}`;
  return defs.some((d) =>
    new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(d.name)}([^A-Za-z0-9_]|$)`).test(content)
  );
};

const isDuplicateAgainst = (kept: ReviewComment[], c: ReviewComment) => {
  return kept.some(
    (k) => k.file === c.file && k.line === c.line && similarity(k.rationale, c.rationale) > 0.9
  );
};

const similarity = (a: string, b: string) => {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const intersection = new Set(na.split(' ').filter((w) => nb.includes(w)));
  return intersection.size / Math.max(na.split(' ').length, 1);
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
