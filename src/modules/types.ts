import { z } from 'zod';

export const ReviewCommentSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  severity: z.enum(['critical', 'major', 'minor', 'nit']),
  smell: z.string(),
  rationale: z.string(),
  suggestion: z.string(),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

// Legacy types for backward compatibility
export type ParsedHunk = {
  filePath: string;
  targetStart: number;
  targetEnd: number;
  addedLines: Array<{ lineNumber: number; content: string }>;
};

export type ParsedDiff = {
  files: Array<{
    path: string;
    status: 'A' | 'M' | 'D' | 'R';
    hunks: ParsedHunk[];
  }>;
  summary: { added: number; deleted: number; filesChanged: number };
};

// Enhanced types that align with parse-diff output
export type DiffChangeType = 'normal' | 'add' | 'del';

export type DiffChange =
  | {
      type: 'normal';
      ln1: number;
      ln2: number;
      normal: true;
      content: string;
    }
  | {
      type: 'add';
      add: true;
      ln: number;
      content: string;
    }
  | {
      type: 'del';
      del: true;
      ln: number;
      content: string;
    };

export type DiffChunk = {
  content: string;
  changes: DiffChange[];
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
};

export type DiffFile = {
  chunks: DiffChunk[];
  deletions: number;
  additions: number;
  from?: string;
  to?: string;
  oldMode?: string;
  newMode?: string;
  index?: string[];
  deleted?: boolean;
  new?: boolean;
};

export type EnhancedParsedDiff = {
  files: Array<{
    path: string;
    status: 'A' | 'M' | 'D' | 'R';
    rawFile: DiffFile;
    chunks: DiffChunk[];
    additions: number;
    deletions: number;
  }>;
  summary: {
    added: number;
    deleted: number;
    filesChanged: number;
    totalAdditions: number;
    totalDeletions: number;
  };
};
